// Export types but exclude ConversationPatch interface (since we have a class with same name)
export {
  ToolResultValueType,
  ToolResult,
  CommandExitStatusType,
  CommandExitStatus,
  CommandRunResult,
  FileChange,
  TodoItem,
  ActionType,
  NormalizedEntryType,
  NormalizedEntry,
  NormalizedConversation,
  MessageBoundary,
  MessageBoundaryResult,
  LogProcessorOptions,
  IEntryIndexProvider,
  hasEntryIndex,
  MetadataWithEntryIndex
} from './types.js';

export * from './conversationPatch.js';
export * from './entryIndexProvider.js';
