import { homedir } from 'os';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';
let cachedDataDir = null;
function resolveCustomDir(dir) {
    if (!dir) {
        return null;
    }
    const trimmed = dir.trim();
    if (!trimmed) {
        return null;
    }
    return path.resolve(trimmed);
}
function resolveDevelopmentDir() {
    const rootCandidate = path.resolve(__dirname, '..', '..', '..');
    const projectRoot = path.basename(rootCandidate) === 'backend' ? path.resolve(rootCandidate, '..') : rootCandidate;
    return path.join(projectRoot, 'data');
}
function resolveProductionDir() {
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
export function getDataDir() {
    if (cachedDataDir) {
        return cachedDataDir;
    }
    const customDir = resolveCustomDir(process.env.CODING_AGENT_DATA_DIR);
    let targetDir;
    if (customDir) {
        targetDir = customDir;
    }
    else {
        const isProduction = process.env.NODE_ENV === 'production';
        targetDir = isProduction ? resolveProductionDir() : resolveDevelopmentDir();
    }
    try {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    catch (error) {
        logger.error(`Failed to create data directory ${targetDir}:`, error);
        throw error;
    }
    cachedDataDir = targetDir;
    return targetDir;
}
function ensureSubDir(...segments) {
    const base = getDataDir();
    const dir = path.join(base, ...segments);
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch (error) {
        logger.error(`Failed to create data subdirectory ${dir}:`, error);
        throw error;
    }
    return dir;
}
export function getConfigFilePath() {
    return path.join(getDataDir(), 'config.json');
}
export function getProfilesFilePath() {
    return path.join(getDataDir(), 'profiles.json');
}
export function getLogsDir() {
    return ensureSubDir('logs');
}
export function getTempDir() {
    return ensureSubDir('temp');
}
export function getCacheDir() {
    return ensureSubDir('cache');
}
export function getCacheSubDir(...segments) {
    return ensureSubDir('cache', ...segments);
}
export function resetCachedDataDir() {
    cachedDataDir = null;
}
//# sourceMappingURL=dataDir.js.map