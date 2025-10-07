import { Readable } from 'stream';
import { ILogSourceStrategy, ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
import { logger } from '../../../utils/logger.js';
import { watch, FSWatcher } from 'chokidar';
import * as fs from 'fs/promises';
import type {
  NormalizedEntry,
  NormalizedEntryType,
  ActionType,
  CommandRunResult,
  JsonPatchOperation
} from '../executors/types.js';
import { CommandExitStatusType, ToolResultValueType } from '../executors/types.js';

/**
 * Executor固有のログソースの基底クラス
 */
export abstract class BaseExecutorLogSource implements ILogSourceStrategy {
  abstract getName(): string;

  /**
   * セッションファイルパスを解決（各Executorで実装）
   */
  protected abstract resolveSessionFilePath(
    executionId: string,
    sessionId: string,
    workingDir: string
  ): Promise<string | null>;

  /**
   * JSONLファイルの1行をパースして正規化エントリに変換（各Executorで実装）
   */
  protected abstract parseSessionLine(line: string): any;

  /**
   * プロジェクト一覧を取得（各Executorで実装）
   */
  abstract getProjectList(): Promise<ProjectInfo[]>;

  /**
   * 指定プロジェクトのセッション一覧を取得（各Executorで実装）
   */
  abstract getSessionList(projectId: string): Promise<SessionInfo[]>;

  /**
   * セッションIDからセッション詳細をストリーミングで取得
   * ファイルから直接読み取る実装
   */
  async getSessionById(sessionId: string): Promise<Readable | null> {
    logger.info(`[${this.getName()}] Getting session by ID: ${sessionId}`);

    try {
      // sessionIdからファイルパスを直接取得する方法が必要
      // しかし、resolveSessionFilePathはexecutionId, sessionId, workingDirを必要とする
      // 代わりに、sessionId自体をファイルパスとして解釈する簡易実装

      // ここでは、SessionInfoのfilePathを使う必要があるが、
      // それはgetSessionListで取得済みのはず
      // 代替案: sessionIdからファイルパスを再構築する

      // とりあえず、実装可能な範囲で各Executorでオーバーライドすることを期待
      logger.warn(`[${this.getName()}] getSessionById not implemented, using default`);
      return null;
    } catch (error) {
      logger.error(`[${this.getName()}] Error getting session by ID:`, error);
      return null;
    }
  }

  async streamSessionInfo(session: SessionInfo): Promise<Readable | null> {
    if (!session.filePath) {
      return null;
    }

    if (session.status === 'running') {
      return this.streamLiveSession(session.filePath);
    }

    return this.streamCompletedSession(session.filePath);
  }

  /**
   * 完了済みセッションのストリーミング
   */
  protected async streamCompletedSession(filePath: string): Promise<Readable> {
    const stream = new Readable({ read() {} });

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      logger.info(`[${this.getName()}] Read ${lines.length} lines from ${filePath}`);

      const entryIndexRef = { value: 0 };

      for (const line of lines) {
        this.processLineAndEmit(line, stream, entryIndexRef);
      }

      stream.push(`event: finished\ndata: ${JSON.stringify({ message: 'Log stream ended' })}\n\n`);
      stream.push(null);
    } catch (error) {
      logger.error(`[${this.getName()}] Error reading file:`, error);
      stream.push(`event: error\ndata: ${JSON.stringify({ error: 'Failed to read file' })}\n\n`);
      stream.push(null);
    }

    return stream;
  }

  /**
   * リアルタイムセッションのストリーミング（chokidar使用）
   */
  protected async streamLiveSession(filePath: string): Promise<Readable> {
    const stream = new Readable({ read() {} });

    logger.info(`[${this.getName()}] Starting live stream for ${filePath}`);

    const entryIndexRef = { value: 0 };

    // 既存の内容を読み込み
    let lastPosition = 0;
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          this.processLineAndEmit(line, stream, entryIndexRef);
        }

        lastPosition = content.length;
        logger.info(
          `[${this.getName()}] Initial read: ${lines.length} lines, ${lastPosition} bytes`
        );
      }
    } catch (err) {
      logger.info(`[${this.getName()}] File not yet created, waiting for first write`);
    }

    // chokidarでファイル変更を監視
    const watcher: FSWatcher = watch(filePath, {
      persistent: true,
      usePolling: false,
      useFsEvents: process.platform === 'darwin',
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    watcher.on('add', async () => {
      logger.info(`[${this.getName()}] File created: ${filePath}`);
      // 最初のファイル作成時は既に読み込み済みなのでスキップ
    });

    watcher.on('change', async () => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        if (content.length > lastPosition) {
          const newContent = content.slice(lastPosition);
          const newLines = newContent.split('\n').filter((line) => line.trim());

          logger.debug(`[${this.getName()}] File changed: ${newLines.length} new lines`);

          for (const line of newLines) {
            this.processLineAndEmit(line, stream, entryIndexRef);
          }

          lastPosition = content.length;
        }
      } catch (err) {
        logger.error(`[${this.getName()}] Error reading file changes:`, err);
      }
    });

    // ストリームクローズ時にwatcherを停止
    stream.on('close', () => {
      logger.info(`[${this.getName()}] Stream closed, stopping watcher`);
      watcher.close();
    });

    return stream;
  }

  protected processLineAndEmit(
    line: string,
    stream: Readable,
    entryIndexRef: { value: number }
  ): void {
    try {
      const entry = this.parseSessionLine(line);
      if (entry) {
        const patch = this.convertEntryToJsonPatch(entry, entryIndexRef.value);
        if (!patch) {
          return;
        }
        entryIndexRef.value += 1;
        stream.push(`event: json_patch\ndata: ${JSON.stringify([patch])}\n\n`);
      }
    } catch (err) {
      logger.warn(`[${this.getName()}] Failed to parse line:`, err);
    }
  }

  /**
   * エントリをJSON Patchに変換
   */
  protected convertEntryToJsonPatch(entry: any, entryIndex: number): JsonPatchOperation | null {
    const normalizedEntry = this.toNormalizedEntry(entry);
    if (!normalizedEntry) {
      return null;
    }

    return {
      op: 'add',
      path: `/entries/${entryIndex}`,
      value: {
        type: 'NORMALIZED_ENTRY',
        content: normalizedEntry
      }
    };
  }

  protected toNormalizedEntry(entry: any): NormalizedEntry | null {
    if (!entry || typeof entry !== 'object') {
      const content = this.sanitizeInstructionText(String(entry ?? ''));
      if (!content) {
        return null;
      }
      return {
        timestamp: null,
        entry_type: { type: 'system_message' },
        content,
        metadata: entry
      };
    }

    const timestamp: string | null = null;
    const typ = entry.type;
    const payload = entry.payload ?? {};
    const metadata = entry;

    if (typ === 'session_meta' || typ === 'turn_context') {
      return null;
    }

    if (typ === 'response_item' && payload.type === 'message') {
      const role = payload.role;
      const content = this.extractTextContent(payload.content);

      if (role === 'user') {
        if (!content || !content.trim() || this.containsInstructionTags(content)) {
          return null;
        }
        return {
          timestamp,
          entry_type: { type: 'user_message' },
          content,
          metadata
        };
      }

      if (role === 'assistant') {
        if (!content || !content.trim() || this.containsInstructionTags(content)) {
          return null;
        }
        return {
          timestamp,
          entry_type: { type: 'assistant_message' },
          content,
          metadata
        };
      }
    }

    if (typ === 'response_item' && payload.type === 'reasoning') {
      const summary = this.extractTextContent(payload.summary ?? payload.content);
      return {
        timestamp,
        entry_type: { type: 'assistant_message' },
        content: summary,
        metadata
      };
    }

    if (typ === 'response_item' && payload.type === 'function_call') {
      const toolName = payload.name || 'function_call';
      const parsedArgs = this.safeJsonParse(payload.arguments);
      const argText = this.formatToolArgumentContent(payload.arguments);

      return {
        timestamp,
        entry_type: this.createToolUseEntryType(toolName, {
          action: 'tool',
          tool_name: toolName,
          arguments: parsedArgs,
          result: undefined
        }),
        content: argText,
        metadata
      };
    }

    if (typ === 'response_item' && payload.type === 'function_call_output') {
      const callId: string | undefined = payload.call_id;
      const rawOutput = payload.output ?? payload.result ?? payload.message;
      const parsedOutput = this.safeJsonParse(rawOutput);
      const textOutput = this.stringifyPayload(parsedOutput ?? rawOutput);
      const toolLabel = payload.name || (callId ? `tool:${callId}` : 'tool_result');

      return {
        timestamp,
        entry_type: this.createToolUseEntryType(toolLabel, {
          action: 'tool',
          tool_name: toolLabel,
          result:
            parsedOutput && typeof parsedOutput === 'object'
              ? { type: ToolResultValueType.JSON, value: parsedOutput }
              : {
                  type: ToolResultValueType.MARKDOWN,
                  value: textOutput
                }
        }),
        content: textOutput,
        metadata
      };
    }

    if (typ === 'event_msg') {
      if (payload.type === 'message') {
        return null;
      }
      if (payload.type === 'command_run') {
        const command = payload.command || payload.name || 'command';
        const output = payload.output || payload.stdout || '';
        const content = `Command: ${command}\n${output}`.trim();

        return {
          timestamp,
          entry_type: this.createToolUseEntryType(command, {
            action: 'command_run',
            command,
            result: this.createCommandResult(output, payload.exit_status)
          }),
          content,
          metadata
        };
      }

      if (payload.type === 'user_message') {
        const message = typeof payload.message === 'string' ? payload.message : '';
        const sanitized = this.sanitizeInstructionText(message);
        if (!sanitized) {
          return null;
        }
        return {
          timestamp,
          entry_type: { type: 'user_message' },
          content: sanitized,
          metadata
        };
      }

      if (payload.type === 'agent_message') {
        const content = this.extractTextContent(payload.message ?? payload.text ?? payload);
        if (!content) {
          return null;
        }
        return {
          timestamp,
          entry_type: { type: 'assistant_message' },
          content,
          metadata
        };
      }

      if (payload.type === 'diagnostic') {
        const content = this.sanitizeInstructionText(this.stringifyPayload(payload));
        if (!content) {
          return null;
        }
        return {
          timestamp,
          entry_type: { type: 'system_message' },
          content,
          metadata
        };
      }

      if (payload.type === 'git_diff' || payload.type === 'project_diff') {
        const summary = typeof payload.summary === 'string' ? payload.summary : 'Diff update';
        const diffText = this.stringifyPayload(payload.diff ?? payload.changes ?? payload);
        const sanitizedSummary = this.sanitizeInstructionText(summary);
        if (!sanitizedSummary) {
          return null;
        }
        return {
          timestamp,
          entry_type: this.createToolUseEntryType('git_diff', {
            action: 'file_edit',
            path: payload.path ?? payload.file ?? 'workspace',
            changes: [
              {
                action: 'edit',
                unified_diff: diffText,
                has_line_numbers: false
              }
            ]
          }),
          content: sanitizedSummary,
          metadata
        };
      }
    }

    const fallbackContent = this.sanitizeInstructionText(this.stringifyPayload(payload));
    if (!fallbackContent) {
      return null;
    }

    return {
      timestamp,
      entry_type: { type: 'assistant_message' },
      content: fallbackContent,
      metadata
    };
  }

  private safeJsonParse(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  private formatToolArgumentContent(args: unknown): string {
    if (typeof args === 'string') {
      return args;
    }

    if (args == null) {
      return '';
    }

    return this.stringifyPayload(args);
  }

  private createToolUseEntryType(toolName: string, action: ActionType): NormalizedEntryType {
    return {
      type: 'tool_use',
      tool_name: toolName,
      action_type: action
    };
  }

  private createCommandResult(output: string | undefined, exitStatus: unknown) {
    const result: CommandRunResult = {
      output
    };

    if (typeof exitStatus === 'number') {
      result.exit_status = {
        type: CommandExitStatusType.EXIT_CODE,
        code: exitStatus
      };
    }

    return result;
  }

  private containsInstructionTags(text: string): boolean {
    return /<\s*(user_instructions|environment_context)\b/i.test(text);
  }

  private sanitizeInstructionText(text: string): string {
    if (!text) {
      return '';
    }

    return text
      .replace(/<user_instructions>[\s\S]*?<\/user_instructions>/gi, '')
      .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, '')
      .replace(/<\/\s*user_instructions>/gi, '')
      .replace(/<\/\s*environment_context>/gi, '')
      .replace(/<user_instructions\b[^>]*>/gi, '')
      .replace(/<environment_context\b[^>]*>/gi, '')
      .trim();
  }

  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return this.sanitizeInstructionText(content);
    }

    if (Array.isArray(content)) {
      const joined = content
        .map((item) => {
          if (typeof item === 'string') {
            return this.sanitizeInstructionText(item);
          }
          if (item && typeof item === 'object' && 'text' in item) {
            return this.sanitizeInstructionText(String((item as { text: unknown }).text ?? ''));
          }
          return this.stringifyPayload(item);
        })
        .filter((value) => typeof value === 'string' && value.trim())
        .join('\n');
      return this.sanitizeInstructionText(joined);
    }

    if (content && typeof content === 'object' && 'text' in content) {
      return this.sanitizeInstructionText(String((content as { text?: unknown }).text ?? ''));
    }

    return this.stringifyPayload(content);
  }

  protected stringifyPayload(payload: unknown): string {
    if (payload == null) {
      return '';
    }

    if (typeof payload === 'string') {
      return payload;
    }

    try {
      return JSON.stringify(payload, null, 2);
    } catch (error) {
      return String(payload);
    }
  }
}
