import { NormalizedEntry, JsonPatchOperation, DiffContent } from './types';
export interface PatchType {
    type: 'NORMALIZED_ENTRY' | 'STDOUT' | 'STDERR' | 'DIFF';
    content: NormalizedEntry | string | DiffContent;
}
/**
 * Helper functions to create JSON patches for conversation entries
 * Matches Rust's ConversationPatch implementation
 */
export declare class ConversationPatch {
    /**
     * Create an ADD patch for a new conversation entry at the given index
     * Matches the exact format from Rust's ConversationPatch::add_normalized_entry
     */
    static addNormalizedEntry(entryIndex: number, entry: NormalizedEntry): JsonPatchOperation[];
    /**
     * Create an ADD patch for stdout content
     */
    static addStdout(entryIndex: number, content: string): JsonPatchOperation[];
    /**
     * Create an ADD patch for stderr content
     */
    static addStderr(entryIndex: number, content: string): JsonPatchOperation[];
    /**
     * Create an ADD patch for a diff
     */
    static addDiff(entryIndex: string, diff: DiffContent): JsonPatchOperation[];
    /**
     * Create a REPLACE patch for updating an existing conversation entry
     */
    static replace(entryIndex: number, entry: NormalizedEntry): JsonPatchOperation[];
    /**
     * Create a REPLACE patch for a diff
     */
    static replaceDiff(entryIndex: string, diff: DiffContent): JsonPatchOperation[];
    /**
     * Create a REMOVE patch for removing an entry
     */
    static removeDiff(entryIndex: string): JsonPatchOperation[];
    /**
     * Escape JSON Pointer segments according to RFC 6901
     */
    static escapeJsonPointerSegment(s: string): string;
}
//# sourceMappingURL=conversationPatch.d.ts.map