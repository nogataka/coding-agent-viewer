export declare enum DiffChangeKind {
    ADDED = "added",
    DELETED = "deleted",
    MODIFIED = "modified",
    RENAMED = "renamed",
    COPIED = "copied",
    PERMISSION_CHANGE = "permission_change"
}
export interface FileDiffDetails {
    file_name?: string;
    content?: string;
}
export interface Diff {
    change: DiffChangeKind;
    old_path?: string;
    new_path?: string;
    old_content?: string;
    new_content?: string;
}
/**
 * Converts a replace diff to a unified diff hunk without the hunk header.
 * The hunk returned will have valid hunk, and diff lines.
 */
export declare function createUnifiedDiffHunk(oldText: string, newText: string): string;
/**
 * Creates a full unified diff with the file path in the header.
 */
export declare function createUnifiedDiff(filePath: string, oldText: string, newText: string): string;
/**
 * Extracts unified diff hunks from a string containing a full unified diff.
 * Tolerates non-diff lines and missing @@ hunk headers.
 */
export declare function extractUnifiedDiffHunks(unifiedDiff: string): string[];
/**
 * Creates a full unified diff with the file path in the header
 */
export declare function concatenateDiffHunks(filePath: string, hunks: string[]): string;
/**
 * Parse unified diff to extract file changes
 */
export declare function parseUnifiedDiff(diffText: string): Diff[];
/**
 * Get diff statistics
 */
export declare function getDiffStats(diffText: string): {
    additions: number;
    deletions: number;
    files: number;
};
/**
 * Apply a unified diff patch to content
 */
export declare function applyUnifiedDiffPatch(originalContent: string, patchText: string): string;
//# sourceMappingURL=diff.d.ts.map