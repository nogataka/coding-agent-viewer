// Log processing types and interfaces

export enum ToolResultValueType {
  MARKDOWN = 'markdown',
  JSON = 'json'
}

export interface ToolResult {
  type: ToolResultValueType;
  /** For Markdown, this will be a JSON string; for JSON, a structured value */
  value: unknown;
}

export enum CommandExitStatusType {
  EXIT_CODE = 'exit_code',
  SUCCESS = 'success'
}

export interface CommandExitStatus {
  type: CommandExitStatusType;
  code?: number;
  success?: boolean;
}

export interface CommandRunResult {
  exit_status?: CommandExitStatus;
  output?: string;
}

// File change types matching Rust's FileChange enum
export type FileChange =
  | { action: 'write'; content: string }
  | { action: 'delete' }
  | { action: 'rename'; new_path: string }
  | { action: 'edit'; unified_diff: string; has_line_numbers: boolean };

export interface TodoItem {
  content: string;
  status: string;
  priority?: string | null;
}

// Action types matching Rust's ActionType enum
export type ActionType =
  | { action: 'file_read'; path: string }
  | { action: 'file_edit'; path: string; changes: FileChange[] }
  | { action: 'command_run'; command: string; result?: CommandRunResult }
  | { action: 'search'; query: string }
  | { action: 'web_fetch'; url: string }
  | {
      action: 'tool';
      tool_name: string;
      arguments?: unknown;
      result?: ToolResult;
    }
  | { action: 'task_create'; description: string }
  | { action: 'plan_presentation'; plan: string }
  | { action: 'todo_management'; todos: TodoItem[]; operation: string }
  | { action: 'other'; description: string };

// NormalizedEntryType as a discriminated union to match Rust's enum
export type NormalizedEntryType =
  | { type: 'user_message' }
  | { type: 'assistant_message' }
  | { type: 'tool_use'; tool_name: string; action_type: ActionType }
  | { type: 'system_message' }
  | { type: 'error_message' }
  | { type: 'thinking' };

export interface NormalizedEntry {
  timestamp: string | null;
  entry_type: NormalizedEntryType;
  content: string;
  metadata: unknown;
}

export interface NormalizedConversation {
  entries: NormalizedEntry[];
  session_id?: string;
  executor_type: string;
  prompt?: string;
  summary?: string;
}

export enum MessageBoundary {
  SPLIT = 'split',
  INCOMPLETE_CONTENT = 'incomplete_content'
}

export interface MessageBoundaryResult {
  type: MessageBoundary;
  split_line?: number;
}

export interface LogProcessorOptions {
  max_line_count?: number;
  max_buffer_size?: number;
  time_gap_threshold?: number; // in milliseconds
  formatter?: (chunk: string) => string;
  message_boundary_predicate?: (
    lines: string[],
    current_entry_type: NormalizedEntryType
  ) => MessageBoundaryResult | null;
}

export interface JsonPatchOperation {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: JsonPatchValue;
}

export type JsonPatchValue = unknown;

export type DiffContent = unknown;

export interface ConversationPatch {
  entry_index: number;
  patch_data: JsonPatchOperation[];
}

export interface MetadataWithEntryIndex {
  entry_index: number;
}

export function hasEntryIndex(metadata: unknown): metadata is MetadataWithEntryIndex {
  if (typeof metadata !== 'object' || metadata === null) {
    return false;
  }

  if (!('entry_index' in metadata)) {
    return false;
  }

  const value = (metadata as { entry_index?: unknown }).entry_index;
  return typeof value === 'number';
}

export interface IEntryIndexProvider {
  getCurrentEntryIndex(): number;
  incrementEntryIndex(): void;
}
