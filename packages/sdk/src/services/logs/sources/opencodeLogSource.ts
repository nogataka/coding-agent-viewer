import { BaseExecutorLogSource, LineAccumulator } from './baseExecutorLogSource.js';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
import { Readable } from 'stream';
import type { NormalizedEntry, ActionType, FileChange } from '../executors/types.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import { watch, FSWatcher } from 'chokidar';
import { createHash } from 'node:crypto';
import { activeExecutionRegistry } from '../../execution/activeExecutionRegistry.js';
import { logger } from '../../../utils/logger.js';

class OpencodeSessionAccumulator implements LineAccumulator {
  private buffer: string[] = [];
  private processed = 0;

  push(line: string): string[] {
    const results: string[] = [];
    const hasBuffer = this.buffer.length > 0;
    const trimmed = line.trim();

    if (!hasBuffer && !trimmed) {
      return results;
    }

    if (!hasBuffer && trimmed && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      this.processed += 1;
      results.push(trimmed);
      return results;
    }

    this.buffer.push(line);
    const candidate = this.buffer.join('\n');

    if (this.isCompleteJson(candidate)) {
      this.processed += 1;
      results.push(candidate);
      this.buffer = [];
    }

    return results;
  }

  flush(): string[] {
    if (this.buffer.length === 0) {
      return [];
    }

    const candidate = this.buffer.join('\n');
    this.buffer = [];

    if (this.isCompleteJson(candidate)) {
      this.processed += 1;
      return [candidate];
    }

    const trimmed = candidate.trim();
    if (trimmed) {
      this.processed += 1;
      return [trimmed];
    }

    return [];
  }

  private isCompleteJson(candidate: string): boolean {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return false;
    }
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return false;
    }
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  get processedCount(): number {
    return this.processed;
  }
}

type SessionStreamState = {
  entryIndex: number;
  emittedKeys: Set<string>;
  knownMessageIds: Set<string>;
  finished: boolean;
  workspacePath: string;
  actualProjectId: string | null;
};

type MessageRecord = {
  id: string;
  metadata: any;
  created: number;
};

type PartRecord = {
  name: string;
  data: any;
  created: number;
  keySuffix: string;
  order: number;
};

/**
 * Opencode用ログソース
 * セッションファイル: ~/.local/share/opencode/storage/session/ 配下の .json ファイル
 */
export class OpencodeLogSource extends BaseExecutorLogSource {
  private readonly OPENCODE_STORAGE_DIR = path.join(
    os.homedir(),
    '.local',
    'share',
    'opencode',
    'storage'
  );
  private readonly SESSION_DIR = path.join(this.OPENCODE_STORAGE_DIR, 'session');

  private encodeProjectId(workspacePath: string): string {
    return Buffer.from(workspacePath).toString('base64url');
  }

  private decodeProjectId(projectId: string): string {
    try {
      return Buffer.from(projectId, 'base64url').toString('utf-8');
    } catch {
      return projectId;
    }
  }

  private toDate(value: unknown, fallback: Date): Date {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const millis = value > 1e12 ? value : value * 1000;
      return new Date(millis);
    }

    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed);
      }
    }

    return fallback;
  }

  private async readSessionMetadata(filePath: string) {
    try {
      const [raw, stats] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)]);

      const parsed = JSON.parse(raw);
      const sessionId =
        typeof parsed.id === 'string' && parsed.id.length > 0
          ? parsed.id
          : path.basename(filePath, '.json');
      const directory = typeof parsed.directory === 'string' ? parsed.directory : null;
      const title =
        typeof parsed.title === 'string' && parsed.title.trim().length > 0
          ? parsed.title.trim()
          : null;

      const createdAt = this.toDate(parsed?.time?.created, stats.birthtime);
      const updatedAt = this.toDate(parsed?.time?.updated, stats.mtime);

      return {
        sessionId,
        directory,
        title,
        createdAt,
        updatedAt,
        filePath,
        fileSize: stats.size
      };
    } catch (error) {
      return null;
    }
  }

  private async collectSessionMetadata(): Promise<
    Array<{
      sessionId: string;
      directory: string | null;
      title: string | null;
      createdAt: Date;
      updatedAt: Date;
      filePath: string;
      fileSize: number;
    }>
  > {
    const results: Array<{
      sessionId: string;
      directory: string | null;
      title: string | null;
      createdAt: Date;
      updatedAt: Date;
      filePath: string;
      fileSize: number;
    }> = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }

        const metadata = await this.readSessionMetadata(fullPath);
        if (metadata) {
          results.push(metadata);
        }
      }
    };

    await walk(this.SESSION_DIR);
    return results;
  }

  private async extractFirstUserMessage(sessionId: string): Promise<string | null> {
    const messagesDir = path.join(this.OPENCODE_STORAGE_DIR, 'message', sessionId);
    try {
      const messageFiles = await fs.readdir(messagesDir);
      const messageEntries = await Promise.all(
        messageFiles
          .filter((file) => file.endsWith('.json'))
          .map(async (file) => {
            const fullPath = path.join(messagesDir, file);
            const raw = await fs.readFile(fullPath, 'utf-8');
            const metadata = JSON.parse(raw);
            const created = this.toMillis(metadata?.time?.created);
            return { metadata, created };
          })
      );

      messageEntries.sort((a, b) => a.created - b.created);

      for (const entry of messageEntries) {
        const role = String(entry.metadata?.role ?? '').toLowerCase();
        if (role !== 'user') {
          continue;
        }

        const messageId = String(entry.metadata?.id ?? '');
        if (!messageId) {
          continue;
        }

        const partsDir = path.join(this.OPENCODE_STORAGE_DIR, 'part', messageId);
        let parts: Array<{ data: any; created: number; order: number }>;
        try {
          const partFiles = await fs.readdir(partsDir);
          parts = await Promise.all(
            partFiles.map(async (name, index) => {
              const full = path.join(partsDir, name);
              const rawPart = await fs.readFile(full, 'utf-8');
              const data = JSON.parse(rawPart);
              return {
                data,
                created: this.toMillis(data?.time?.created ?? entry.created),
                order: index
              };
            })
          );
          parts.sort((a, b) =>
            a.created === b.created ? a.order - b.order : a.created - b.created
          );
        } catch {
          parts = [];
        }

        const textFragments: string[] = [];
        for (const part of parts) {
          const type = part.data?.type;
          if ((type === 'text' || type === 'markdown') && typeof part.data?.text === 'string') {
            const cleaned = part.data.text.replace(/\s+/g, ' ').trim();
            if (cleaned) {
              textFragments.push(cleaned);
            }
          }
        }

        const combined = textFragments.join(' ').trim();
        if (combined) {
          return combined.slice(0, 200);
        }
      }
    } catch (error) {
      console.warn(
        `[OpencodeLogSource] Failed to extract first user message for ${sessionId}`,
        error
      );
    }

    return null;
  }

  getName(): string {
    return 'OPENCODE';
  }

  protected createLineAccumulator(): LineAccumulator {
    return new OpencodeSessionAccumulator();
  }

  protected async resolveSessionFilePath(
    _executionId: string,
    sessionId: string,
    _workingDir: string
  ): Promise<string | null> {
    if (!sessionId) return null;

    const metadata = await this.collectSessionMetadata();
    const match = metadata.find((item) => item.sessionId === sessionId);
    return match?.filePath ?? null;
  }

  protected parseSessionLine(line: string): any {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return {
        type: 'event_msg',
        payload: {
          type: 'diagnostic',
          message: trimmed
        }
      };
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return {
        type: 'event_msg',
        payload: {
          type: 'diagnostic',
          message: trimmed
        }
      };
    }
  }

  private emitNormalizedEntry(
    stream: Readable,
    state: SessionStreamState,
    entry: NormalizedEntry,
    dedupeKey: string
  ): void {
    if (!dedupeKey) {
      return;
    }
    if (state.emittedKeys.has(dedupeKey)) {
      return;
    }
    state.emittedKeys.add(dedupeKey);
    const patch = this.createPatch(entry, state.entryIndex);
    state.entryIndex += 1;
    stream.push(`event: json_patch\ndata: ${JSON.stringify([patch])}\n\n`);
  }

  private extractInlineMessageText(metadata: any): string | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    if (typeof metadata.text === 'string') {
      const trimmed = metadata.text.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    if (typeof metadata.content === 'string') {
      const trimmed = metadata.content.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    if (Array.isArray(metadata.content)) {
      const segments = metadata.content
        .map((segment: any) =>
          segment && typeof segment.text === 'string' ? segment.text.trim() : ''
        )
        .filter((segment: string) => segment.length > 0);
      if (segments.length > 0) {
        return segments.join(' ').trim();
      }
    }

    return null;
  }

  private async readMessageRecords(sessionId: string): Promise<MessageRecord[]> {
    const messagesDir = path.join(this.OPENCODE_STORAGE_DIR, 'message', sessionId);
    let entries: Dirent[];
    try {
      entries = await fs.readdir(messagesDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const records: MessageRecord[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(messagesDir, entry.name);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const metadata = JSON.parse(raw);
        const id =
          typeof metadata?.id === 'string' && metadata.id.length > 0
            ? metadata.id
            : entry.name.replace(/\.json$/, '');
        const created = this.toMillis(metadata?.time?.created);
        records.push({ id, metadata, created });
      } catch (error) {
        logger.warn(
          `[OpencodeLogSource] Failed to read message file ${filePath}:`,
          error
        );
      }
    }

    records.sort((a, b) => a.created - b.created);
    return records;
  }

  private async readPartRecords(messageId: string, fallbackCreated: number): Promise<PartRecord[]> {
    const partsDir = path.join(this.OPENCODE_STORAGE_DIR, 'part', messageId);
    let files: string[];
    try {
      files = await fs.readdir(partsDir);
    } catch {
      return [];
    }

    const parts: PartRecord[] = [];

    await Promise.all(
      files.map(async (name, index) => {
        const fullPath = path.join(partsDir, name);
        try {
          const raw = await fs.readFile(fullPath, 'utf-8');
          const data = JSON.parse(raw);
          const created = this.toMillis(data?.time?.created ?? fallbackCreated);
          const fingerprint = createHash('sha1')
            .update(`${name}:${JSON.stringify(data ?? {})}`)
            .digest('hex');

          parts.push({
            name,
            data,
            created,
            keySuffix: `${name}:${fingerprint}`,
            order: index
          });
        } catch (error) {
          logger.warn(
            `[OpencodeLogSource] Failed to read part file ${fullPath}:`,
            error
          );
        }
      })
    );

    parts.sort((a, b) => (a.created === b.created ? a.order - b.order : a.created - b.created));
    return parts;
  }

  private async emitEntriesForMessage(
    message: MessageRecord,
    stream: Readable,
    state: SessionStreamState,
    workspacePath: string
  ): Promise<void> {
    const msg = message.metadata;
    const messageId = message.id;
    if (!messageId) {
      return;
    }

    const parts = await this.readPartRecords(messageId, message.created);
    let textBuffer: string[] = [];

    const entryType =
      String(msg?.role ?? '').toLowerCase() === 'user'
        ? { type: 'user_message' as const }
        : { type: 'assistant_message' as const };

    const flushText = () => {
      if (textBuffer.length === 0) {
        return;
      }
      const combined = textBuffer.join('\n\n').trim();
      textBuffer = [];
      if (!combined) {
        return;
      }

      const entry: NormalizedEntry = {
        timestamp: null,
        entry_type: entryType,
        content: combined,
        metadata: msg
      };
      const dedupeKey = `message-text:${messageId}:${createHash('sha1')
        .update(combined)
        .digest('hex')}`;
      this.emitNormalizedEntry(stream, state, entry, dedupeKey);
    };

    for (const part of parts) {
      const type = part.data?.type;
      if (type === 'text' || type === 'markdown') {
        const text = typeof part.data?.text === 'string' ? part.data.text.trim() : '';
        if (text) {
          textBuffer.push(text);
        }
        continue;
      }

      if (type === 'tool') {
        flushText();
        const { entry, skip } = this.createToolEntryFromOpencodePart(part.data, workspacePath);
        if (!skip) {
          const dedupeKey = `message-tool:${messageId}:${part.keySuffix}`;
          this.emitNormalizedEntry(stream, state, entry, dedupeKey);
        }
        continue;
      }

      if (type === 'step-start' || type === 'step-finish') {
        flushText();
        const label = type === 'step-start' ? 'Step started' : 'Step finished';
        const entry: NormalizedEntry = {
          timestamp: null,
          entry_type: { type: 'system_message' },
          content: label,
          metadata: part.data
        };
        const dedupeKey = `message-step:${messageId}:${type}:${part.keySuffix}`;
        this.emitNormalizedEntry(stream, state, entry, dedupeKey);
        continue;
      }
    }

    if (parts.length === 0) {
      const inline = this.extractInlineMessageText(msg);
      if (inline) {
        textBuffer.push(inline);
      }
    }

    flushText();
  }

  private updateActualProjectId(state: SessionStreamState, sessionData?: any): void {
    if (state.workspacePath && state.workspacePath.trim().length > 0) {
      state.actualProjectId = this.encodeProjectId(state.workspacePath.trim());
      return;
    }

    const candidate = sessionData?.projectID;
    if (
      !state.actualProjectId &&
      typeof candidate === 'string' &&
      candidate.trim().length > 0
    ) {
      state.actualProjectId = candidate.trim();
    }
  }

  private async emitSessionEntries(
    sessionFilePath: string,
    sessionUuid: string,
    stream: Readable,
    state: SessionStreamState,
    reason: string
  ): Promise<void> {
    let sessionData: any = null;
    try {
      const raw = await fs.readFile(sessionFilePath, 'utf-8');
      sessionData = JSON.parse(raw);
      if (sessionData && typeof sessionData.directory === 'string') {
        state.workspacePath = sessionData.directory;
      }
      this.updateActualProjectId(state, sessionData);
    } catch (error) {
      logger.warn(
        `[OpencodeLogSource] Failed to read session file ${sessionFilePath} (${reason})`,
        error
      );
    }

    try {
      const messages = await this.readMessageRecords(sessionUuid);
      const seen = new Set<string>();
      for (const message of messages) {
        if (!message.id) {
          continue;
        }
        seen.add(message.id);
        await this.emitEntriesForMessage(message, stream, state, state.workspacePath);
      }
      state.knownMessageIds = seen;
    } catch (error) {
      logger.warn(
        `[OpencodeLogSource] Failed to process messages for ${sessionUuid} (${reason})`,
        error
      );
    }

    if (!state.finished && sessionData && this.isSessionMetadataFinished(sessionData)) {
      this.pushFinished(stream, state);
    }
  }

  private isSessionMetadataFinished(metadata: any): boolean {
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }

    const statusCandidates = [metadata.status, metadata.state, metadata?.summary?.status];
    for (const candidate of statusCandidates) {
      if (typeof candidate === 'string') {
        const normalized = candidate.toLowerCase();
        if (
          normalized.includes('finish') ||
          normalized.includes('complete') ||
          normalized === 'done'
        ) {
          return true;
        }
      }
    }

    const timeInfo = metadata.time;
    if (timeInfo && typeof timeInfo === 'object') {
      if (
        timeInfo.completed !== undefined ||
        timeInfo.finished !== undefined ||
        timeInfo.ended !== undefined
      ) {
        return true;
      }
    }

    return false;
  }

  private pushFinished(stream: Readable, state: SessionStreamState): void {
    if (state.finished) {
      return;
    }
    state.finished = true;
    stream.push(`event: finished\ndata: ${JSON.stringify({ message: 'Log stream ended' })}\n\n`);
    stream.push(null);
  }

  protected async streamCompletedSession(filePath: string): Promise<Readable> {
    const stream = new Readable({ read() {} });
    const state: SessionStreamState = {
      entryIndex: 0,
      emittedKeys: new Set<string>(),
      knownMessageIds: new Set<string>(),
      finished: false,
      workspacePath: '',
      actualProjectId: null
    };

    let sessionUuid = path.basename(filePath, '.json');
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(raw);
      if (typeof session?.id === 'string' && session.id.length > 0) {
        sessionUuid = session.id;
      }
      if (typeof session?.directory === 'string' && session.directory.length > 0) {
        state.workspacePath = session.directory;
      }
      this.updateActualProjectId(state, session);
    } catch (error) {
      logger.warn('[OpencodeLogSource] Failed to prime session metadata:', error);
    }

    try {
      await this.emitSessionEntries(filePath, sessionUuid, stream, state, 'completed-snapshot');
      if (!state.finished) {
        this.pushFinished(stream, state);
      }
    } catch (error) {
      logger.error('[OpencodeLogSource] Failed to stream completed session:', error);
      stream.push(
        `event: error\ndata: ${JSON.stringify({ error: 'Failed to read Opencode session' })}\n\n`
      );
      stream.push(null);
    }

    return stream;
  }

  protected async streamLiveSession(filePath: string): Promise<Readable> {
    const stream = new Readable({ read() {} });
    const state: SessionStreamState = {
      entryIndex: 0,
      emittedKeys: new Set<string>(),
      knownMessageIds: new Set<string>(),
      finished: false,
      workspacePath: '',
      actualProjectId: null
    };

    let sessionUuid = path.basename(filePath, '.json');

    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(raw);
      if (typeof session?.id === 'string' && session.id.length > 0) {
        sessionUuid = session.id;
      }
      if (typeof session?.directory === 'string' && session.directory.length > 0) {
        state.workspacePath = session.directory;
      }
      this.updateActualProjectId(state, session);
    } catch (error) {
      logger.warn('[OpencodeLogSource] Failed to read live session metadata:', error);
    }

    const isActive = (): boolean => {
      if (!state.actualProjectId || state.actualProjectId.trim().length === 0) {
        return true;
      }
      const composed = `OPENCODE:${state.actualProjectId}:${sessionUuid}`;
      return activeExecutionRegistry.isActive(composed);
    };

    await this.emitSessionEntries(filePath, sessionUuid, stream, state, 'live-initial');

    if (state.finished || !isActive()) {
      if (!state.finished) {
        this.pushFinished(stream, state);
      }
      return stream;
    }

    const watchers: FSWatcher[] = [];
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      for (const watcher of watchers) {
        try {
          watcher.close();
        } catch (error) {
          logger.warn('[OpencodeLogSource] Failed to close watcher:', error);
        }
      }
      watchers.length = 0;
    };

    let refreshChain = Promise.resolve();
    const enqueueRefresh = (reason: string) => {
      refreshChain = refreshChain
        .then(async () => {
          if (state.finished || cleanedUp) {
            return;
          }
          await this.emitSessionEntries(filePath, sessionUuid, stream, state, reason);
          if (!state.finished && !isActive()) {
            this.pushFinished(stream, state);
          }
          if (state.finished) {
            cleanup();
          }
        })
        .catch((error) => {
          logger.warn(
            `[OpencodeLogSource] Failed to refresh live session ${sessionUuid} (${reason}):`,
            error
          );
        });
      return refreshChain;
    };

    const messageDir = path.join(this.OPENCODE_STORAGE_DIR, 'message', sessionUuid);
    const partRoot = path.join(this.OPENCODE_STORAGE_DIR, 'part');

    await Promise.all([
      fs.mkdir(messageDir, { recursive: true }).catch(() => {}),
      fs.mkdir(partRoot, { recursive: true }).catch(() => {})
    ]);

    const watcherOptions = {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 75
      }
    } as const;

    const sessionWatcher = watch(filePath, watcherOptions);
    sessionWatcher.on('change', () => {
      if (!cleanedUp && !state.finished) {
        enqueueRefresh('session-change');
      }
    });
    sessionWatcher.on('error', (error) =>
      logger.warn('[OpencodeLogSource] Session watcher error:', error)
    );
    watchers.push(sessionWatcher);

    const messageWatcher = watch(messageDir, { ...watcherOptions, depth: 0 });
    messageWatcher.on('all', (eventName) => {
      if (!cleanedUp && !state.finished) {
        enqueueRefresh(`message-${eventName}`);
      }
    });
    messageWatcher.on('error', (error) =>
      logger.warn('[OpencodeLogSource] Message watcher error:', error)
    );
    watchers.push(messageWatcher);

    const partWatcher = watch(partRoot, { ...watcherOptions, depth: 1 });
    partWatcher.on('all', (_eventName, targetPath) => {
      if (cleanedUp || state.finished) {
        return;
      }
      const relative = path.relative(partRoot, targetPath);
      const [messageId] = relative.split(path.sep);
      if (state.knownMessageIds.has(messageId)) {
        enqueueRefresh('part-update');
      }
    });
    partWatcher.on('error', (error) =>
      logger.warn('[OpencodeLogSource] Part watcher error:', error)
    );
    watchers.push(partWatcher);

    const finalize = () => {
      cleanup();
    };

    stream.on('close', finalize);
    stream.on('end', finalize);

    return stream;
  }

  private createToolEntryFromOpencodePart(
    part: any,
    workspacePath: string
  ): { entry: NormalizedEntry; skip: boolean } {
    const tool = String(part?.tool ?? 'tool').toLowerCase();
    const state = part?.state ?? {};
    const input = state.input ?? {};
    const output = state.output ?? state.result ?? state.stdout ?? null;

    const makeEntry = (actionType: ActionType, content: string): NormalizedEntry => ({
      timestamp: null,
      entry_type: {
        type: 'tool_use',
        tool_name: tool,
        action_type: actionType
      },
      content,
      metadata: part
    });

    const relativePath = (value: unknown): string => {
      if (typeof value !== 'string') return 'workspace';
      if (!workspacePath) return value;
      if (value.startsWith(workspacePath)) {
        return value.substring(workspacePath.length).replace(/^\//, '') || '.';
      }
      return value;
    };

    switch (tool) {
      case 'read': {
        const pathValue = input.filePath ?? input.path;
        const rel = relativePath(pathValue);
        return {
          entry: makeEntry({ action: 'file_read', path: rel }, `\`${rel}\``),
          skip: false
        };
      }
      case 'write':
      case 'create_text_file': {
        const pathValue = input.filePath ?? input.path;
        const rel = relativePath(pathValue);
        const changes: FileChange[] = [
          {
            action: 'write',
            content: typeof input.content === 'string' ? input.content : ''
          }
        ];
        return {
          entry: makeEntry({ action: 'file_edit', path: rel, changes }, `\`${rel}\``),
          skip: false
        };
      }
      case 'edit': {
        const pathValue = input.filePath ?? input.path;
        const rel = relativePath(pathValue);
        const diff = typeof input.patch === 'string' ? input.patch : this.stringifyPayload(input);
        const changes: FileChange[] = [
          {
            action: 'edit',
            unified_diff: diff,
            has_line_numbers: false
          }
        ];
        return {
          entry: makeEntry({ action: 'file_edit', path: rel, changes }, `\`${rel}\``),
          skip: false
        };
      }
      case 'delete': {
        const pathValue = input.filePath ?? input.path;
        const rel = relativePath(pathValue);
        const changes: FileChange[] = [{ action: 'delete' }];
        return {
          entry: makeEntry({ action: 'file_edit', path: rel, changes }, `Delete \`${rel}\``),
          skip: false
        };
      }
      case 'shell': {
        const command = Array.isArray(input.command)
          ? input.command.join(' ')
          : input.command || input.cmd || 'shell';
        return {
          entry: makeEntry(
            {
              action: 'command_run',
              command,
              result: {
                output: typeof output === 'string' ? output : this.stringifyPayload(output)
              }
            },
            `\`${command}\``
          ),
          skip: false
        };
      }
      case 'glob': {
        const query = input.pattern ?? input.glob ?? '*';
        return {
          entry: makeEntry({ action: 'search', query }, `Find files: \`${query}\``),
          skip: false
        };
      }
      case 'grep': {
        const query = input.pattern ?? input.query ?? '';
        return {
          entry: makeEntry({ action: 'search', query }, `\`${query}\``),
          skip: false
        };
      }
      case 'todo': {
        const todos = Array.isArray(input.todos)
          ? input.todos.map((item: any) => ({
              content: item.content ?? '',
              status: item.status ?? 'PENDING',
              priority: item.priority ?? null
            }))
          : [];
        return {
          entry: makeEntry(
            {
              action: 'todo_management',
              todos,
              operation: input.operation ?? 'write'
            },
            'TODO list updated'
          ),
          skip: false
        };
      }
      case 'plan': {
        const plan =
          typeof input.plan === 'string' ? input.plan : this.stringifyPayload(input.plan ?? output);
        return {
          entry: makeEntry({ action: 'plan_presentation', plan }, 'Plan updated'),
          skip: false
        };
      }
      default: {
        const description = `Tool: ${tool}`;
        return {
          entry: makeEntry({ action: 'other', description }, description),
          skip: false
        };
      }
    }
  }

  private toMillis(value: unknown): number {
    if (typeof value === 'number') {
      return value > 1e12 ? value : value * 1000;
    }

    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return Date.now();
  }

  private toIso(value: number | null): string | null {
    if (!value) return null;
    try {
      return new Date(value).toISOString();
    } catch {
      return null;
    }
  }

  private createPatch(entry: NormalizedEntry, index: number) {
    return {
      op: 'add' as const,
      path: `/entries/${index}`,
      value: {
        type: 'NORMALIZED_ENTRY',
        content: entry
      }
    };
  }

  /**
   * プロジェクト一覧を取得
   * セッションメタデータの directory 単位でグルーピングする
   */
  async getProjectList(): Promise<ProjectInfo[]> {
    try {
      await fs.access(this.SESSION_DIR);
    } catch {
      return [];
    }

    const sessions = await this.collectSessionMetadata();
    const projects = new Map<string, ProjectInfo>();

    for (const session of sessions) {
      const directory = session.directory?.trim();
      if (!directory) {
        continue;
      }

      const projectId = this.encodeProjectId(directory);
      const name = path.basename(directory) || directory;

      const existing = projects.get(projectId);
      if (!existing) {
        projects.set(projectId, {
          id: projectId,
          name,
          git_repo_path: directory,
          created_at: session.createdAt,
          updated_at: session.updatedAt
        });
      } else {
        existing.created_at =
          session.createdAt < existing.created_at ? session.createdAt : existing.created_at;
        existing.updated_at =
          session.updatedAt > existing.updated_at ? session.updatedAt : existing.updated_at;
      }
    }

    return Array.from(projects.values()).sort(
      (a, b) => b.updated_at.getTime() - a.updated_at.getTime()
    );
  }

  /**
   * 指定プロジェクトのセッション一覧を取得
   */
  async getSessionList(projectId: string): Promise<SessionInfo[]> {
    try {
      await fs.access(this.SESSION_DIR);
    } catch (error) {
      console.error('[OpencodeLogSource] Session directory not found:', error);
      return [];
    }

    const targetDirectory = this.decodeProjectId(projectId).trim();
    const sessions = await this.collectSessionMetadata();

    const results: SessionInfo[] = [];

    for (const session of sessions) {
      if (session.directory?.trim() !== targetDirectory) {
        continue;
      }

      const firstUserMessage = await this.extractFirstUserMessage(session.sessionId);
      const normalizedFirstUserMessage = firstUserMessage
        ? firstUserMessage.replace(/\s+/g, ' ').trim()
        : undefined;

      const fallbackTitle = session.title || `Opencode ${session.sessionId.slice(0, 8)}`;
      const displayTitle =
        normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
          ? normalizedFirstUserMessage
          : fallbackTitle;

      results.push({
        id: session.sessionId,
        projectId,
        filePath: session.filePath,
        title: displayTitle,
        firstUserMessage: normalizedFirstUserMessage,
        status: 'completed' as const,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        fileSize: session.fileSize,
        workspacePath: targetDirectory
      });
    }

    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
