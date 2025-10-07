import { access, open, readdir, stat } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const SESSION_FILE_EXTENSION = '.jsonl';
const SESSION_SCAN_INTERVAL_MS = 500;
const SESSION_HEADER_READ_BYTES = 64 * 1024;
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
const readSessionMetaLine = async (filePath) => {
    let handle = null;
    try {
        handle = await open(filePath, 'r');
        const buffer = Buffer.alloc(SESSION_HEADER_READ_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead <= 0) {
            return null;
        }
        const content = buffer.toString('utf-8', 0, bytesRead);
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed.type === 'session_meta' && parsed.payload) {
                    const payload = parsed.payload;
                    const idValue = typeof payload.id === 'string' ? payload.id : null;
                    const cwdValue = typeof payload.cwd === 'string' ? payload.cwd : null;
                    const timestampValue = typeof payload.timestamp === 'string' ? payload.timestamp : null;
                    return {
                        id: idValue,
                        cwd: cwdValue,
                        timestamp: timestampValue
                    };
                }
            }
            catch (error) {
                // Ignore malformed JSON in non-session_meta lines
                return null;
            }
            break;
        }
        return null;
    }
    catch (error) {
        return null;
    }
    finally {
        if (handle) {
            await handle.close().catch(() => undefined);
        }
    }
};
const findLatestCodexSessionUuid = async (workspacePath, startedAt) => {
    const normalizedWorkspace = normalizePath(workspacePath);
    const launchedAtMs = startedAt.getTime();
    try {
        await access(CODEX_SESSIONS_DIR);
    }
    catch (error) {
        return null;
    }
    const stack = [CODEX_SESSIONS_DIR];
    let candidate = null;
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current)
            continue;
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        }
        catch (error) {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (!entry.isFile() || !entry.name.endsWith(SESSION_FILE_EXTENSION)) {
                continue;
            }
            let stats;
            try {
                stats = await stat(fullPath);
            }
            catch (error) {
                continue;
            }
            if (stats.mtimeMs + 500 < launchedAtMs) {
                continue;
            }
            const meta = await readSessionMetaLine(fullPath);
            if (!meta || !meta.id) {
                continue;
            }
            const metaWorkspace = normalizePath(meta.cwd);
            if (!metaWorkspace || !normalizedWorkspace || metaWorkspace !== normalizedWorkspace) {
                continue;
            }
            if (meta.timestamp) {
                const parsedTs = Date.parse(meta.timestamp);
                if (!Number.isNaN(parsedTs) && parsedTs + 500 < launchedAtMs) {
                    continue;
                }
            }
            if (!candidate || stats.mtimeMs > candidate.mtimeMs) {
                candidate = { uuid: meta.id, mtimeMs: stats.mtimeMs };
            }
        }
    }
    return candidate?.uuid ?? null;
};
const resolveCodexSessionIdFromFilesystem = async (context) => {
    const deadline = context.startedAt.getTime() + context.timeoutMs;
    while (Date.now() < deadline) {
        const uuid = await findLatestCodexSessionUuid(context.request.workspacePath, context.startedAt);
        if (uuid) {
            return uuid;
        }
        await delay(SESSION_SCAN_INTERVAL_MS);
    }
    return null;
};
const parseCompositeSessionId = (sessionId) => {
    const [executorType, projectPart, ...rest] = sessionId.split(':');
    if (!executorType || !projectPart || rest.length === 0) {
        return null;
    }
    return {
        executorType,
        actualProjectId: projectPart,
        actualSessionId: rest.join(':')
    };
};
const createCodexSessionResolver = () => {
    let buffer = '';
    return {
        handleChunk(chunk) {
            buffer += chunk;
            let newlineIndex = buffer.indexOf('\n');
            while (newlineIndex >= 0) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (line.length > 0) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.type === 'session_meta') {
                            const sessionIdValue = parsed.payload?.id;
                            if (typeof sessionIdValue === 'string') {
                                return sessionIdValue;
                            }
                        }
                    }
                    catch (error) {
                        // Ignore non-JSON lines; Codex streams logs interleaved with other output
                    }
                }
                newlineIndex = buffer.indexOf('\n');
            }
            return null;
        }
    };
};
const buildCodexParameters = (command, request) => {
    const args = [...command.args];
    const message = request.kind === 'new'
        ? request.prompt
        : request.message;
    if (!message || message.trim().length === 0) {
        throw new Error('Message is required for Codex execution');
    }
    args.push('--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write={network_access=true,writable_roots=["~/.cache","~/.uv"]}', '-c', 'mcp_servers.serena.startup_timeout_sec=30', '--cd', request.workspacePath);
    if (request.kind === 'follow-up') {
        const parsed = parseCompositeSessionId(request.sessionId);
        if (!parsed || !parsed.actualSessionId) {
            throw new Error('Invalid session identifier for Codex follow-up');
        }
        args.push('resume', parsed.actualSessionId, message);
    }
    else {
        args.push(message);
    }
    return {
        args,
        createSessionIdResolver: request.kind === 'new' ? () => createCodexSessionResolver() : undefined,
        resolveSessionId: request.kind === 'new' ? resolveCodexSessionIdFromFilesystem : undefined
    };
};
export const codexProfile = {
    label: 'codex',
    command: {
        binary: 'npx',
        args: [
            '-y',
            '@openai/codex',
            'exec',
            '--json',
            '--dangerously-bypass-approvals-and-sandbox',
            '--skip-git-repo-check'
        ]
    },
    buildProcessParameters: buildCodexParameters
};
//# sourceMappingURL=codex.js.map