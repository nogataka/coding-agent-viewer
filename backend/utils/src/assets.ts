// Asset directory management - equivalent to Rust's utils/src/assets.rs
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  getCacheDir,
  getDataDir,
  getLogsDir,
  getProfilesFilePath,
  getTempDir,
  getConfigFilePath
} from './dataDir';

/**
 * Get the appropriate asset directory path based on environment
 *
 * Development: PROJECT_ROOT/dev_assets
 * Production: OS-appropriate app data directory
 * - macOS: ~/Library/Application Support/coding-agent-viewer
 * - Linux: ~/.local/share/coding-agent-viewer
 * - Windows: %APPDATA%\coding-agent-viewer
 */
export async function assetDir(): Promise<string> {
  return getDataDir();
}

/**
 * Get the config file path
 */
export async function configPath(): Promise<string> {
  return getConfigFilePath();
}

/**
 * Get the profiles file path
 */
export async function profilesPath(): Promise<string> {
  return getProfilesFilePath();
}

/**
 * Get path for logs directory
 */
export async function logsDir(): Promise<string> {
  return getLogsDir();
}

/**
 * Get path for temp directory
 */
export async function tempDir(): Promise<string> {
  return getTempDir();
}

/**
 * Get path for cache directory
 */
export async function cacheDir(): Promise<string> {
  return getCacheDir();
}

/**
 * Check if a file exists in the asset directory
 */
export async function assetExists(filename: string): Promise<boolean> {
  try {
    const filePath = path.join(getDataDir(), filename);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read asset file content
 */
export async function readAssetFile(filename: string): Promise<string> {
  const filePath = path.join(getDataDir(), filename);
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Write asset file content
 */
export async function writeAssetFile(filename: string, content: string): Promise<void> {
  const filePath = path.join(getDataDir(), filename);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Asset management for embedded content
 * TypeScript/Node.js equivalent of Rust's RustEmbed functionality
 */
export class AssetManager {
  private static scriptsPath: string;

  static async initialize(): Promise<void> {
    // Backend is in /backend, so go up one level to reach project root
    const projectRoot = path.join(process.cwd(), '..');
    this.scriptsPath = path.join(projectRoot, 'assets', 'scripts');

    // Ensure asset directories exist
    await fs.mkdir(this.scriptsPath, { recursive: true });
  }

  static async listScripts(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.scriptsPath);
      return files.filter((file) => file.match(/\.(sh|bat|ps1)$/i));
    } catch {
      return [];
    }
  }

  static async getScriptPath(filename: string): Promise<string | null> {
    const scriptPath = path.join(this.scriptsPath, filename);
    try {
      await fs.access(scriptPath);
      return scriptPath;
    } catch {
      return null;
    }
  }
}
