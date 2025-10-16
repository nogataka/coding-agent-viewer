import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { Readable } from 'stream';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
const GEMINI_AGGREGATED_PROJECT_ID = 'aggregated';
const GEMINI_AGGREGATED_PROJECT_NAME = 'Gemini Default Workspace';
const COMPOSITE_SESSION_DELIMITER = '|';
/**
 * Gemini用ログソース
 * セッションファイル: ~/.gemini/tmp/{projectHash}/chats/session-*.json
 */
export class GeminiLogSource extends BaseExecutorLogSource {
    GEMINI_TMP_DIR = path.join(os.homedir(), '.gemini', 'tmp');
    getName() {
        return 'GEMINI';
    }
    parseCompositeSessionId(sessionId) {
        if (sessionId.includes(COMPOSITE_SESSION_DELIMITER)) {
            const [projectHash, rawSessionId] = sessionId.split(COMPOSITE_SESSION_DELIMITER);
            return {
                projectHash: (projectHash?.trim()?.length ?? 0) > 0 ? projectHash : null,
                rawSessionId: rawSessionId ?? ''
            };
        }
        return {
            projectHash: null,
            rawSessionId: sessionId
        };
    }
    buildCompositeSessionId(projectHash, sessionId) {
        return `${projectHash}${COMPOSITE_SESSION_DELIMITER}${sessionId}`;
    }
    async listProjectHashes() {
        try {
            const entries = await fs.readdir(this.GEMINI_TMP_DIR, { withFileTypes: true });
            return entries
                .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
                .map((entry) => entry.name);
        }
        catch (_error) {
            return [];
        }
    }
    async resolveSessionFilePath(executionId, sessionId, _workingDir) {
        if (!sessionId)
            return null;
        const { projectHash, rawSessionId } = this.parseCompositeSessionId(sessionId);
        if (projectHash) {
            const candidate = path.join(this.GEMINI_TMP_DIR, projectHash, 'chats', `session-${rawSessionId}.json`);
            try {
                await fs.access(candidate);
                return candidate;
            }
            catch (_error) {
                // fall back to recursive search below
            }
        }
        try {
            return await this.findSessionFile(this.GEMINI_TMP_DIR, rawSessionId);
        }
        catch {
            return null;
        }
    }
    async findSessionFile(dir, sessionId) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    // 再帰的に検索
                    const result = await this.findSessionFile(fullPath, sessionId);
                    if (result)
                        return result;
                }
                else if (entry.isFile() && entry.name.includes(sessionId)) {
                    return fullPath;
                }
            }
            return null;
        }
        catch {
            return null;
        }
    }
    parseSessionLine(line) {
        // Geminiは単一JSONファイルなので、このメソッドは通常使用されない
        return JSON.parse(line);
    }
    async extractFirstUserMessage(filePath) {
        try {
            const raw = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const messages = data.messages ?? [];
            for (const message of messages) {
                if ((message.type ?? '').toLowerCase() !== 'user') {
                    continue;
                }
                let text = '';
                if (typeof message.content === 'string') {
                    text = message.content;
                }
                else if (Array.isArray(message.content)) {
                    text = message.content
                        .map((item) => {
                        if (typeof item === 'string') {
                            return item;
                        }
                        if (item && typeof item === 'object' && 'text' in item) {
                            return String(item.text ?? '');
                        }
                        return '';
                    })
                        .filter(Boolean)
                        .join(' ');
                }
                else if (message.content && typeof message.content === 'object') {
                    if ('text' in message.content) {
                        text = String(message.content.text ?? '');
                    }
                }
                const sanitized = text.replace(/\s+/g, ' ').trim();
                if (sanitized) {
                    return sanitized.slice(0, 200);
                }
            }
        }
        catch (error) {
            console.warn(`[GeminiLogSource] Failed to extract first user message from ${filePath}`, error);
        }
        return null;
    }
    async collectSessionsForHash(projectHash) {
        const projectDir = path.join(this.GEMINI_TMP_DIR, projectHash);
        const chatsDir = path.join(projectDir, 'chats');
        try {
            await fs.access(chatsDir);
        }
        catch (_error) {
            console.warn(`[GeminiLogSource] Chats directory not found: ${chatsDir}`);
            return [];
        }
        const entries = await fs.readdir(chatsDir, { withFileTypes: true });
        const sessions = [];
        for (const entry of entries) {
            if (!entry.isFile())
                continue;
            if (!entry.name.startsWith('session-'))
                continue;
            if (!entry.name.endsWith('.json'))
                continue;
            const filePath = path.join(chatsDir, entry.name);
            const stats = await fs.stat(filePath).catch(() => null);
            if (!stats) {
                continue;
            }
            const rawSessionId = entry.name.replace('session-', '').replace('.json', '');
            const compositeSessionId = this.buildCompositeSessionId(projectHash, rawSessionId);
            const firstUserMessage = await this.extractFirstUserMessage(filePath);
            const normalizedFirstUserMessage = firstUserMessage
                ? firstUserMessage.replace(/\s+/g, ' ').trim()
                : undefined;
            const title = normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
                ? normalizedFirstUserMessage
                : `Gemini ${rawSessionId}`;
            sessions.push({
                id: compositeSessionId,
                projectId: projectHash,
                filePath,
                title,
                firstUserMessage: normalizedFirstUserMessage,
                status: 'completed',
                createdAt: stats.birthtime,
                updatedAt: stats.mtime,
                fileSize: stats.size,
                workspacePath: path.join(this.GEMINI_TMP_DIR, projectHash)
            });
        }
        return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    async computeAggregatedTimestamps(projectHashes) {
        if (projectHashes.length === 0) {
            const now = new Date();
            return { createdAt: now, updatedAt: now };
        }
        let earliest = null;
        let latest = null;
        for (const hash of projectHashes) {
            const projectDir = path.join(this.GEMINI_TMP_DIR, hash);
            const stats = await fs.stat(projectDir).catch(() => null);
            if (!stats) {
                continue;
            }
            if (!earliest || stats.birthtime < earliest) {
                earliest = stats.birthtime;
            }
            if (!latest || stats.mtime > latest) {
                latest = stats.mtime;
            }
        }
        const fallback = new Date();
        return {
            createdAt: earliest ?? fallback,
            updatedAt: latest ?? fallback,
        };
    }
    async streamCompletedSession(filePath) {
        const stream = new Readable({ read() { } });
        try {
            const raw = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const messages = data.messages ?? [];
            let entryIndex = 0;
            for (const message of messages) {
                const role = message.type === 'user' ? 'user' : 'assistant';
                const payload = {
                    type: 'message',
                    role,
                    content: [{ text: message.content ?? '' }],
                    metadata: {
                        thoughts: message.thoughts,
                        tokens: message.tokens,
                        model: message.model,
                        id: message.id
                    }
                };
                const syntheticEntry = {
                    timestamp: null,
                    type: 'response_item',
                    payload
                };
                const patch = this.convertEntryToJsonPatch(syntheticEntry, entryIndex);
                entryIndex += 1;
                stream.push(`event: json_patch\ndata: ${JSON.stringify([patch])}\n\n`);
            }
            stream.push(`event: finished\ndata: ${JSON.stringify({ message: 'Log stream ended' })}\n\n`);
            stream.push(null);
        }
        catch (error) {
            stream.push(`event: error\ndata: ${JSON.stringify({ error: 'Failed to read Gemini session' })}\n\n`);
            stream.push(null);
            console.error('[GeminiLogSource] Failed to parse session:', error);
        }
        return stream;
    }
    /**
     * プロジェクト一覧を取得
     * GeminiはprojectHashごとに保存されるが、SDKでは集約して1件として扱う
     */
    async getProjectList() {
        try {
            await fs.access(this.GEMINI_TMP_DIR);
        }
        catch (_error) {
            const now = new Date();
            return [
                {
                    id: GEMINI_AGGREGATED_PROJECT_ID,
                    name: GEMINI_AGGREGATED_PROJECT_NAME,
                    git_repo_path: this.GEMINI_TMP_DIR,
                    created_at: now,
                    updated_at: now,
                },
            ];
        }
        const projectHashes = await this.listProjectHashes();
        const timestamps = await this.computeAggregatedTimestamps(projectHashes);
        return [
            {
                id: GEMINI_AGGREGATED_PROJECT_ID,
                name: GEMINI_AGGREGATED_PROJECT_NAME,
                git_repo_path: this.GEMINI_TMP_DIR,
                created_at: timestamps.createdAt,
                updated_at: timestamps.updatedAt,
            },
        ];
    }
    /**
     * 指定プロジェクトのセッション一覧を取得
     */
    async getSessionList(projectId) {
        try {
            if (projectId === GEMINI_AGGREGATED_PROJECT_ID) {
                const hashes = await this.listProjectHashes();
                const allSessionsNested = await Promise.all(hashes.map((hash) => this.collectSessionsForHash(hash)));
                const flattened = allSessionsNested.flat();
                return flattened.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            }
            const sessions = await this.collectSessionsForHash(projectId);
            return sessions;
        }
        catch (error) {
            console.error(`[GeminiLogSource] Error reading sessions for project ${projectId}:`, error);
            return [];
        }
    }
}
//# sourceMappingURL=geminiLogSource.js.map
