/**
 * Helper functions to create JSON patches for conversation entries
 * Matches Rust's ConversationPatch implementation
 */
export class ConversationPatch {
    /**
     * Create an ADD patch for a new conversation entry at the given index
     * Matches the exact format from Rust's ConversationPatch::add_normalized_entry
     */
    static addNormalizedEntry(entryIndex, entry) {
        return [
            {
                op: 'add',
                path: `/entries/${entryIndex}`,
                value: {
                    type: 'NORMALIZED_ENTRY',
                    content: entry // Pass the entire entry object, not nested fields
                }
            }
        ];
    }
    /**
     * Create an ADD patch for stdout content
     */
    static addStdout(entryIndex, content) {
        return [
            {
                op: 'add',
                path: `/entries/${entryIndex}`,
                value: {
                    type: 'STDOUT',
                    content
                }
            }
        ];
    }
    /**
     * Create an ADD patch for stderr content
     */
    static addStderr(entryIndex, content) {
        return [
            {
                op: 'add',
                path: `/entries/${entryIndex}`,
                value: {
                    type: 'STDERR',
                    content
                }
            }
        ];
    }
    /**
     * Create an ADD patch for a diff
     */
    static addDiff(entryIndex, diff) {
        return [
            {
                op: 'add',
                path: `/entries/${entryIndex}`,
                value: {
                    type: 'DIFF',
                    content: diff
                }
            }
        ];
    }
    /**
     * Create a REPLACE patch for updating an existing conversation entry
     */
    static replace(entryIndex, entry) {
        return [
            {
                op: 'replace',
                path: `/entries/${entryIndex}`,
                value: {
                    type: 'NORMALIZED_ENTRY',
                    content: entry
                }
            }
        ];
    }
    /**
     * Create a REPLACE patch for a diff
     */
    static replaceDiff(entryIndex, diff) {
        return [
            {
                op: 'replace',
                path: `/entries/${entryIndex}`,
                value: {
                    type: 'DIFF',
                    content: diff
                }
            }
        ];
    }
    /**
     * Create a REMOVE patch for removing an entry
     */
    static removeDiff(entryIndex) {
        return [
            {
                op: 'remove',
                path: `/entries/${entryIndex}`
            }
        ];
    }
    /**
     * Escape JSON Pointer segments according to RFC 6901
     */
    static escapeJsonPointerSegment(s) {
        return s.replace(/~/g, '~0').replace(/\//g, '~1');
    }
}
//# sourceMappingURL=conversationPatch.js.map