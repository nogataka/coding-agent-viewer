import { homedir } from 'os';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';

let cachedDataDir: string | null = null;

function resolveCustomDir(dir: string | undefined): string | null {
  if (!dir) {
    return null;
  }

  const trimmed = dir.trim();
  if (!trimmed) {
    return null;
  }

  return path.resolve(trimmed);
}

function resolveDevelopmentDir(): string {
  const rootCandidate = path.resolve(__dirname, '..', '..', '..');
  const projectRoot =
    path.basename(rootCandidate) === 'backend' ? path.resolve(rootCandidate, '..') : rootCandidate;
  return path.join(projectRoot, 'data');
}

function resolveProductionDir(): string {
  const platform = process.platform;
  const home = homedir();

  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'coding-agent-viewer');
    case 'win32': {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'coding-agent-viewer');
    }
    default: {
      const xdgDataHome = process.env.XDG_DATA_HOME;
      if (xdgDataHome && xdgDataHome.trim()) {
        return path.join(xdgDataHome, 'coding-agent-viewer');
      }
      return path.join(home, '.local', 'share', 'coding-agent-viewer');
    }
  }
}

export function getDataDir(): string {
  if (cachedDataDir) {
    return cachedDataDir;
  }

  const customDir = resolveCustomDir(process.env.CODING_AGENT_DATA_DIR);
  let targetDir: string;

  if (customDir) {
    targetDir = customDir;
  } else {
    const isProduction = process.env.NODE_ENV === 'production';
    targetDir = isProduction ? resolveProductionDir() : resolveDevelopmentDir();
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create data directory ${targetDir}:`, error);
    throw error;
  }

  cachedDataDir = targetDir;
  return targetDir;
}

function ensureSubDir(...segments: string[]): string {
  const base = getDataDir();
  const dir = path.join(base, ...segments);

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create data subdirectory ${dir}:`, error);
    throw error;
  }

  return dir;
}

export function getConfigFilePath(): string {
  return path.join(getDataDir(), 'config.json');
}

export function getProfilesFilePath(): string {
  return path.join(getDataDir(), 'profiles.json');
}

export function getLogsDir(): string {
  return ensureSubDir('logs');
}

export function getTempDir(): string {
  return ensureSubDir('temp');
}

export function getCacheDir(): string {
  return ensureSubDir('cache');
}

export function getCacheSubDir(...segments: string[]): string {
  return ensureSubDir('cache', ...segments);
}

export function resetCachedDataDir(): void {
  cachedDataDir = null;
}
