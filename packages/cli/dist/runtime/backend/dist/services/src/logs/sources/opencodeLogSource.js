import { BaseExecutorLogSource } from './baseExecutorLogSource';
import { Readable } from 'stream';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
/**
 * Opencode用ログソース
 * セッションファイル: ~/.local/share/opencode/storage/session/ 配下の .json ファイル
 */
export class OpencodeLogSource extends BaseExecutorLogSource {
    OPENCODE_STORAGE_DIR = path.join(os.homedir(), '.local', 'share', 'opencode', 'storage');
    SESSION_DIR = path.join(this.OPENCODE_STORAGE_DIR, 'session');
    encodeProjectId(workspacePath) {
        return Buffer.from(workspacePath).toString('base64url');
    }
    decodeProjectId(projectId) {
        try {
            return Buffer.from(projectId, 'base64url').toString('utf-8');
        }
        catch {
            return projectId;
        }
    }
    toDate(value, fallback) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            const millis = value > 1e12 ? value : value * 1000;
            return new Date(millis);
        }
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return new Date(parsed);
            }
        }
        return fallback;
    }
    async readSessionMetadata(filePath) {
        try {
            const [raw, stats] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)]);
            const parsed = JSON.parse(raw);
            const sessionId = typeof parsed.id === 'string' && parsed.id.length > 0
                ? parsed.id
                : path.basename(filePath, '.json');
            const directory = typeof parsed.directory === 'string' ? parsed.directory : null;
            const title = typeof parsed.title === 'string' && parsed.title.trim().length > 0
                ? parsed.title.trim()
                : null;
            const createdAt = this.toDate(parsed?.time?.created, stats.birthtime);
            const updatedAt = this.toDate(parsed?.time?.updated, stats.mtime);
            return {
                sessionId,
                directory,
                title,
                createdAt,
                updatedAt,
                filePath,
                fileSize: stats.size
            };
        }
        catch (error) {
            return null;
        }
    }
    async collectSessionMetadata() {
        const results = [];
        const walk = async (dir) => {
            let entries;
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(fullPath);
                    continue;
                }
                if (!entry.isFile() || !entry.name.endsWith('.json')) {
                    continue;
                }
                const metadata = await this.readSessionMetadata(fullPath);
                if (metadata) {
                    results.push(metadata);
                }
            }
        };
        await walk(this.SESSION_DIR);
        return results;
    }
    async extractFirstUserMessage(sessionId) {
        const messagesDir = path.join(this.OPENCODE_STORAGE_DIR, 'message', sessionId);
        try {
            const messageFiles = await fs.readdir(messagesDir);
            const messageEntries = await Promise.all(messageFiles
                .filter((file) => file.endsWith('.json'))
                .map(async (file) => {
                const fullPath = path.join(messagesDir, file);
                const raw = await fs.readFile(fullPath, 'utf-8');
                const metadata = JSON.parse(raw);
                const created = this.toMillis(metadata?.time?.created);
                return { metadata, created };
            }));
            messageEntries.sort((a, b) => a.created - b.created);
            for (const entry of messageEntries) {
                const role = String(entry.metadata?.role ?? '').toLowerCase();
                if (role !== 'user') {
                    continue;
                }
                const messageId = String(entry.metadata?.id ?? '');
                if (!messageId) {
                    continue;
                }
                const partsDir = path.join(this.OPENCODE_STORAGE_DIR, 'part', messageId);
                let parts;
                try {
                    const partFiles = await fs.readdir(partsDir);
                    parts = await Promise.all(partFiles.map(async (name, index) => {
                        const full = path.join(partsDir, name);
                        const rawPart = await fs.readFile(full, 'utf-8');
                        const data = JSON.parse(rawPart);
                        return {
                            data,
                            created: this.toMillis(data?.time?.created ?? entry.created),
                            order: index
                        };
                    }));
                    parts.sort((a, b) => a.created === b.created ? a.order - b.order : a.created - b.created);
                }
                catch {
                    parts = [];
                }
                const textFragments = [];
                for (const part of parts) {
                    const type = part.data?.type;
                    if ((type === 'text' || type === 'markdown') && typeof part.data?.text === 'string') {
                        const cleaned = part.data.text.replace(/\s+/g, ' ').trim();
                        if (cleaned) {
                            textFragments.push(cleaned);
                        }
                    }
                }
                const combined = textFragments.join(' ').trim();
                if (combined) {
                    return combined.slice(0, 200);
                }
            }
        }
        catch (error) {
            console.warn(`[OpencodeLogSource] Failed to extract first user message for ${sessionId}`, error);
        }
        return null;
    }
    getName() {
        return 'OPENCODE';
    }
    async resolveSessionFilePath(_executionId, sessionId, _workingDir) {
        if (!sessionId)
            return null;
        const metadata = await this.collectSessionMetadata();
        const match = metadata.find((item) => item.sessionId === sessionId);
        return match?.filePath ?? null;
    }
    parseSessionLine(line) {
        return JSON.parse(line);
    }
    async streamCompletedSession(filePath) {
        const stream = new Readable({ read() { } });
        try {
            const raw = await fs.readFile(filePath, 'utf-8');
            const session = JSON.parse(raw);
            const sessionId = session.id;
            if (!sessionId) {
                throw new Error('Session ID not found in metadata');
            }
            const workspacePath = session.directory ?? '';
            const messagesDir = path.join(this.OPENCODE_STORAGE_DIR, 'message', sessionId);
            let messageEntries; // message metadata list
            try {
                const files = await fs.readdir(messagesDir);
                messageEntries = await Promise.all(files
                    .filter((file) => file.endsWith('.json'))
                    .map(async (file) => {
                    const fullPath = path.join(messagesDir, file);
                    const rawMsg = await fs.readFile(fullPath, 'utf-8');
                    const msg = JSON.parse(rawMsg);
                    const created = this.toMillis(msg?.time?.created);
                    return { path: fullPath, created, metadata: msg };
                }));
            }
            catch (error) {
                throw new Error(`Failed to read messages for session ${sessionId}: ${error}`);
            }
            messageEntries.sort((a, b) => a.created - b.created);
            let entryIndex = 0;
            for (const message of messageEntries) {
                const msg = message.metadata;
                const partsDir = path.join(this.OPENCODE_STORAGE_DIR, 'part', msg.id);
                let parts = [];
                try {
                    const partFiles = await fs.readdir(partsDir);
                    parts = await Promise.all(partFiles.map(async (name, idx) => {
                        const full = path.join(partsDir, name);
                        const rawPart = await fs.readFile(full, 'utf-8');
                        const data = JSON.parse(rawPart);
                        return {
                            data,
                            created: this.toMillis(data?.time?.created ?? msg?.time?.created ?? message.created),
                            order: idx
                        };
                    }));
                    parts.sort((a, b) => a.created === b.created ? a.order - b.order : a.created - b.created);
                }
                catch {
                    // no parts
                }
                let textBuffer = [];
                const flushText = () => {
                    if (textBuffer.length === 0)
                        return;
                    const combined = textBuffer.join('\n\n');
                    textBuffer = [];
                    const entry = {
                        timestamp: null,
                        entry_type: msg.role === 'user' ? { type: 'user_message' } : { type: 'assistant_message' },
                        content: combined,
                        metadata: msg
                    };
                    const patch = this.createPatch(entry, entryIndex);
                    entryIndex += 1;
                    stream.push(`event: json_patch\ndata: ${JSON.stringify([patch])}\n\n`);
                };
                for (const part of parts) {
                    const type = part.data?.type;
                    if (type === 'text' || type === 'markdown') {
                        const text = typeof part.data?.text === 'string' ? part.data.text : '';
                        if (text) {
                            textBuffer.push(text.trim());
                        }
                        continue;
                    }
                    if (type === 'tool') {
                        flushText();
                        const { entry, skip } = this.createToolEntryFromOpencodePart(part.data, workspacePath);
                        if (!skip) {
                            const patch = this.createPatch(entry, entryIndex);
                            entryIndex += 1;
                            stream.push(`event: json_patch\ndata: ${JSON.stringify([patch])}\n\n`);
                        }
                        continue;
                    }
                    // Other part types (step-start, step-finish, plan, etc.)
                    if (type === 'step-start' || type === 'step-finish') {
                        // treat as system messages for now
                        flushText();
                        const label = type === 'step-start' ? 'Step started' : 'Step finished';
                        const entry = {
                            timestamp: null,
                            entry_type: { type: 'system_message' },
                            content: label,
                            metadata: part.data
                        };
                        const patch = this.createPatch(entry, entryIndex);
                        entryIndex += 1;
                        stream.push(`event: json_patch\ndata: ${JSON.stringify([patch])}\n\n`);
                        continue;
                    }
                }
                flushText();
            }
            stream.push(`event: finished\ndata: ${JSON.stringify({ message: 'Log stream ended' })}\n\n`);
            stream.push(null);
        }
        catch (error) {
            console.error('[OpencodeLogSource] Failed to stream session:', error);
            stream.push(`event: error\ndata: ${JSON.stringify({ error: 'Failed to read Opencode session' })}\n\n`);
            stream.push(null);
        }
        return stream;
    }
    createToolEntryFromOpencodePart(part, workspacePath) {
        const tool = String(part?.tool ?? 'tool').toLowerCase();
        const state = part?.state ?? {};
        const input = state.input ?? {};
        const output = state.output ?? state.result ?? state.stdout ?? null;
        const makeEntry = (actionType, content) => ({
            timestamp: null,
            entry_type: {
                type: 'tool_use',
                tool_name: tool,
                action_type: actionType
            },
            content,
            metadata: part
        });
        const relativePath = (value) => {
            if (typeof value !== 'string')
                return 'workspace';
            if (!workspacePath)
                return value;
            if (value.startsWith(workspacePath)) {
                return value.substring(workspacePath.length).replace(/^\//, '') || '.';
            }
            return value;
        };
        switch (tool) {
            case 'read': {
                const pathValue = input.filePath ?? input.path;
                const rel = relativePath(pathValue);
                return {
                    entry: makeEntry({ action: 'file_read', path: rel }, `\`${rel}\``),
                    skip: false
                };
            }
            case 'write':
            case 'create_text_file': {
                const pathValue = input.filePath ?? input.path;
                const rel = relativePath(pathValue);
                const changes = [
                    {
                        action: 'write',
                        content: typeof input.content === 'string' ? input.content : ''
                    }
                ];
                return {
                    entry: makeEntry({ action: 'file_edit', path: rel, changes }, `\`${rel}\``),
                    skip: false
                };
            }
            case 'edit': {
                const pathValue = input.filePath ?? input.path;
                const rel = relativePath(pathValue);
                const diff = typeof input.patch === 'string' ? input.patch : this.stringifyPayload(input);
                const changes = [
                    {
                        action: 'edit',
                        unified_diff: diff,
                        has_line_numbers: false
                    }
                ];
                return {
                    entry: makeEntry({ action: 'file_edit', path: rel, changes }, `\`${rel}\``),
                    skip: false
                };
            }
            case 'delete': {
                const pathValue = input.filePath ?? input.path;
                const rel = relativePath(pathValue);
                const changes = [{ action: 'delete' }];
                return {
                    entry: makeEntry({ action: 'file_edit', path: rel, changes }, `Delete \`${rel}\``),
                    skip: false
                };
            }
            case 'shell': {
                const command = Array.isArray(input.command)
                    ? input.command.join(' ')
                    : input.command || input.cmd || 'shell';
                return {
                    entry: makeEntry({
                        action: 'command_run',
                        command,
                        result: {
                            output: typeof output === 'string' ? output : this.stringifyPayload(output)
                        }
                    }, `\`${command}\``),
                    skip: false
                };
            }
            case 'glob': {
                const query = input.pattern ?? input.glob ?? '*';
                return {
                    entry: makeEntry({ action: 'search', query }, `Find files: \`${query}\``),
                    skip: false
                };
            }
            case 'grep': {
                const query = input.pattern ?? input.query ?? '';
                return {
                    entry: makeEntry({ action: 'search', query }, `\`${query}\``),
                    skip: false
                };
            }
            case 'todo': {
                const todos = Array.isArray(input.todos)
                    ? input.todos.map((item) => ({
                        content: item.content ?? '',
                        status: item.status ?? 'PENDING',
                        priority: item.priority ?? null
                    }))
                    : [];
                return {
                    entry: makeEntry({
                        action: 'todo_management',
                        todos,
                        operation: input.operation ?? 'write'
                    }, 'TODO list updated'),
                    skip: false
                };
            }
            case 'plan': {
                const plan = typeof input.plan === 'string' ? input.plan : this.stringifyPayload(input.plan ?? output);
                return {
                    entry: makeEntry({ action: 'plan_presentation', plan }, 'Plan updated'),
                    skip: false
                };
            }
            default: {
                const description = `Tool: ${tool}`;
                return {
                    entry: makeEntry({ action: 'other', description }, description),
                    skip: false
                };
            }
        }
    }
    toMillis(value) {
        if (typeof value === 'number') {
            return value > 1e12 ? value : value * 1000;
        }
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
        return Date.now();
    }
    toIso(value) {
        if (!value)
            return null;
        try {
            return new Date(value).toISOString();
        }
        catch {
            return null;
        }
    }
    createPatch(entry, index) {
        return {
            op: 'add',
            path: `/entries/${index}`,
            value: {
                type: 'NORMALIZED_ENTRY',
                content: entry
            }
        };
    }
    /**
     * プロジェクト一覧を取得
     * セッションメタデータの directory 単位でグルーピングする
     */
    async getProjectList() {
        try {
            await fs.access(this.SESSION_DIR);
        }
        catch {
            return [];
        }
        const sessions = await this.collectSessionMetadata();
        const projects = new Map();
        for (const session of sessions) {
            const directory = session.directory?.trim();
            if (!directory) {
                continue;
            }
            const projectId = this.encodeProjectId(directory);
            const name = path.basename(directory) || directory;
            const existing = projects.get(projectId);
            if (!existing) {
                projects.set(projectId, {
                    id: projectId,
                    name,
                    git_repo_path: directory,
                    created_at: session.createdAt,
                    updated_at: session.updatedAt
                });
            }
            else {
                existing.created_at =
                    session.createdAt < existing.created_at ? session.createdAt : existing.created_at;
                existing.updated_at =
                    session.updatedAt > existing.updated_at ? session.updatedAt : existing.updated_at;
            }
        }
        return Array.from(projects.values()).sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
    }
    /**
     * 指定プロジェクトのセッション一覧を取得
     */
    async getSessionList(projectId) {
        try {
            await fs.access(this.SESSION_DIR);
        }
        catch (error) {
            console.error('[OpencodeLogSource] Session directory not found:', error);
            return [];
        }
        const targetDirectory = this.decodeProjectId(projectId).trim();
        const sessions = await this.collectSessionMetadata();
        const results = [];
        for (const session of sessions) {
            if (session.directory?.trim() !== targetDirectory) {
                continue;
            }
            const firstUserMessage = await this.extractFirstUserMessage(session.sessionId);
            const normalizedFirstUserMessage = firstUserMessage
                ? firstUserMessage.replace(/\s+/g, ' ').trim()
                : undefined;
            const fallbackTitle = session.title || `Opencode ${session.sessionId.slice(0, 8)}`;
            const displayTitle = normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
                ? normalizedFirstUserMessage
                : fallbackTitle;
            results.push({
                id: session.sessionId,
                projectId,
                filePath: session.filePath,
                title: displayTitle,
                firstUserMessage: normalizedFirstUserMessage,
                status: 'completed',
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                fileSize: session.fileSize,
                workspacePath: targetDirectory
            });
        }
        return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
}
//# sourceMappingURL=opencodeLogSource.js.map