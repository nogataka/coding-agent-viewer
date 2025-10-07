import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { Readable } from 'stream';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
/**
 * Gemini用ログソース
 * セッションファイル: ~/.gemini/tmp/{projectHash}/chats/session-*.json
 */
export class GeminiLogSource extends BaseExecutorLogSource {
    GEMINI_TMP_DIR = path.join(os.homedir(), '.gemini', 'tmp');
    getName() {
        return 'GEMINI';
    }
    async resolveSessionFilePath(executionId, sessionId, _workingDir) {
        if (!sessionId)
            return null;
        try {
            // ~/.gemini/tmp/ 以下を検索してsessionIdを含むファイルを探す
            return await this.findSessionFile(this.GEMINI_TMP_DIR, sessionId);
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
     * Geminiは各projectHashをプロジェクトとして扱う
     */
    async getProjectList() {
        try {
            await fs.access(this.GEMINI_TMP_DIR);
            const entries = await fs.readdir(this.GEMINI_TMP_DIR, { withFileTypes: true });
            const projects = [];
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                if (entry.name.startsWith('.'))
                    continue;
                const projectDir = path.join(this.GEMINI_TMP_DIR, entry.name);
                const stats = await fs.stat(projectDir);
                projects.push({
                    id: entry.name, // projectHash
                    name: `Gemini Project (${entry.name.substring(0, 8)}...)`,
                    git_repo_path: projectDir,
                    created_at: stats.birthtime,
                    updated_at: stats.mtime
                });
            }
            return projects.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
        }
        catch (error) {
            console.error('[GeminiLogSource] Error reading projects:', error);
            return [];
        }
    }
    /**
     * 指定プロジェクトのセッション一覧を取得
     */
    async getSessionList(projectId) {
        try {
            const projectDir = path.join(this.GEMINI_TMP_DIR, projectId);
            const chatsDir = path.join(projectDir, 'chats');
            try {
                await fs.access(chatsDir);
            }
            catch {
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
                const stats = await fs.stat(filePath);
                // ファイル名からsessionIdを抽出: session-2025-09-20T13-28-0dc1d4d7.json
                const sessionId = entry.name.replace('session-', '').replace('.json', '');
                const firstUserMessage = await this.extractFirstUserMessage(filePath);
                const normalizedFirstUserMessage = firstUserMessage
                    ? firstUserMessage.replace(/\s+/g, ' ').trim()
                    : undefined;
                const title = normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
                    ? normalizedFirstUserMessage
                    : `Gemini ${sessionId}`;
                sessions.push({
                    id: sessionId,
                    projectId: projectId,
                    filePath: filePath,
                    title,
                    firstUserMessage: normalizedFirstUserMessage,
                    status: 'completed',
                    createdAt: stats.birthtime,
                    updatedAt: stats.mtime,
                    fileSize: stats.size,
                    workspacePath: null
                });
            }
            return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        catch (error) {
            console.error(`[GeminiLogSource] Error reading sessions for project ${projectId}:`, error);
            return [];
        }
    }
}
//# sourceMappingURL=geminiLogSource.js.map