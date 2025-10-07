import { Readable } from 'stream';
import { logger } from '../../../utils/logger.js';
import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import {
  NormalizedEntry,
  CommandRunResult,
  CommandExitStatusType,
  ToolResult,
  ToolResultValueType,
  FileChange
} from '../executors/types.js';
import { makePathRelative } from '../../../utils/path.js';
import { concatenateDiffHunks, extractUnifiedDiffHunks } from '../../../utils/diff.js';

type CodexSessionMetadata = {
  sessionId: string;
  workspacePath: string;
  instructions: string | null;
  createdAt: Date;
  updatedAt: Date;
  filePath: string;
  fileSize: number;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface CodexSystemConfig {
  model?: string;
  provider?: string;
  ['reasoning effort']?: string;
  [key: string]: unknown;
}

interface CodexPrompt {
  prompt: string;
}

interface CodexStructuredMessage {
  id: string;
  msg: CodexMsgContent;
}

interface CodexMcpInvocation {
  server: string;
  tool: string;
  arguments?: unknown;
}

interface CodexExecCommandBegin {
  call_id?: string;
  command: string[];
  cwd?: string;
}

interface CodexExecCommandEnd {
  call_id?: string;
  stdout?: string;
  stderr?: string;
  success?: boolean;
  exit_code?: number;
}

interface CodexMcpToolCallBegin {
  call_id: string;
  invocation: CodexMcpInvocation;
}

interface CodexMcpToolCallEnd {
  call_id: string;
  invocation: CodexMcpInvocation;
  result: unknown;
}

interface CodexExecApprovalRequest {
  call_id?: string;
  command: string[];
  cwd?: string;
  reason?: string;
}

interface CodexApplyPatchApprovalRequest {
  call_id?: string;
  changes: Record<string, CodexFileChangePayload>;
  reason?: string;
  grant_root?: string;
}

interface CodexPatchApplyBegin {
  call_id?: string;
  auto_approved?: boolean;
  changes: Record<string, CodexFileChangePayload>;
}

interface CodexPlanUpdate {
  value: unknown;
}

interface CodexTokenCount {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

interface CodexTurnEvent {
  type: 'turn.started' | 'turn.completed';
  usage?: CodexTokenCount;
}

interface CodexThreadStartedEvent {
  type: 'thread.started';
  thread_id?: string;
}

interface CodexItemBase {
  id: string;
  type: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number;
  status?: string;
  changes?: Array<{ path: string; kind: string }>;
}

interface CodexItemEvent {
  type: 'item.started' | 'item.completed';
  item: CodexItemBase;
}

type CodexMsgContent =
  | { type: 'agent_message'; message: string }
  | { type: 'agent_reasoning'; text: string }
  | { type: 'agent_reasoning_raw_content'; text: string }
  | { type: 'agent_reasoning_raw_content_delta'; delta: string }
  | { type: 'error'; message?: string }
  | ({ type: 'mcp_tool_call_begin' } & CodexMcpToolCallBegin)
  | ({ type: 'mcp_tool_call_end' } & CodexMcpToolCallEnd)
  | ({ type: 'exec_command_begin' } & CodexExecCommandBegin)
  | { type: 'exec_command_output_delta'; call_id?: string; stream?: string; chunk?: unknown }
  | ({ type: 'exec_command_end' } & CodexExecCommandEnd)
  | ({ type: 'exec_approval_request' } & CodexExecApprovalRequest)
  | ({ type: 'apply_patch_approval_request' } & CodexApplyPatchApprovalRequest)
  | { type: 'background_event'; message: string }
  | ({ type: 'patch_apply_begin' } & CodexPatchApplyBegin)
  | {
      type: 'patch_apply_end';
      call_id?: string;
      stdout?: string;
      stderr?: string;
      success?: boolean;
    }
  | { type: 'turn_diff'; unified_diff: string }
  | { type: 'get_history_entry_response'; offset?: number; log_id?: number; entry?: JsonValue }
  | ({ type: 'plan_update' } & CodexPlanUpdate)
  | { type: 'task_started' }
  | { type: 'task_complete'; last_agent_message?: string }
  | ({ type: 'token_count' } & CodexTokenCount)
  | ({ type: 'unknown' } & Record<string, JsonValue>);

type CodexJson =
  | CodexStructuredMessage
  | CodexPrompt
  | CodexSystemConfig
  | CodexItemEvent
  | CodexTurnEvent
  | CodexThreadStartedEvent
  | CodexResponseItem
  | CodexEventMessage;

type CodexFileChangePayload =
  | { type?: 'add'; content: string }
  | { type?: 'delete' }
  | { type?: 'update'; unified_diff: string; move_path?: string }
  | { content?: string; unified_diff?: string; move_path?: string; [key: string]: unknown };

interface CodexResponseItem {
  type: 'response_item';
  payload: {
    type: string;
    role?: string;
    content?: unknown;
    summary?: Array<{ type: string; text: string }>;
    encrypted_content?: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    output?: string;
  };
}

interface CodexEventMessage {
  type: 'event_msg';
  payload: {
    type: string;
    text?: string;
    message?: string;
    kind?: string;
  };
}

type ExecInfo = {
  entryIndex: number;
  toolName: string;
  content: string;
  command: string;
};

type McpInfo = {
  entryIndex: number;
  toolName: string;
  args: unknown;
  content: string;
};

type PatchOperation = {
  patch: {
    op: 'add' | 'replace';
    path: string;
    value: unknown;
  };
  incrementIndex: boolean;
};

/**
 * Codex用ログソース
 * セッションファイル: ~/.codex/sessions/.../rollout-*.jsonl
 */
export class CodexLogSource extends BaseExecutorLogSource {
  private readonly CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
  private execInfoMap = new Map<string, ExecInfo>();
  private mcpInfoMap = new Map<string, McpInfo>();
  private currentWorkspacePath: string | null = null;
  private lastMessageByRole: Record<'user' | 'assistant', string | null> = {
    user: null,
    assistant: null
  };
  private lastReasoning: string | null = null;

  getName(): string {
    return 'CODEX';
  }

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

  private async readSessionHeader(filePath: string) {
    return await new Promise<{
      sessionUuid: string | null;
      workspacePath: string | null;
      instructions: string | null;
      startedAt: string | null;
    } | null>((resolve, reject) => {
      let buffer = '';
      const stream = createReadStream(filePath, {
        encoding: 'utf-8',
        highWaterMark: 4 * 1024
      });

      stream.on('data', (chunk) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex !== -1) {
          stream.close();
          const firstLine = buffer.slice(0, newlineIndex);
          try {
            const parsed = JSON.parse(firstLine) as {
              type?: string;
              timestamp?: string;
              payload?: {
                id?: string;
                cwd?: string;
                instructions?: string;
                timestamp?: string;
              };
            };

            if (parsed.type !== 'session_meta') {
              resolve(null);
              return;
            }

            resolve({
              sessionUuid: parsed.payload?.id ?? null,
              workspacePath: parsed.payload?.cwd ?? null,
              instructions: parsed.payload?.instructions ?? null,
              startedAt: parsed.payload?.timestamp ?? parsed.timestamp ?? null
            });
          } catch (error) {
            reject(error);
          }
        }
      });

      stream.on('error', (error) => {
        reject(error);
      });

      stream.on('close', () => {
        if (buffer.length === 0) {
          resolve(null);
        }
      });
    });
  }

  private async collectSessionMetadata(): Promise<CodexSessionMetadata[]> {
    const results: CodexSessionMetadata[] = [];

    const stack: string[] = [this.CODEX_SESSIONS_DIR];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      let entries;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          console.warn(`[CodexLogSource] Failed to read directory ${current}`, error);
        }
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);

        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
          continue;
        }

        let header;
        try {
          header = await this.readSessionHeader(fullPath);
        } catch (error) {
          console.warn(`[CodexLogSource] Failed to read session header: ${fullPath}`, error);
          continue;
        }

        if (!header?.sessionUuid || !header.workspacePath) {
          continue;
        }

        let stats;
        try {
          stats = await fs.stat(fullPath);
        } catch (error) {
          console.warn(`[CodexLogSource] Failed to stat session file: ${fullPath}`, error);
          continue;
        }

        results.push({
          sessionId: header.sessionUuid,
          workspacePath: header.workspacePath,
          instructions: header.instructions ?? null,
          createdAt: this.toDate(header.startedAt, stats.birthtime),
          updatedAt: stats.mtime,
          filePath: fullPath,
          fileSize: stats.size
        });
      }
    }

    return results;
  }

  private async extractFirstUserMessage(filePath: string): Promise<string | null> {
    try {
      const stream = createReadStream(filePath, {
        encoding: 'utf-8',
        highWaterMark: 64 * 1024
      });

      let buffer = '';
      for await (const chunk of stream) {
        buffer += chunk;

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          newlineIndex = buffer.indexOf('\n');
          if (!line) {
            continue;
          }

          let parsed: CodexJson | null = null;
          try {
            parsed = JSON.parse(line) as CodexJson;
          } catch {
            continue;
          }

          if (isResponseItem(parsed) && parsed.payload?.type === 'message') {
            if (parsed.payload.role === 'user') {
              const content = extractTextFromContent(parsed.payload.content);
              const sanitized = filterInstructionTags(content).replace(/\s+/g, ' ').trim();
              if (sanitized) {
                return sanitized.slice(0, 200);
              }
            }
          }

          if (isEventMessage(parsed) && parsed.payload?.type === 'user_message') {
            const rawMessage =
              typeof parsed.payload.message === 'string'
                ? parsed.payload.message
                : (parsed.payload.text ?? '');
            const sanitized = filterInstructionTags(String(rawMessage ?? ''))
              .replace(/\s+/g, ' ')
              .trim();
            if (sanitized) {
              return sanitized.slice(0, 200);
            }
          }
        }

        if (buffer.length > 100_000) {
          buffer = buffer.slice(-10_000);
        }
      }
    } catch (error) {
      logger.debug(`[CodexLogSource] Failed to extract first user message from ${filePath}`, error);
    }

    return null;
  }

  protected async resolveSessionFilePath(
    _executionId: string,
    sessionId: string,
    _workingDir: string
  ): Promise<string | null> {
    if (!sessionId) return null;

    const sessions = await this.collectSessionMetadata();
    const match = sessions.find((session) => session.sessionId === sessionId);
    return match?.filePath ?? null;
  }

  protected parseSessionLine(line: string): any {
    return JSON.parse(line);
  }

  protected processLineAndEmit(
    line: string,
    stream: Readable,
    entryIndexRef: { value: number }
  ): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const codexJson = parseCodexJson(trimmed);
    if (!codexJson) {
      super.processLineAndEmit(line, stream, entryIndexRef);
      return;
    }

    if (
      'type' in codexJson &&
      (codexJson.type === 'session_meta' || codexJson.type === 'turn_context')
    ) {
      return;
    }

    if (isEventMessage(codexJson) && codexJson.payload?.type === 'token_count') {
      return;
    }

    if (isEventMessage(codexJson) && codexJson.payload?.type === 'message') {
      return;
    }

    const result = this.transformCodexJson(codexJson, entryIndexRef);
    if (!result.handled) {
      super.processLineAndEmit(line, stream, entryIndexRef);
      return;
    }

    result.operations.forEach((op) => {
      stream.push(`event: json_patch\ndata: ${JSON.stringify([op.patch])}\n\n`);
      if (op.incrementIndex) {
        entryIndexRef.value += 1;
      }
    });
  }

  private transformCodexJson(
    codexJson: CodexJson,
    entryIndexRef: { value: number }
  ): { operations: PatchOperation[]; handled: boolean } {
    const operations: PatchOperation[] = [];
    const currentDir = this.currentWorkspacePath ?? '';
    let nextIndex = entryIndexRef.value;

    const addEntry = (entry: NormalizedEntry): number => {
      const index = nextIndex;
      const patch = this.createAddPatch(entry, index);
      operations.push({ patch, incrementIndex: true });
      nextIndex += 1;
      return index;
    };

    const replaceEntry = (index: number, entry: NormalizedEntry): void => {
      const patch = this.createReplacePatch(entry, index);
      operations.push({ patch, incrementIndex: false });
    };

    if (isResponseItem(codexJson)) {
      const handled = this.handleResponseItem(codexJson, addEntry, replaceEntry);
      return { operations, handled };
    }

    if (isEventMessage(codexJson)) {
      const handled = this.handleEventMessage(codexJson, addEntry);
      return { operations, handled };
    }

    if (isItemEvent(codexJson)) {
      const entries = buildEntriesFromItemEvent(codexJson.item, currentDir);
      entries.forEach(addEntry);
      return { operations, handled: entries.length > 0 };
    }

    if (isTurnEvent(codexJson)) {
      if (codexJson.type === 'turn.completed') {
        const summary = summarizedTokenUsage(codexJson.usage);
        if (summary) {
          addEntry({
            timestamp: null,
            entry_type: { type: 'system_message' },
            content: `Turn completed (${summary})`,
            metadata: codexJson.usage || null
          });
        }
      }
      return { operations, handled: false };
    }

    if (isThreadStartedEvent(codexJson)) {
      addEntry({
        timestamp: null,
        entry_type: { type: 'system_message' },
        content: 'Thread started',
        metadata: { thread_id: codexJson.thread_id }
      });
      return { operations, handled: true };
    }

    if (isStructuredMessage(codexJson)) {
      const message = codexJson.msg;
      switch (message.type) {
        case 'exec_command_begin': {
          const commandStr = (message.command || []).join(' ');
          const toolName = commandStr.toLowerCase().includes('bash') ? 'Bash' : 'Shell';
          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type: {
              type: 'tool_use',
              tool_name: toolName,
              action_type: {
                action: 'command_run',
                command: commandStr
              }
            },
            content: commandStr ? `\`${commandStr}\`` : 'command execution',
            metadata: null
          };
          const index = addEntry(entry);
          if (message.call_id) {
            this.execInfoMap.set(message.call_id, {
              entryIndex: index,
              toolName,
              content: entry.content,
              command: commandStr
            });
          }
          return { operations, handled: true };
        }
        case 'exec_command_end': {
          if (!message.call_id) return { operations, handled: false };
          const info = this.execInfoMap.get(message.call_id);
          if (!info) return { operations, handled: false };

          const output = mergeCommandOutput(message.stdout, message.stderr);
          const exitStatus = deriveExitStatus(message.success, message.exit_code);
          const result: CommandRunResult = {};
          if (exitStatus) result.exit_status = exitStatus;
          if (output) result.output = output;

          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type: {
              type: 'tool_use',
              tool_name: info.toolName,
              action_type: {
                action: 'command_run',
                command: info.command,
                result: Object.keys(result).length === 0 ? undefined : result
              }
            },
            content: info.content,
            metadata: null
          };

          replaceEntry(info.entryIndex, entry);
          this.execInfoMap.delete(message.call_id);
          return { operations, handled: true };
        }
        case 'mcp_tool_call_begin': {
          const toolName = `mcp:${message.invocation.server}:${message.invocation.tool}`;
          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type: {
              type: 'tool_use',
              tool_name: toolName,
              action_type: {
                action: 'tool',
                tool_name: toolName,
                arguments: message.invocation.arguments || undefined
              }
            },
            content: message.invocation.tool,
            metadata: message.invocation
          };
          const index = addEntry(entry);
          this.mcpInfoMap.set(message.call_id, {
            entryIndex: index,
            toolName,
            args: message.invocation.arguments,
            content: entry.content
          });
          return { operations, handled: true };
        }
        case 'mcp_tool_call_end': {
          const info = this.mcpInfoMap.get(message.call_id);
          if (!info) return { operations, handled: false };

          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type: {
              type: 'tool_use',
              tool_name: info.toolName,
              action_type: {
                action: 'tool',
                tool_name: info.toolName,
                arguments: info.args,
                result: buildToolResult(message.result)
              }
            },
            content: info.content,
            metadata: message.invocation
          };

          replaceEntry(info.entryIndex, entry);
          this.mcpInfoMap.delete(message.call_id);
          return { operations, handled: true };
        }
        default:
          break;
      }
    }

    const entries = codexJsonToEntries(codexJson, currentDir);
    entries.forEach(addEntry);
    return { operations, handled: entries.length > 0 };
  }

  private handleResponseItem(
    response: CodexResponseItem,
    addEntry: (entry: NormalizedEntry) => number,
    replaceEntry: (index: number, entry: NormalizedEntry) => void
  ): boolean {
    const payload = response.payload;
    switch (payload.type) {
      case 'message': {
        const role = payload.role;
        const content = extractTextFromContent(payload.content);
        if (!content) return true;
        const normalizedRole = role === 'assistant' ? 'assistant' : 'user';
        if (this.lastMessageByRole[normalizedRole] === content) {
          return true;
        }
        this.lastMessageByRole[normalizedRole] = content;
        if (role === 'user') {
          addEntry({
            timestamp: null,
            entry_type: { type: 'user_message' },
            content,
            metadata: payload
          });
        } else if (role === 'assistant') {
          addEntry({
            timestamp: null,
            entry_type: { type: 'assistant_message' },
            content,
            metadata: payload
          });
        }
        return true;
      }
      case 'reasoning': {
        const summary = Array.isArray(payload.summary) ? payload.summary[0]?.text : undefined;
        const text = summary || extractTextFromContent(payload.content);
        if (!text) return true;
        if (this.lastReasoning === text) return true;
        this.lastReasoning = text;
        addEntry({
          timestamp: null,
          entry_type: { type: 'thinking' },
          content: text,
          metadata: payload
        });
        return true;
      }
      case 'function_call': {
        const args = safeParseJson(payload.arguments);
        const lowerName = (payload.name || '').toLowerCase();
        if (lowerName === 'shell') {
          const commandParts = Array.isArray(args?.command) ? args.command : [];
          const commandStr = commandParts.join(' ');
          const toolName = 'Bash';
          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type: {
              type: 'tool_use',
              tool_name: toolName,
              action_type: {
                action: 'command_run',
                command: commandStr
              }
            },
            content: commandStr ? `\`${commandStr}\`` : toolName,
            metadata: payload
          };
          const index = addEntry(entry);
          if (payload.call_id) {
            this.execInfoMap.set(payload.call_id, {
              entryIndex: index,
              toolName,
              content: entry.content,
              command: commandStr
            });
          }
          return true;
        }

        const toolLabel = payload.name || 'tool_call';
        const entry: NormalizedEntry = {
          timestamp: null,
          entry_type: {
            type: 'tool_use',
            tool_name: toolLabel,
            action_type: {
              action: 'tool',
              tool_name: toolLabel,
              arguments: args || undefined
            }
          },
          content: toolLabel,
          metadata: payload
        };
        const index = addEntry(entry);
        if (payload.call_id) {
          this.mcpInfoMap.set(payload.call_id, {
            entryIndex: index,
            toolName: toolLabel,
            args,
            content: entry.content
          });
        }
        return true;
      }
      case 'function_call_output': {
        if (!payload.call_id) return true;
        const outputData = safeParseJson(payload.output);

        const shellInfo = this.execInfoMap.get(payload.call_id);
        if (shellInfo) {
          const textOutput =
            typeof outputData?.output === 'string'
              ? outputData.output
              : typeof payload.output === 'string'
                ? payload.output
                : '';
          const meta = outputData?.metadata ?? {};

          const result: CommandRunResult = {};
          const exitCode = typeof meta?.exit_code === 'number' ? meta.exit_code : undefined;
          if (typeof exitCode === 'number') {
            result.exit_status = { type: CommandExitStatusType.EXIT_CODE, code: exitCode };
          } else {
            result.exit_status = { type: CommandExitStatusType.SUCCESS, success: true };
          }
          result.output = textOutput;

          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type: {
              type: 'tool_use',
              tool_name: shellInfo.toolName,
              action_type: {
                action: 'command_run',
                command: shellInfo.command,
                result
              }
            },
            content: shellInfo.content,
            metadata: payload
          };

          replaceEntry(shellInfo.entryIndex, entry);
          this.execInfoMap.delete(payload.call_id);
          return true;
        }

        const toolInfo = this.mcpInfoMap.get(payload.call_id);
        if (toolInfo) {
          const entry: NormalizedEntry = {
            timestamp: null,
            entry_type: {
              type: 'tool_use',
              tool_name: toolInfo.toolName,
              action_type: {
                action: 'tool',
                tool_name: toolInfo.toolName,
                arguments: toolInfo.args,
                result: buildToolResult(outputData)
              }
            },
            content: toolInfo.content,
            metadata: payload
          };
          replaceEntry(toolInfo.entryIndex, entry);
          this.mcpInfoMap.delete(payload.call_id);
        }
        return true;
      }
      default:
        return payload.type === 'token_count';
    }
  }

  private handleEventMessage(
    event: CodexEventMessage,
    addEntry: (entry: NormalizedEntry) => number
  ): boolean {
    const payload = event.payload;
    switch (payload.type) {
      case 'agent_reasoning': {
        const text = filterInstructionTags(payload.text ?? '');
        if (!text) return true;
        if (this.lastReasoning === text) return true;
        this.lastReasoning = text;
        addEntry({
          timestamp: null,
          entry_type: { type: 'thinking' },
          content: text,
          metadata: payload
        });
        return true;
      }
      case 'agent_message': {
        const text = filterInstructionTags(payload.message ?? '');
        if (!text) return true;
        if (this.lastMessageByRole.assistant === text) return true;
        this.lastMessageByRole.assistant = text;
        addEntry({
          timestamp: null,
          entry_type: { type: 'assistant_message' },
          content: text,
          metadata: payload
        });
        return true;
      }
      case 'user_message': {
        const raw =
          typeof payload.message === 'string'
            ? payload.message
            : typeof payload.message === 'object' && payload.message
              ? JSON.stringify(payload.message)
              : (payload.text ?? '');
        const text = filterInstructionTags(raw ?? '');
        if (!text) return true;
        if (this.lastMessageByRole.user === text) return true;
        this.lastMessageByRole.user = text;
        addEntry({
          timestamp: null,
          entry_type: { type: 'user_message' },
          content: text,
          metadata: payload
        });
        return true;
      }
      case 'message': {
        return true;
      }
      default:
        return payload.type === 'token_count';
    }
  }

  private createReplacePatch(entry: NormalizedEntry, index: number) {
    return {
      op: 'replace' as const,
      path: `/entries/${index}`,
      value: {
        type: 'NORMALIZED_ENTRY',
        content: entry
      }
    };
  }

  private createAddPatch(entry: NormalizedEntry, index: number) {
    return {
      op: 'add' as const,
      path: `/entries/${index}`,
      value: {
        type: 'NORMALIZED_ENTRY',
        content: entry
      }
    };
  }

  async streamSessionInfo(session: SessionInfo): Promise<Readable | null> {
    const workspaceFromSession =
      typeof session.workspacePath === 'string' && session.workspacePath.length > 0
        ? session.workspacePath
        : null;
    this.currentWorkspacePath = workspaceFromSession
      ? workspaceFromSession
      : session.projectId
        ? this.decodeProjectId(session.projectId)
        : null;
    this.execInfoMap.clear();
    this.mcpInfoMap.clear();
    this.lastMessageByRole = { user: null, assistant: null };
    this.lastReasoning = null;
    return super.streamSessionInfo(session);
  }

  async getProjectList(): Promise<ProjectInfo[]> {
    try {
      await fs.access(this.CODEX_SESSIONS_DIR);
    } catch {
      return [];
    }

    const sessions = await this.collectSessionMetadata();
    const projects = new Map<string, ProjectInfo>();

    for (const session of sessions) {
      const projectId = this.encodeProjectId(session.workspacePath);
      const name = path.basename(session.workspacePath) || session.workspacePath;
      const existing = projects.get(projectId);

      if (!existing) {
        projects.set(projectId, {
          id: projectId,
          name,
          git_repo_path: session.workspacePath,
          created_at: session.createdAt,
          updated_at: session.updatedAt
        });
        continue;
      }

      if (session.createdAt < existing.created_at) {
        existing.created_at = session.createdAt;
      }
      if (session.updatedAt > existing.updated_at) {
        existing.updated_at = session.updatedAt;
      }
    }

    return Array.from(projects.values()).sort(
      (a, b) => b.updated_at.getTime() - a.updated_at.getTime()
    );
  }

  async getSessionList(projectId: string): Promise<SessionInfo[]> {
    try {
      await fs.access(this.CODEX_SESSIONS_DIR);
    } catch (error) {
      console.error('[CodexLogSource] Session directory not found:', error);
      return [];
    }

    const workspacePath = this.decodeProjectId(projectId);
    const sessions = await this.collectSessionMetadata();

    const results: SessionInfo[] = [];

    for (const session of sessions) {
      if (session.workspacePath !== workspacePath) {
        continue;
      }

      const firstUserMessage =
        (await this.extractFirstUserMessage(session.filePath)) ??
        (session.instructions
          ? filterInstructionTags(session.instructions).replace(/\s+/g, ' ').trim() || null
          : null);

      const normalizedFirstUserMessage = firstUserMessage ?? undefined;
      const fallbackTitle = session.instructions
        ? filterInstructionTags(session.instructions).replace(/\s+/g, ' ').trim()
        : null;
      const displayTitle =
        (normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
          ? normalizedFirstUserMessage
          : fallbackTitle) || `Codex ${session.sessionId.slice(0, 8)}`;

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
        workspacePath: session.workspacePath
      });
    }

    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}

function codexJsonToEntries(json: CodexJson, currentDir: string): NormalizedEntry[] {
  if (isSystemConfig(json)) {
    const content = formatConfigMessage(json);
    if (!content) return [];
    return [
      {
        timestamp: null,
        entry_type: { type: 'system_message' },
        content,
        metadata: json
      }
    ];
  }

  if (!isStructuredMessage(json)) {
    return [];
  }

  const message = json.msg;
  switch (message.type) {
    case 'agent_message':
      return [
        {
          timestamp: null,
          entry_type: { type: 'assistant_message' },
          content: message.message,
          metadata: null
        }
      ];
    case 'agent_reasoning':
      return [
        {
          timestamp: null,
          entry_type: { type: 'thinking' },
          content: message.text,
          metadata: null
        }
      ];
    case 'error': {
      const content = message.message ?? 'Unknown error occurred';
      return [
        {
          timestamp: null,
          entry_type: { type: 'error_message' },
          content,
          metadata: null
        }
      ];
    }
    case 'patch_apply_begin':
      return buildPatchEntries(message.changes, currentDir);
    case 'exec_approval_request': {
      const parts = [`command: \`${message.command.join(' ')}\``];
      if (message.cwd) parts.push(`cwd: ${message.cwd}`);
      if (message.reason) parts.push(`reason: ${message.reason}`);
      return [
        {
          timestamp: null,
          entry_type: { type: 'system_message' },
          content: `Execution approval requested — ${parts.join('  ')}`,
          metadata: null
        }
      ];
    }
    case 'apply_patch_approval_request': {
      const parts = [`files: ${Object.keys(message.changes || {}).length}`];
      if (message.grant_root) parts.push(`grant_root: ${message.grant_root}`);
      if (message.reason) parts.push(`reason: ${message.reason}`);
      return [
        {
          timestamp: null,
          entry_type: { type: 'system_message' },
          content: `Patch approval requested — ${parts.join('  ')}`,
          metadata: null
        }
      ];
    }
    case 'plan_update':
      return [
        {
          timestamp: null,
          entry_type: { type: 'system_message' },
          content: 'Plan update',
          metadata: message.value
        }
      ];
    default:
      return [];
  }
}

function buildPatchEntries(
  changes: Record<string, CodexFileChangePayload>,
  currentDir: string
): NormalizedEntry[] {
  const entries: NormalizedEntry[] = [];
  const currentDirPath = path.resolve(currentDir || '.');

  Object.entries(changes || {}).forEach(([filePath, change]) => {
    const relativePath = makePathRelative(filePath, currentDirPath);
    const fileChanges: FileChange[] = [];

    const normalizedChange = normalizeFileChange(change);

    switch (normalizedChange.type) {
      case 'add':
        fileChanges.push({ action: 'write', content: normalizedChange.content });
        break;
      case 'delete':
        fileChanges.push({ action: 'delete' });
        break;
      case 'update': {
        if (normalizedChange.move_path) {
          const newPath = makePathRelative(normalizedChange.move_path, currentDirPath);
          fileChanges.push({ action: 'rename', new_path: newPath });
        }
        if (normalizedChange.unified_diff) {
          const hunks = extractUnifiedDiffHunks(normalizedChange.unified_diff);
          const diff = concatenateDiffHunks(relativePath, hunks);
          fileChanges.push({
            action: 'edit',
            unified_diff: diff,
            has_line_numbers: true
          });
        }
        break;
      }
    }

    if (fileChanges.length === 0) {
      return;
    }

    entries.push({
      timestamp: null,
      entry_type: {
        type: 'tool_use',
        tool_name: 'edit',
        action_type: {
          action: 'file_edit',
          path: relativePath,
          changes: fileChanges
        }
      },
      content: relativePath,
      metadata: null
    });
  });

  return entries;
}

function normalizeFileChange(
  change: CodexFileChangePayload
):
  | { type: 'add'; content: string }
  | { type: 'delete' }
  | { type: 'update'; unified_diff: string; move_path?: string } {
  const hasContent = Object.prototype.hasOwnProperty.call(change, 'content');
  const hasUnifiedDiff = Object.prototype.hasOwnProperty.call(change, 'unified_diff');
  const hasMovePath = Object.prototype.hasOwnProperty.call(change, 'move_path');

  const contentValue = hasContent ? (change as { content?: unknown }).content : undefined;
  const unifiedDiffValue = hasUnifiedDiff
    ? (change as { unified_diff?: unknown }).unified_diff
    : undefined;
  const movePathValue = hasMovePath ? (change as { move_path?: unknown }).move_path : undefined;

  if (typeof contentValue === 'string') {
    return { type: 'add', content: contentValue };
  }
  if (typeof unifiedDiffValue === 'string') {
    return {
      type: 'update',
      unified_diff: unifiedDiffValue,
      move_path: typeof movePathValue === 'string' ? movePathValue : undefined
    };
  }
  return { type: 'delete' };
}

function buildCommandRunResultFromItem(item: CodexItemBase): CommandRunResult | undefined {
  const result: CommandRunResult = {};
  if (typeof item.exit_code === 'number') {
    result.exit_status = { type: CommandExitStatusType.EXIT_CODE, code: item.exit_code };
  } else if (typeof item.status === 'string') {
    result.exit_status = {
      type: CommandExitStatusType.SUCCESS,
      success: item.status === 'completed'
    };
  }
  const output = item.aggregated_output?.trim();
  if (output) {
    result.output = output;
  }
  return Object.keys(result).length ? result : undefined;
}

function buildFileChangeEntriesFromItem(
  item: CodexItemBase,
  currentDir: string
): NormalizedEntry[] {
  if (!Array.isArray(item.changes) || item.changes.length === 0) {
    return [
      {
        timestamp: null,
        entry_type: { type: 'system_message' },
        content: 'File change reported with no details',
        metadata: item
      }
    ];
  }

  const currentDirPath = path.resolve(currentDir || '.');

  return item.changes.map((change) => {
    const rawPath = typeof change.path === 'string' ? change.path : 'unknown';
    const relativePath = makePathRelative(rawPath, currentDirPath);
    const kind = typeof change.kind === 'string' ? change.kind : 'update';
    const description = `${kind} ${relativePath}`;
    return {
      timestamp: null,
      entry_type: {
        type: 'tool_use',
        tool_name: 'edit',
        action_type: {
          action: 'other',
          description
        }
      },
      content: relativePath,
      metadata: change
    } as NormalizedEntry;
  });
}

function buildEntriesFromItemEvent(item: CodexItemBase, currentDir: string): NormalizedEntry[] {
  switch (item.type) {
    case 'reasoning':
      return item.text
        ? [
            {
              timestamp: null,
              entry_type: { type: 'thinking' },
              content: item.text,
              metadata: item
            }
          ]
        : [];
    case 'agent_message':
      return item.text
        ? [
            {
              timestamp: null,
              entry_type: { type: 'assistant_message' },
              content: item.text,
              metadata: item
            }
          ]
        : [];
    case 'command_execution': {
      const commandText = item.command || '';
      const result = buildCommandRunResultFromItem(item);
      const toolName = commandText.toLowerCase().includes('bash') ? 'Bash' : 'Shell';
      return [
        {
          timestamp: null,
          entry_type: {
            type: 'tool_use',
            tool_name: toolName,
            action_type: {
              action: 'command_run',
              command: commandText,
              result
            }
          },
          content: commandText ? `\`${commandText}\`` : 'command execution',
          metadata: item
        }
      ];
    }
    case 'file_change':
      return buildFileChangeEntriesFromItem(item, currentDir);
    default:
      return [
        {
          timestamp: null,
          entry_type: { type: 'system_message' },
          content: `Unhandled Codex item: ${item.type}`,
          metadata: item
        }
      ];
  }
}

function isResponseItem(json: CodexJson): json is CodexResponseItem {
  return (
    typeof json === 'object' &&
    json !== null &&
    (json as CodexResponseItem).type === 'response_item'
  );
}

function isEventMessage(json: CodexJson): json is CodexEventMessage {
  return (
    typeof json === 'object' && json !== null && (json as CodexEventMessage).type === 'event_msg'
  );
}

function filterInstructionTags(text: string): string {
  return text
    .replace(/<user_instructions>[\s\S]*?<\/user_instructions>/gi, '')
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, '')
    .replace(/<\/?.*?user_instructions>/gi, '')
    .replace(/<\/?.*?environment_context>/gi, '')
    .trim();
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return filterInstructionTags(content);
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return filterInstructionTags(item);
        if (item && typeof item === 'object' && 'text' in item) {
          return filterInstructionTags(String((item as { text?: unknown }).text ?? ''));
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object' && 'text' in content) {
    return filterInstructionTags(String((content as { text?: unknown }).text ?? ''));
  }
  return '';
}

function safeParseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseCodexJson(line: string): CodexJson | null {
  try {
    return JSON.parse(line) as CodexJson;
  } catch (error) {
    logger.debug('[Codex] Failed to parse JSON line:', line, error);
    return null;
  }
}

function mergeCommandOutput(stdout?: string, stderr?: string): string | undefined {
  const trimmedStdout = stdout?.trim() ?? '';
  const trimmedStderr = stderr?.trim() ?? '';

  if (!trimmedStdout && !trimmedStderr) {
    return undefined;
  }
  if (trimmedStdout && trimmedStderr) {
    return `STDOUT:\n${trimmedStdout}\n\nSTDERR:\n${trimmedStderr}`;
  }
  return trimmedStdout || trimmedStderr;
}

function deriveExitStatus(success?: boolean, exitCode?: number) {
  if (typeof success === 'boolean') {
    return {
      type: CommandExitStatusType.SUCCESS,
      success
    } as const;
  }
  if (typeof exitCode === 'number') {
    return {
      type: CommandExitStatusType.EXIT_CODE,
      code: exitCode
    } as const;
  }
  return undefined;
}

function buildToolResult(result: unknown): ToolResult | undefined {
  if (result === undefined) {
    return undefined;
  }
  return {
    type: ToolResultValueType.JSON,
    value: result
  };
}

function isItemEvent(json: CodexJson): json is CodexItemEvent {
  if (typeof json !== 'object' || json === null) {
    return false;
  }
  const maybe = json as { type?: unknown; item?: unknown };
  return (
    typeof maybe.type === 'string' &&
    (maybe.type === 'item.started' || maybe.type === 'item.completed') &&
    typeof maybe.item === 'object' &&
    maybe.item !== null
  );
}

function isTurnEvent(json: CodexJson): json is CodexTurnEvent {
  if (typeof json !== 'object' || json === null) {
    return false;
  }
  const maybe = json as { type?: unknown };
  return (
    typeof maybe.type === 'string' &&
    (maybe.type === 'turn.started' || maybe.type === 'turn.completed')
  );
}

function isThreadStartedEvent(json: CodexJson): json is CodexThreadStartedEvent {
  if (typeof json !== 'object' || json === null) {
    return false;
  }
  const maybe = json as { type?: unknown };
  return maybe.type === 'thread.started';
}

function summarizedTokenUsage(usage?: CodexTokenCount): string | null {
  if (!usage) return null;
  const parts: string[] = [];
  if (typeof usage.input_tokens === 'number') parts.push(`input: ${usage.input_tokens}`);
  if (typeof usage.cached_input_tokens === 'number')
    parts.push(`cached: ${usage.cached_input_tokens}`);
  if (typeof usage.output_tokens === 'number') parts.push(`output: ${usage.output_tokens}`);
  if (typeof usage.total_tokens === 'number') parts.push(`total: ${usage.total_tokens}`);
  return parts.length ? parts.join(', ') : null;
}

function isStructuredMessage(value: CodexJson): value is CodexStructuredMessage {
  return typeof value === 'object' && value !== null && 'msg' in value && 'id' in value;
}

function isSystemConfig(value: CodexJson): value is CodexSystemConfig {
  return typeof value === 'object' && value !== null && !('msg' in value) && !('prompt' in value);
}

function formatConfigMessage(config: CodexSystemConfig): string | null {
  const entries = Object.entries(config);
  if (entries.length === 0) return null;
  const lines = entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return lines.join('\n');
}
