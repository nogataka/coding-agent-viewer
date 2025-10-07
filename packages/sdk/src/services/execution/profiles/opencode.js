import * as path from 'path';
import * as os from 'os';
import { readFile, readdir, stat } from 'fs/promises';
const OPENCODE_STORAGE_ROOT = path.join(os.homedir(), '.local', 'share', 'opencode', 'storage');
const SESSION_DIR = path.join(OPENCODE_STORAGE_ROOT, 'session');
const SESSION_SCAN_INTERVAL_MS = 500;
const SESSION_STALENESS_ALLOWANCE_MS = 5_000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizePath = (value) => {
    if (!value) {
        return null;
    }
    try {
        return path.resolve(value);
    }
    catch {
        return value;
    }
};
const encodeWorkspace = (workspacePath) => {
    return Buffer.from(workspacePath).toString('base64url');
};
const parseCompositeSessionId = (sessionId) => {
    const [executorType, projectId, ...rest] = sessionId.split(':');
    if (!executorType || !projectId || rest.length === 0) {
        return null;
    }
    return {
        executorType,
        actualProjectId: projectId,
        actualSessionId: rest.join(':')
    };
};
const readSessionMetadata = async (filePath) => {
    try {
        const raw = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const createdValue = parsed.time?.created;
        const updatedValue = parsed.time?.updated;
        const toMillis = (value) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value > 1e12 ? value : value * 1000;
            }
            if (typeof value === 'string') {
                const parsedValue = Date.parse(value);
                if (!Number.isNaN(parsedValue)) {
                    return parsedValue;
                }
            }
            return null;
        };
        return {
            id: typeof parsed.id === 'string' ? parsed.id : null,
            directory: typeof parsed.directory === 'string' ? parsed.directory : null,
            createdAtMs: toMillis(createdValue),
            updatedAtMs: toMillis(updatedValue)
        };
    }
    catch {
        return null;
    }
};
const findLatestSessionUuid = async (projectId, workspacePath, startedAt) => {
    const candidateDirs = new Set();
    if (projectId) {
        candidateDirs.add(path.join(SESSION_DIR, projectId));
    }
    if (workspacePath) {
        candidateDirs.add(path.join(SESSION_DIR, encodeWorkspace(workspacePath)));
    }
    const normalizedWorkspace = normalizePath(workspacePath);
    const launchedAtMs = startedAt.getTime();
    let best = null;
    for (const dir of candidateDirs) {
        let entries;
        try {
            entries = await readdir(dir);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.endsWith('.json')) {
                continue;
            }
            const fullPath = path.join(dir, entry);
            const metadata = await readSessionMetadata(fullPath);
            if (!metadata || !metadata.id) {
                continue;
            }
            const stats = await stat(fullPath).catch(() => null);
            const updatedAtMs = metadata.updatedAtMs ?? stats?.mtimeMs ?? null;
            if (!updatedAtMs) {
                continue;
            }
            if (updatedAtMs + SESSION_STALENESS_ALLOWANCE_MS < launchedAtMs) {
                continue;
            }
            if (normalizedWorkspace && metadata.directory) {
                const normalizedDirectory = normalizePath(metadata.directory);
                if (normalizedDirectory && normalizedDirectory !== normalizedWorkspace) {
                    continue;
                }
            }
            if (!best || updatedAtMs > best.updatedAtMs) {
                best = { sessionId: metadata.id, updatedAtMs };
            }
        }
    }
    return best?.sessionId ?? null;
};
const resolveOpencodeSessionIdFromFilesystem = async (context) => {
    const deadline = context.startedAt.getTime() + context.timeoutMs;
    while (Date.now() < deadline) {
        const sessionUuid = await findLatestSessionUuid(context.request.actualProjectId, context.request.workspacePath, context.startedAt);
        if (sessionUuid) {
            return sessionUuid;
        }
        await delay(SESSION_SCAN_INTERVAL_MS);
    }
    return null;
};
const createOpencodeSessionResolver = () => {
    let buffer = '';
    const tryExtract = (line) => {
        if (!line) {
            return null;
        }
        try {
            const parsed = JSON.parse(line);
            const candidates = [
                parsed.sessionID,
                parsed.sessionId,
                parsed.session_id
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim().length > 0) {
                    return candidate.trim();
                }
            }
        }
        catch {
            // ignore json parse errors; fallback to regex
        }
        const regex = /"sessionID"\s*:\s*"([^"]+)"/i;
        const directMatch = regex.exec(line);
        if (directMatch) {
            return directMatch[1];
        }
        return null;
    };
    return {
        handleChunk(chunk) {
            buffer += chunk;
            let newlineIndex = buffer.indexOf('\n');
            while (newlineIndex >= 0) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                const maybe = tryExtract(line);
                if (maybe) {
                    return maybe;
                }
                newlineIndex = buffer.indexOf('\n');
            }
            return null;
        }
    };
};
const buildOpencodeParameters = (command, request) => {
    const args = [...command.args];
    const payload = request.kind === 'new'
        ? request.prompt
        : request.message;
    if (request.kind === 'follow-up') {
        const parsed = parseCompositeSessionId(request.sessionId);
        if (!parsed || !parsed.actualSessionId) {
            throw new Error('Invalid session identifier for Opencode follow-up');
        }
        args.push('--session', parsed.actualSessionId);
    }
    return {
        args,
        stdinPayload: payload && payload.length > 0 ? payload : undefined,
        createSessionIdResolver: request.kind === 'new' ? () => createOpencodeSessionResolver() : undefined,
        resolveSessionId: request.kind === 'new' ? resolveOpencodeSessionIdFromFilesystem : undefined
    };
};
export const opencodeProfile = {
    label: 'opencode',
    command: {
        binary: 'npx',
        args: ['-y', 'opencode-ai@latest', 'run', '--print-logs']
    },
    buildProcessParameters: buildOpencodeParameters
};
//# sourceMappingURL=opencode.js.map