import { Readable } from 'stream';
import Database from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import {
  ActionType,
  CommandExitStatusType,
  CommandRunResult,
  FileChange,
  JsonPatchOperation,
  NormalizedEntry,
  TodoItem,
  ToolResultValueType
} from '../executors/types.js';
import { makePathRelative } from '../../../utils/path.js';
import { logger } from '../../../utils/logger.js';

type CursorJsonContentItem = {
  type: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  experimental_content?: Array<{ type: string; text?: string }>;
  signature?: string;
};

type CursorJsonPayload = {
  role?: string;
  id?: string;
  content?: CursorJsonContentItem[];
};

type ToolEntryState = {
  index: number;
  toolName: string;
  actionType: ActionType;
  content: string;
  metadata: unknown;
};

type DecodedBlob =
  | { kind: 'json'; payload: CursorJsonPayload; raw: string | null }
  | { kind: 'user_text'; text: string }
  | { kind: 'noop' };

const JSON_START_BYTES = new Set([0x7b, 0x5b]);

function isLikelyUtf8Text(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  try {
    buffer.toString('utf8');
    return true;
  } catch {
    return false;
  }
}

function decodeCursorBlob(data: Buffer): DecodedBlob {
  if (!data.length) {
    return { kind: 'noop' };
  }

  if (JSON_START_BYTES.has(data[0])) {
    try {
      const raw = data.toString('utf8');
      const payload = JSON.parse(raw) as CursorJsonPayload;
      return { kind: 'json', payload, raw };
    } catch {
      return { kind: 'noop' };
    }
  }

  let offset = 0;

  const readVarint = (): number => {
    let shift = 0n;
    let result = 0n;
    while (offset < data.length) {
      const byte = BigInt(data[offset++]);
      result |= (byte & 0x7fn) << shift;
      if (!(byte & 0x80n)) break;
      shift += 7n;
    }
    return Number(result);
  };

  let field1Text: string | null = null;

  while (offset < data.length) {
    const tag = readVarint();
    const fieldNumber = tag >> 3;
    const wireType = tag & 7;

    if (wireType === 2) {
      const length = readVarint();
      const slice = data.slice(offset, offset + length);
      offset += length;

      if (fieldNumber === 4) {
        try {
          const raw = slice.toString('utf8');
          const payload = JSON.parse(raw) as CursorJsonPayload;
          return { kind: 'json', payload, raw };
        } catch {
          continue;
        }
      }

      if (fieldNumber === 1 && field1Text === null && isLikelyUtf8Text(slice)) {
        field1Text = sanitizeText(slice.toString('utf8'));
      }
    } else if (wireType === 0) {
      readVarint();
    } else {
      break;
    }
  }

  if (field1Text && hasReadableCharacters(field1Text)) {
    return { kind: 'user_text', text: field1Text };
  }

  return { kind: 'noop' };
}

function createAddPatch(index: number, entry: NormalizedEntry): JsonPatchOperation {
  return {
    op: 'add',
    path: `/entries/${index}`,
    value: {
      type: 'NORMALIZED_ENTRY',
      content: entry
    }
  };
}

function createReplacePatch(index: number, entry: NormalizedEntry): JsonPatchOperation {
  return {
    op: 'replace',
    path: `/entries/${index}`,
    value: {
      type: 'NORMALIZED_ENTRY',
      content: entry
    }
  };
}

function parseShellResult(result: string): CommandRunResult {
  const exitMatch = result.match(/Finished with exit code\s+(-?\d+)/i);
  const stdoutMatch = result.match(/stdout:\s*([\s\S]*?)\n\n\nstderr:/i);
  const stderrMatch = result.match(/stderr:\s*([\s\S]*)$/i);

  const exitCode = exitMatch ? Number(exitMatch[1]) : undefined;
  const stdout = stdoutMatch ? stdoutMatch[1].trim() : undefined;
  const stderr = stderrMatch ? stderrMatch[1].trim() : undefined;

  const commandResult: CommandRunResult = {};
  if (exitCode !== undefined && Number.isFinite(exitCode)) {
    commandResult.exit_status = {
      type: CommandExitStatusType.EXIT_CODE,
      code: exitCode
    };
  } else {
    commandResult.exit_status = { type: CommandExitStatusType.SUCCESS, success: true };
  }

  if (stdout && stderr) {
    commandResult.output = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
  } else if (stdout) {
    commandResult.output = stdout;
  } else if (stderr) {
    commandResult.output = stderr;
  }

  return commandResult;
}

function stripWorkspaceTags(text: string): string {
  return text
    .replace(/<workspace_result[^>]*>/gi, '')
    .replace(/<\/workspace_result>/gi, '')
    .trim();
}

function buildToolEntry(
  toolName: string,
  args: Record<string, unknown>,
  workspacePath: string
): { toolLabel: string; actionType: ActionType; content: string } {
  const lower = toolName.toLowerCase();

  switch (lower) {
    case 'todowrite': {
      const todos = Array.isArray(args.todos) ? (args.todos as TodoItem[]) : [];
      return {
        toolLabel: 'Todo',
        actionType: {
          action: 'todo_management',
          todos,
          operation: args.merge ? 'merge' : 'write'
        },
        content: 'TODO list updated'
      };
    }
    case 'shell': {
      const command = Array.isArray(args.command)
        ? (args.command as string[]).join(' ')
        : ((args.command as string) ?? '');
      return {
        toolLabel: 'Bash',
        actionType: {
          action: 'command_run',
          command: command ?? ''
        },
        content: command ? `\`${command}\`` : 'Shell command'
      };
    }
    case 'grep': {
      const query = (args.pattern as string) ?? (args.regex as string) ?? '';
      return {
        toolLabel: 'Grep',
        actionType: {
          action: 'search',
          query: query ?? ''
        },
        content: query ? `\`${query}\`` : 'Search'
      };
    }
    case 'glob': {
      const pattern = (args.pattern as string) ?? '';
      return {
        toolLabel: 'Glob',
        actionType: {
          action: 'search',
          query: pattern ?? ''
        },
        content: pattern ? `Find files: \`${pattern}\`` : 'Find files'
      };
    }
    case 'read': {
      const fullPath = typeof args.path === 'string' ? args.path : '';
      const relative = fullPath ? makePathRelative(workspacePath, fullPath) : fullPath;
      return {
        toolLabel: 'Read',
        actionType: {
          action: 'file_read',
          path: relative ?? fullPath
        },
        content: relative ? `\`${relative}\`` : 'Read file'
      };
    }
    case 'applypatch': {
      const filePath = typeof args.file_path === 'string' ? args.file_path : '';
      const patch = typeof args.patch === 'string' ? args.patch : '';
      const relative = filePath ? makePathRelative(workspacePath, filePath) : filePath;
      const changes: FileChange[] = [
        {
          action: 'edit',
          unified_diff: patch,
          has_line_numbers: false
        }
      ];
      return {
        toolLabel: 'ApplyPatch',
        actionType: {
          action: 'file_edit',
          path: relative ?? filePath,
          changes
        },
        content: relative ? `\`${relative}\`` : 'Apply patch'
      };
    }
    default: {
      return {
        toolLabel: toolName,
        actionType: {
          action: 'tool',
          tool_name: toolName
        },
        content: toolName
      };
    }
  }
}

function extractTextFromCursorPayload(payload: CursorJsonPayload): string {
  if (!payload.content) {
    return '';
  }

  const parts = payload.content
    .map((item) => {
      if (typeof item.text === 'string') {
        return item.text;
      }
      if (typeof item.result === 'string') {
        return item.result;
      }
      if (item.experimental_content && Array.isArray(item.experimental_content)) {
        const experimentalText = item.experimental_content
          .map((exp) => (typeof exp.text === 'string' ? exp.text : ''))
          .filter(Boolean)
          .join('\n');
        if (experimentalText) {
          return experimentalText;
        }
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');

  return parts.replace(/\s+/g, ' ').trim();
}

function applyToolResult(
  state: ToolEntryState,
  item: CursorJsonContentItem
): NormalizedEntry | null {
  if (!item.toolName) {
    return null;
  }

  const baseMetadata =
    state.metadata && typeof state.metadata === 'object'
      ? (state.metadata as Record<string, unknown>)
      : {};

  const metadata = {
    ...baseMetadata,
    result: item.result,
    experimental_content: item.experimental_content
  };

  const entry: NormalizedEntry = {
    timestamp: null,
    entry_type: {
      type: 'tool_use',
      tool_name: state.toolName,
      action_type: state.actionType
    },
    content: state.content,
    metadata
  };

  switch (state.actionType.action) {
    case 'command_run': {
      const resultText = typeof item.result === 'string' ? item.result : '';
      entry.entry_type = {
        type: 'tool_use',
        tool_name: state.toolName,
        action_type: {
          action: 'command_run',
          command: state.actionType.command ?? '',
          result: resultText ? parseShellResult(resultText) : undefined
        }
      };
      break;
    }
    case 'tool': {
      const text = typeof item.result === 'string' ? stripWorkspaceTags(item.result) : '';
      entry.entry_type = {
        type: 'tool_use',
        tool_name: state.toolName,
        action_type: {
          action: 'tool',
          tool_name: state.actionType.tool_name,
          arguments: state.actionType.arguments,
          result: text
            ? {
                type: ToolResultValueType.MARKDOWN,
                value: text
              }
            : state.actionType.result
        }
      };
      break;
    }
    default: {
      // keep original action_type
      break;
    }
  }

  return entry;
}

function sanitizeText(text: string): string {
  if (!text) return '';
  const filtered = Array.from(text)
    .filter((ch) => ch >= ' ' || ch === '\n' || ch === '\r' || ch === '\t')
    .join('');
  return filtered.trim();
}

function hasReadableCharacters(text: string): boolean {
  if (!text || text.includes('\uFFFD')) {
    return false;
  }
  try {
    const readablePattern = /[\p{L}\p{N}]/u;
    return readablePattern.test(text);
  } catch {
    return /[A-Za-z0-9]/.test(text);
  }
}

function stripTaggedContent(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return text.replace(regex, '').trim();
}

function extractUserQuery(text: string): string {
  const queryMatch = text.match(/<user_query>[\s\S]*?<\/user_query>/i);
  if (queryMatch) {
    return queryMatch[0].replace(/<\/?.*?>/g, '').trim();
  }
  const withoutInfo = stripTaggedContent(stripTaggedContent(text, 'user_info'), 'git_status');
  return withoutInfo.replace(/<\/?.*?>/g, '').trim();
}

/**
 * Cursor用ログソース
 * セッションファイル: ~/.cursor/chats/{MD5ハッシュ}/{sessionId}/store.db
 */
export class CursorLogSource extends BaseExecutorLogSource {
  private readonly CURSOR_CHATS_DIR = path.join(os.homedir(), '.cursor', 'chats');
  private readonly CURSOR_PROJECTS_DIR = path.join(os.homedir(), '.cursor', 'projects');
  private workspacePathCache: Map<string, string> | null = null;

  getName(): string {
    return 'CURSOR';
  }

  private async loadWorkspacePathCache(): Promise<Map<string, string>> {
    if (this.workspacePathCache) {
      return this.workspacePathCache;
    }

    const cache = new Map<string, string>();

    try {
      const entries = await fs.readdir(this.CURSOR_PROJECTS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const projectDir = path.join(this.CURSOR_PROJECTS_DIR, entry.name);
        const workerLogPath = path.join(projectDir, 'worker.log');

        try {
          const logContent = await fs.readFile(workerLogPath, 'utf-8');
          const workspaceLine = logContent
            .split('\n')
            .find((line) => line.includes('workspacePath='));

          if (!workspaceLine) continue;

          const match = workspaceLine.match(/workspacePath=([^\s]+)/);
          if (!match) continue;

          const workspacePath = match[1];
          const hash = crypto.createHash('md5').update(workspacePath).digest('hex');
          if (!cache.has(hash)) {
            cache.set(hash, workspacePath);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore failures; we'll fall back to hash-based naming
    }

    this.workspacePathCache = cache;
    return cache;
  }

  private async getWorkspacePathFromHash(hash: string): Promise<string | null> {
    const cache = await this.loadWorkspacePathCache();
    return cache.get(hash) ?? null;
  }

  protected async resolveSessionFilePath(
    executionId: string,
    sessionId: string,
    workingDir: string
  ): Promise<string | null> {
    if (!sessionId || !workingDir) return null;

    // workingDirのMD5ハッシュを計算
    const hash = crypto.createHash('md5').update(workingDir).digest('hex');

    // ~/.cursor/chats/{hash}/{sessionId}/store.db
    const filePath = path.join(this.CURSOR_CHATS_DIR, hash, sessionId, 'store.db');

    return filePath;
  }

  protected parseSessionLine(line: string): any {
    // CursorはSQLiteなのでJSONLパースは使わない
    // 注: 実際の実装ではSQLiteからデータを読み取る必要がある
    // 今は簡易的にJSON.parseを返す
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }

  protected async streamCompletedSession(filePath: string): Promise<Readable> {
    const stream = new Readable({ read() {} });

    try {
      const db = new Database(filePath, { readonly: true, fileMustExist: true });
      const rows = db.prepare('SELECT rowid, data FROM blobs ORDER BY rowid').all() as Array<{
        rowid: number;
        data: Buffer;
      }>;
      db.close();

      const userEvents: Array<{ rowid: number; text: string }> = [];
      const systemEvents: Array<{ rowid: number; text: string }> = [];
      const assistantEvents: Array<{ rowid: number; payload: CursorJsonPayload }> = [];
      const toolEvents: Array<{ rowid: number; payload: CursorJsonPayload }> = [];

      for (const row of rows) {
        const decoded = decodeCursorBlob(row.data);

        if (decoded.kind === 'user_text') {
          const text = sanitizeText(decoded.text);
          if (text) {
            userEvents.push({ rowid: row.rowid, text });
          }
          continue;
        }

        if (decoded.kind === 'json') {
          const payload = decoded.payload;
          if (!payload || !payload.role) {
            continue;
          }

          const role = payload.role.toLowerCase();
          if (role === 'system') {
            let content = '';
            if (typeof (payload as any).content === 'string') {
              content = (payload as any).content;
            } else if (Array.isArray(payload.content)) {
              content = payload.content
                .map((item) => sanitizeText(item.text ?? ''))
                .filter(Boolean)
                .join('\n');
            }
            content = sanitizeText(content);
            if (content) {
              systemEvents.push({ rowid: row.rowid, text: content });
            }
            continue;
          }

          if (role === 'user') {
            let combined = '';
            if (Array.isArray(payload.content)) {
              combined = payload.content
                .map((item) => sanitizeText(item.text ?? ''))
                .filter(Boolean)
                .join('\n');
            } else if (typeof (payload as any).content === 'string') {
              combined = sanitizeText((payload as any).content);
            }

            const extracted = extractUserQuery(combined);
            if (extracted) {
              userEvents.push({ rowid: row.rowid, text: extracted });
            }
            continue;
          }

          if (role === 'assistant') {
            assistantEvents.push({ rowid: row.rowid, payload });
            continue;
          }

          if (role === 'tool') {
            toolEvents.push({ rowid: row.rowid, payload });
            continue;
          }
        }
      }

      const hashSegment = path.basename(path.dirname(path.dirname(filePath)));
      const workspacePath =
        (await this.getWorkspacePathFromHash(hashSegment)) ?? path.dirname(path.dirname(filePath));

      userEvents.sort((a, b) => a.rowid - b.rowid);
      systemEvents.sort((a, b) => a.rowid - b.rowid);
      assistantEvents.sort((a, b) => a.rowid - b.rowid);
      toolEvents.sort((a, b) => a.rowid - b.rowid);

      const entryIndexRef = { value: 0 };

      const pushPatch = (patch: JsonPatchOperation) => {
        stream.push(`event: json_patch\ndata: ${JSON.stringify([patch])}\n\n`);
      };

      const pushAdd = (entry: NormalizedEntry) => {
        const patch = createAddPatch(entryIndexRef.value, entry);
        pushPatch(patch);
        entryIndexRef.value += 1;
      };

      const pushReplace = (index: number, entry: NormalizedEntry) => {
        const patch = createReplacePatch(index, entry);
        pushPatch(patch);
      };

      const seenUserTexts = new Set<string>();
      for (const event of userEvents) {
        const text = sanitizeText(event.text);
        if (!text) continue;
        if (seenUserTexts.has(text)) continue;
        seenUserTexts.add(text);

        const entry: NormalizedEntry = {
          timestamp: null,
          entry_type: { type: 'user_message' },
          content: text,
          metadata: null
        };
        pushAdd(entry);
      }

      const seenSystemTexts = new Set<string>();
      for (const event of systemEvents) {
        const text = sanitizeText(event.text);
        if (!text) continue;
        if (seenSystemTexts.has(text)) continue;
        seenSystemTexts.add(text);

        const entry: NormalizedEntry = {
          timestamp: null,
          entry_type: { type: 'system_message' },
          content: text,
          metadata: null
        };
        pushAdd(entry);
      }

      const assistantState = new Map<string, { index: number; content: string }>();
      const reasoningSeen = new Set<string>();
      const toolState = new Map<string, ToolEntryState>();

      for (const event of assistantEvents) {
        const payload = event.payload;
        const messageId = payload.id ?? `assistant-${event.rowid}`;

        for (const item of payload.content ?? []) {
          if (!item || !item.type) continue;
          const itemType = item.type.toLowerCase();

          if (itemType === 'reasoning') {
            const text = sanitizeText(item.text ?? '');
            if (!text) continue;
            const signatureKey = item.signature ?? text;
            if (reasoningSeen.has(signatureKey)) continue;
            reasoningSeen.add(signatureKey);

            const entry: NormalizedEntry = {
              timestamp: null,
              entry_type: { type: 'thinking' },
              content: text,
              metadata: item
            };
            pushAdd(entry);
            continue;
          }

          if (itemType === 'text') {
            const text = sanitizeText(item.text ?? '');
            if (!text) continue;
            const existing = assistantState.get(messageId);
            const entry: NormalizedEntry = {
              timestamp: null,
              entry_type: { type: 'assistant_message' },
              content: text,
              metadata: item
            };

            if (!existing) {
              assistantState.set(messageId, { index: entryIndexRef.value, content: text });
              pushAdd(entry);
            } else if (existing.content !== text) {
              pushReplace(existing.index, entry);
              assistantState.set(messageId, { index: existing.index, content: text });
            }
            continue;
          }

          if (itemType === 'tool-call') {
            if (!item.toolName || !item.toolCallId) continue;
            const callId = sanitizeText(item.toolCallId);
            if (!callId) continue;

            const args = (item.args as Record<string, unknown>) ?? {};
            const { toolLabel, actionType, content } = buildToolEntry(
              item.toolName,
              args,
              workspacePath
            );

            const entry: NormalizedEntry = {
              timestamp: null,
              entry_type: {
                type: 'tool_use',
                tool_name: toolLabel,
                action_type: actionType
              },
              content,
              metadata: { toolCallId: callId, args }
            };

            const index = entryIndexRef.value;
            pushAdd(entry);
            toolState.set(callId, {
              index,
              toolName: toolLabel,
              actionType,
              content,
              metadata: entry.metadata
            });
          }
        }
      }

      for (const event of toolEvents) {
        for (const item of event.payload.content ?? []) {
          if (!item || !item.type || item.type.toLowerCase() !== 'tool-result') continue;
          if (!item.toolCallId) continue;

          const callId = sanitizeText(item.toolCallId);
          if (!callId) continue;
          const state = toolState.get(callId);
          if (!state) continue;

          const updated = applyToolResult(state, item);
          if (!updated) continue;

          pushReplace(state.index, updated);

          if (updated.entry_type.type === 'tool_use') {
            toolState.set(callId, {
              index: state.index,
              toolName: updated.entry_type.tool_name,
              actionType: updated.entry_type.action_type,
              content: updated.content,
              metadata: updated.metadata
            });
          }
        }
      }

      stream.push(`event: finished\ndata: ${JSON.stringify({ message: 'Log stream ended' })}\n\n`);
      stream.push(null);
    } catch (error) {
      console.error('[CursorLogSource] Failed to stream Cursor store.db:', error);
      stream.push(
        `event: error\ndata: ${JSON.stringify({ error: 'Failed to read cursor session' })}\n\n`
      );
      stream.push(`event: finished\ndata: ${JSON.stringify({ message: 'Log stream ended' })}\n\n`);
      stream.push(null);
    }

    return stream;
  }

  /**
   * プロジェクト一覧を取得
   */
  async getProjectList(): Promise<ProjectInfo[]> {
    try {
      const entries = await fs.readdir(this.CURSOR_CHATS_DIR, { withFileTypes: true });
      const projects: ProjectInfo[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;

        const hash = entry.name;
        const hashDir = path.join(this.CURSOR_CHATS_DIR, hash);
        const stats = await fs.stat(hashDir);

        const workspacePath = await this.getWorkspacePathFromHash(hash);
        const displayName = workspacePath
          ? path.basename(workspacePath) || workspacePath
          : `Cursor Project (${hash.substring(0, 8)}...)`;
        const gitRepoPath = workspacePath ?? hashDir;

        projects.push({
          id: hash,
          name: displayName,
          git_repo_path: gitRepoPath,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

      return projects.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
    } catch (error) {
      console.error('[CursorLogSource] Error reading projects:', error);
      return [];
    }
  }

  /**
   * 指定プロジェクトのセッション一覧を取得
   */
  private extractFirstUserMessage(storeDbPath: string): string | null {
    let db: BetterSqliteDatabase | null = null;
    try {
      db = new Database(storeDbPath, { readonly: true, fileMustExist: true });
      const iterator = db.prepare('SELECT data FROM blobs ORDER BY rowid LIMIT 200').iterate();

      for (const row of iterator as Iterable<{ data: Buffer }>) {
        const decoded = decodeCursorBlob(row.data);

        if (decoded.kind === 'user_text') {
          const text = sanitizeText(decoded.text);
          if (text && hasReadableCharacters(text)) {
            return text.slice(0, 200);
          }
        }

        if (decoded.kind === 'json' && decoded.payload?.role === 'user') {
          const text = extractTextFromCursorPayload(decoded.payload);
          if (text && hasReadableCharacters(text)) {
            return text.slice(0, 200);
          }
        }
      }
    } catch (error) {
      logger.debug(
        `[CursorLogSource] Failed to extract first user message from ${storeDbPath}`,
        error
      );
    } finally {
      db?.close();
    }

    return null;
  }

  async getSessionList(projectId: string): Promise<SessionInfo[]> {
    try {
      const projectDir = path.join(this.CURSOR_CHATS_DIR, projectId);

      try {
        await fs.access(projectDir);
      } catch {
        console.warn(`[CursorLogSource] Project directory not found: ${projectDir}`);
        return [];
      }

      const workspacePath = await this.getWorkspacePathFromHash(projectId);

      const entries = await fs.readdir(projectDir, { withFileTypes: true });
      const sessions: SessionInfo[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const sessionDir = path.join(projectDir, entry.name);
        const storeDbPath = path.join(sessionDir, 'store.db');

        // store.dbの存在確認
        try {
          const stats = await fs.stat(storeDbPath);

          const titleBase = workspacePath
            ? path.basename(workspacePath) || workspacePath
            : `Cursor Session ${entry.name.substring(0, 8)}`;

          const firstUserMessage = this.extractFirstUserMessage(storeDbPath);
          const normalizedFirstUserMessage = firstUserMessage
            ? firstUserMessage.replace(/\s+/g, ' ').trim()
            : undefined;
          const displayTitle =
            normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
              ? normalizedFirstUserMessage
              : `${titleBase} #${entry.name.substring(0, 8)}`;

          sessions.push({
            id: entry.name,
            projectId: projectId,
            filePath: storeDbPath,
            title: displayTitle,
            firstUserMessage: normalizedFirstUserMessage,
            status: 'completed',
            createdAt: stats.birthtime,
            updatedAt: stats.mtime,
            fileSize: stats.size,
            workspacePath: workspacePath ?? null
          });
        } catch {
          // store.dbが存在しない場合はスキップ
          continue;
        }
      }

      return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.error(`[CursorLogSource] Error reading sessions for project ${projectId}:`, error);
      return [];
    }
  }
}
