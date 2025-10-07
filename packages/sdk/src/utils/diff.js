// Diff utilities - equivalent to Rust's utils/src/diff.rs
import * as diffLib from 'diff';
export var DiffChangeKind;
(function (DiffChangeKind) {
    DiffChangeKind["ADDED"] = "added";
    DiffChangeKind["DELETED"] = "deleted";
    DiffChangeKind["MODIFIED"] = "modified";
    DiffChangeKind["RENAMED"] = "renamed";
    DiffChangeKind["COPIED"] = "copied";
    DiffChangeKind["PERMISSION_CHANGE"] = "permission_change";
})(DiffChangeKind || (DiffChangeKind = {}));
/**
 * Converts a replace diff to a unified diff hunk without the hunk header.
 * The hunk returned will have valid hunk, and diff lines.
 */
export function createUnifiedDiffHunk(oldText, newText) {
    // Normalize ending line feed to optimize diff output
    let normalizedOld = oldText;
    let normalizedNew = newText;
    if (!normalizedOld.endsWith('\n')) {
        normalizedOld += '\n';
    }
    if (!normalizedNew.endsWith('\n')) {
        normalizedNew += '\n';
    }
    // Generate unified diff
    const patch = diffLib.createTwoFilesPatch('', '', normalizedOld, normalizedNew, '', '', {
        context: 3
    });
    // Extract just the diff lines (skip file headers)
    const lines = patch.split('\n');
    const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'));
    if (hunkStartIndex === -1) {
        return '';
    }
    return lines.slice(hunkStartIndex).join('\n');
}
/**
 * Creates a full unified diff with the file path in the header.
 */
export function createUnifiedDiff(filePath, oldText, newText) {
    const patch = diffLib.createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, oldText, newText, '', '');
    return patch;
}
/**
 * Extracts unified diff hunks from a string containing a full unified diff.
 * Tolerates non-diff lines and missing @@ hunk headers.
 */
export function extractUnifiedDiffHunks(unifiedDiff) {
    const lines = unifiedDiff.split('\n');
    // Check if we have any @@ hunk headers
    const hasHunkHeaders = lines.some((line) => line.startsWith('@@'));
    if (!hasHunkHeaders) {
        // No @@ hunk headers: treat as a single hunk
        const diffLines = lines.filter((line) => line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'));
        if (diffLines.length === 0) {
            return [];
        }
        const oldCount = lines.filter((line) => line.startsWith('-') || line.startsWith(' ')).length;
        const newCount = lines.filter((line) => line.startsWith('+') || line.startsWith(' ')).length;
        const hunkHeader = `@@ -1,${oldCount} +1,${newCount} @@`;
        return [hunkHeader + '\n' + diffLines.join('\n')];
    }
    // Collect hunks starting with @@ headers
    const hunks = [];
    let currentHunk = [];
    let inHunk = false;
    for (const line of lines) {
        if (line.startsWith('@@')) {
            // New hunk starts
            if (inHunk && currentHunk.length > 0) {
                // Flush current hunk
                hunks.push(currentHunk.join('\n'));
            }
            currentHunk = [line];
            inHunk = true;
        }
        else if (inHunk) {
            if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
                // Hunk content
                currentHunk.push(line);
            }
            else {
                // Unknown line, flush current hunk
                if (currentHunk.length > 0) {
                    hunks.push(currentHunk.join('\n'));
                }
                currentHunk = [];
                inHunk = false;
            }
        }
    }
    // Flush the last hunk if it exists
    if (inHunk && currentHunk.length > 0) {
        hunks.push(currentHunk.join('\n'));
    }
    // Fix hunk headers if they are empty @@
    return fixHunkHeaders(hunks);
}
/**
 * Helper function to ensure valid hunk headers
 */
function fixHunkHeaders(hunks) {
    if (hunks.length === 0) {
        return hunks;
    }
    const newHunks = [];
    for (const hunk of hunks) {
        const lines = hunk.split('\n');
        if (lines.length < 2) {
            // Empty hunk, skip
            continue;
        }
        const header = lines[0];
        if (!header.startsWith('@@')) {
            // No header, skip
            continue;
        }
        if (header.trim() === '@@') {
            // Empty header, replace with a valid one
            const contentLines = lines.slice(1);
            const oldCount = contentLines.filter((line) => line.startsWith('-') || line.startsWith(' ')).length;
            const newCount = contentLines.filter((line) => line.startsWith('+') || line.startsWith(' ')).length;
            const newHeader = `@@ -1,${oldCount} +1,${newCount} @@`;
            const fixedHunk = [newHeader, ...contentLines].join('\n');
            newHunks.push(fixedHunk);
        }
        else {
            // Valid header, keep as is
            newHunks.push(hunk);
        }
    }
    return newHunks;
}
/**
 * Creates a full unified diff with the file path in the header
 */
export function concatenateDiffHunks(filePath, hunks) {
    let unifiedDiff = '';
    const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
    unifiedDiff += header;
    if (hunks.length > 0) {
        const allLines = hunks
            .flatMap((hunk) => hunk.split('\n'))
            .filter((line) => line.startsWith('@@ ') ||
            line.startsWith(' ') ||
            line.startsWith('+') ||
            line.startsWith('-'));
        unifiedDiff += allLines.join('\n');
        if (!unifiedDiff.endsWith('\n')) {
            unifiedDiff += '\n';
        }
    }
    return unifiedDiff;
}
/**
 * Parse unified diff to extract file changes
 */
export function parseUnifiedDiff(diffText) {
    const diffs = [];
    const patches = diffLib.parsePatch(diffText);
    for (const patch of patches) {
        const change = patch.newFileName && patch.oldFileName
            ? patch.newFileName !== patch.oldFileName
                ? DiffChangeKind.RENAMED
                : DiffChangeKind.MODIFIED
            : patch.newFileName
                ? DiffChangeKind.ADDED
                : DiffChangeKind.DELETED;
        // Reconstruct file content from hunks
        let oldContent = '';
        let newContent = '';
        for (const hunk of patch.hunks) {
            for (const line of hunk.lines) {
                const content = line.substring(1); // Remove +, -, or space prefix
                if (line.startsWith(' ') || line.startsWith('-')) {
                    oldContent += content + '\n';
                }
                if (line.startsWith(' ') || line.startsWith('+')) {
                    newContent += content + '\n';
                }
            }
        }
        diffs.push({
            change,
            old_path: patch.oldFileName || undefined,
            new_path: patch.newFileName || undefined,
            old_content: oldContent || undefined,
            new_content: newContent || undefined
        });
    }
    return diffs;
}
/**
 * Get diff statistics
 */
export function getDiffStats(diffText) {
    const patches = diffLib.parsePatch(diffText);
    let additions = 0;
    let deletions = 0;
    for (const patch of patches) {
        for (const hunk of patch.hunks) {
            for (const line of hunk.lines) {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    additions++;
                }
                else if (line.startsWith('-') && !line.startsWith('---')) {
                    deletions++;
                }
            }
        }
    }
    return {
        additions,
        deletions,
        files: patches.length
    };
}
/**
 * Apply a unified diff patch to content
 */
export function applyUnifiedDiffPatch(originalContent, patchText) {
    try {
        const patches = diffLib.parsePatch(patchText);
        if (patches.length === 0) {
            return originalContent;
        }
        return diffLib.applyPatch(originalContent, patches[0]) || originalContent;
    }
    catch (error) {
        throw new Error(`Failed to apply patch: ${error}`);
    }
}
//# sourceMappingURL=diff.js.map