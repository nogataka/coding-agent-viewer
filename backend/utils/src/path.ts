// Path utilities - equivalent to Rust's utils/src/path.rs
import * as path from 'path';
import * as fs from 'fs/promises';
import { accessSync } from 'fs';
import * as os from 'os';
import { logger } from './logger';

// Directory name for storing images in worktrees
export const VIBE_IMAGES_DIR = '.vibe-images';

/**
 * Convert absolute paths to relative paths based on worktree path
 * Robust implementation that handles symlinks and edge cases
 */
export function makePathRelative(targetPath: string, basePath: string): string {
  logger.debug(`Making path relative: ${targetPath} -> ${basePath}`);

  // If path is already relative, return as is
  if (!path.isAbsolute(targetPath)) {
    return targetPath;
  }

  const normalizedTarget = path.normalize(targetPath);
  const normalizedBase = path.normalize(basePath);

  // Handle macOS /private alias normalization
  const resolvedTarget = normalizeMacOSPrivateAlias(normalizedTarget);
  const resolvedBase = normalizeMacOSPrivateAlias(normalizedBase);

  try {
    const relativePath = path.relative(resolvedBase, resolvedTarget);

    if (relativePath === '') {
      return '.';
    }

    logger.debug(`Successfully made relative: '${targetPath}' -> '${relativePath}'`);
    return relativePath;
  } catch (error) {
    logger.warn(`Failed to make path relative, returning original: ${error}`);
    return targetPath;
  }
}

/**
 * Normalize macOS /private alias paths
 * macOS sometimes uses /private prefix for system paths
 */
function normalizeMacOSPrivateAlias(inputPath: string): string {
  if (process.platform === 'darwin' && inputPath.startsWith('/private/')) {
    const withoutPrivate = inputPath.substring(8); // Remove '/private'
    // Check if the path without /private exists
    try {
      accessSync(withoutPrivate);
      return withoutPrivate;
    } catch {
      // If it doesn't exist, keep the original
      return inputPath;
    }
  }
  return inputPath;
}

/**
 * Get canonical path, resolving symlinks
 */
export async function getCanonicalPath(inputPath: string): Promise<string> {
  try {
    const realPath = await fs.realpath(inputPath);
    return path.normalize(realPath);
  } catch (error) {
    logger.warn(`Failed to get canonical path for ${inputPath}:`, error);
    return path.normalize(inputPath);
  }
}

/**
 * Check if a path is within another path (security check)
 */
export function isPathWithin(targetPath: string, parentPath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedParent = path.resolve(parentPath);

  return (
    normalizedTarget.startsWith(normalizedParent + path.sep) ||
    normalizedTarget === normalizedParent
  );
}

/**
 * Safe path join that prevents directory traversal
 */
export function safePathJoin(basePath: string, ...segments: string[]): string {
  const joined = path.join(basePath, ...segments);

  if (!isPathWithin(joined, basePath)) {
    throw new Error(`Path traversal attempt detected: ${segments.join('/')}`);
  }

  return joined;
}

/**
 * Get relative path from one absolute path to another
 */
export function getRelativePathBetween(fromPath: string, toPath: string): string {
  return path.relative(fromPath, toPath);
}

/**
 * Ensure directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to ensure directory ${dirPath}: ${error}`);
  }
}

/**
 * Get file extension without the dot
 */
export function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.substring(1) : ext;
}

/**
 * Get filename without extension
 */
export function getFilenameWithoutExtension(filePath: string): string {
  const basename = path.basename(filePath);
  const ext = path.extname(basename);
  return basename.substring(0, basename.length - ext.length);
}

/**
 * Check if path exists
 */
export async function pathExists(inputPath: string): Promise<boolean> {
  try {
    await fs.access(inputPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(inputPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(inputPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 */
export async function isFile(inputPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(inputPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Find common parent directory of multiple paths
 */
export function findCommonParent(paths: string[]): string {
  if (paths.length === 0) {
    return '';
  }

  if (paths.length === 1) {
    return path.dirname(paths[0]);
  }

  // Normalize all paths
  const normalizedPaths = paths.map((p) => path.resolve(p));

  // Split into components
  const pathComponents = normalizedPaths.map((p) => p.split(path.sep));

  // Find common prefix
  const minLength = Math.min(...pathComponents.map((p) => p.length));
  const commonComponents: string[] = [];

  for (let i = 0; i < minLength; i++) {
    const component = pathComponents[0][i];
    if (pathComponents.every((p) => p[i] === component)) {
      commonComponents.push(component);
    } else {
      break;
    }
  }

  return commonComponents.join(path.sep) || path.sep;
}

/**
 * Create images directory in worktree
 */
export async function createImagesDir(worktreePath: string): Promise<string> {
  const imagesDirPath = path.join(worktreePath, VIBE_IMAGES_DIR);
  await ensureDir(imagesDirPath);
  return imagesDirPath;
}

/**
 * Get images directory path in worktree
 */
export function getImagesDir(worktreePath: string): string {
  return path.join(worktreePath, VIBE_IMAGES_DIR);
}

/**
 * Sanitize path for cross-platform compatibility
 */
export function sanitizePath(inputPath: string): string {
  // Replace invalid characters
  let sanitized = inputPath.replace(/[<>:"|?*]/g, '_');

  // Handle platform-specific issues
  if (process.platform === 'win32') {
    // Windows doesn't allow certain names
    const forbidden = [
      'CON',
      'PRN',
      'AUX',
      'NUL',
      'COM1',
      'COM2',
      'COM3',
      'COM4',
      'COM5',
      'COM6',
      'COM7',
      'COM8',
      'COM9',
      'LPT1',
      'LPT2',
      'LPT3',
      'LPT4',
      'LPT5',
      'LPT6',
      'LPT7',
      'LPT8',
      'LPT9'
    ];
    const pathParts = sanitized.split(path.sep);

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i].toUpperCase();
      if (forbidden.includes(part)) {
        pathParts[i] = `_${pathParts[i]}`;
      }
    }

    sanitized = pathParts.join(path.sep);
  }

  return sanitized;
}

/**
 * Get temp file path with unique name
 */
export function getTempFilePath(prefix: string = 'temp', extension: string = ''): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const filename = `${prefix}_${timestamp}_${random}${extension ? '.' + extension : ''}`;
  return path.join(os.tmpdir(), filename);
}

/**
 * Resolve path relative to project root
 */
export function resolveProjectPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments);
}

/**
 * Get project root directory
 */
export function getProjectRoot(): string {
  return process.cwd();
}
