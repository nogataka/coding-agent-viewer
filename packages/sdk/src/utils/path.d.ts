export declare const VIBE_IMAGES_DIR = ".vibe-images";
/**
 * Convert absolute paths to relative paths based on worktree path
 * Robust implementation that handles symlinks and edge cases
 */
export declare function makePathRelative(targetPath: string, basePath: string): string;
/**
 * Get canonical path, resolving symlinks
 */
export declare function getCanonicalPath(inputPath: string): Promise<string>;
/**
 * Check if a path is within another path (security check)
 */
export declare function isPathWithin(targetPath: string, parentPath: string): boolean;
/**
 * Safe path join that prevents directory traversal
 */
export declare function safePathJoin(basePath: string, ...segments: string[]): string;
/**
 * Get relative path from one absolute path to another
 */
export declare function getRelativePathBetween(fromPath: string, toPath: string): string;
/**
 * Ensure directory exists, creating it if necessary
 */
export declare function ensureDir(dirPath: string): Promise<void>;
/**
 * Get file extension without the dot
 */
export declare function getFileExtension(filePath: string): string;
/**
 * Get filename without extension
 */
export declare function getFilenameWithoutExtension(filePath: string): string;
/**
 * Check if path exists
 */
export declare function pathExists(inputPath: string): Promise<boolean>;
/**
 * Check if path is a directory
 */
export declare function isDirectory(inputPath: string): Promise<boolean>;
/**
 * Check if path is a file
 */
export declare function isFile(inputPath: string): Promise<boolean>;
/**
 * Find common parent directory of multiple paths
 */
export declare function findCommonParent(paths: string[]): string;
/**
 * Create images directory in worktree
 */
export declare function createImagesDir(worktreePath: string): Promise<string>;
/**
 * Get images directory path in worktree
 */
export declare function getImagesDir(worktreePath: string): string;
/**
 * Sanitize path for cross-platform compatibility
 */
export declare function sanitizePath(inputPath: string): string;
/**
 * Get temp file path with unique name
 */
export declare function getTempFilePath(prefix?: string, extension?: string): string;
/**
 * Resolve path relative to project root
 */
export declare function resolveProjectPath(...segments: string[]): string;
/**
 * Get project root directory
 */
export declare function getProjectRoot(): string;
//# sourceMappingURL=path.d.ts.map