import { NormalizedEntry, JsonPatchOperation, DiffContent } from './types.js';

export interface PatchType {
  type: 'NORMALIZED_ENTRY' | 'STDOUT' | 'STDERR' | 'DIFF';
  content: NormalizedEntry | string | DiffContent;
}

/**
 * Helper functions to create JSON patches for conversation entries
 * Matches Rust's ConversationPatch implementation
 */
export class ConversationPatch {
  /**
   * Create an ADD patch for a new conversation entry at the given index
   * Matches the exact format from Rust's ConversationPatch::add_normalized_entry
   */
  static addNormalizedEntry(entryIndex: number, entry: NormalizedEntry): JsonPatchOperation[] {
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
  static addStdout(entryIndex: number, content: string): JsonPatchOperation[] {
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
  static addStderr(entryIndex: number, content: string): JsonPatchOperation[] {
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
  static addDiff(entryIndex: string, diff: DiffContent): JsonPatchOperation[] {
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
  static replace(entryIndex: number, entry: NormalizedEntry): JsonPatchOperation[] {
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
  static replaceDiff(entryIndex: string, diff: DiffContent): JsonPatchOperation[] {
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
  static removeDiff(entryIndex: string): JsonPatchOperation[] {
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
  static escapeJsonPointerSegment(s: string): string {
    return s.replace(/~/g, '~0').replace(/\//g, '~1');
  }
}
