import { ClaudeLogSource, CursorLogSource, GeminiLogSource, CodexLogSource, OpencodeLogSource } from './sources';
import { logger } from '../../../utils/src/logger';
import { BaseExecutorLogSource } from './sources/baseExecutorLogSource';
import { activeExecutionRegistry } from '../execution/activeExecutionRegistry';
export class LogSourceFactory {
    executorSources;
    constructor() {
        // 各Executor用のログソースを登録
        this.executorSources = new Map([
            ['CLAUDE_CODE', new ClaudeLogSource()],
            ['CURSOR', new CursorLogSource()],
            ['GEMINI', new GeminiLogSource()],
            ['CODEX', new CodexLogSource()],
            ['OPENCODE', new OpencodeLogSource()]
            // 将来追加: ['AMP', new AmpLogSource()],
        ]);
    }
    /**
     * 全Executorのプロジェクト一覧を取得（FILESYSTEM戦略）
     */
    async getAllProjects() {
        const allProjects = [];
        for (const [executorType, source] of this.executorSources.entries()) {
            try {
                const projects = await source.getProjectList();
                // Executor typeをプロジェクト情報に追加
                const projectsWithExecutor = projects.map((p) => ({
                    ...p,
                    id: `${executorType}:${p.id}`
                }));
                allProjects.push(...projectsWithExecutor);
            }
            catch (error) {
                logger.error(`[LogSourceFactory] Error getting projects from ${executorType}:`, error);
            }
        }
        return allProjects.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
    }
    /**
     * 指定プロジェクトのセッション一覧を取得（FILESYSTEM戦略）
     */
    async getSessionsForProject(projectId) {
        const parsed = this.parseProjectId(projectId);
        if (!parsed) {
            logger.error(`[LogSourceFactory] Invalid projectId format: ${projectId}`);
            return [];
        }
        const { executorType, actualProjectId } = parsed;
        const source = this.executorSources.get(executorType);
        if (!source) {
            logger.error(`[LogSourceFactory] Unknown executor type: ${executorType}`);
            return [];
        }
        try {
            const sessions = await source.getSessionList(actualProjectId);
            return sessions.map((session) => {
                const composedId = this.composeSessionId(executorType, actualProjectId, session.id);
                const isActive = activeExecutionRegistry.isActive(composedId);
                return {
                    ...session,
                    status: isActive ? 'running' : session.status,
                    projectId,
                    id: composedId
                };
            });
        }
        catch (error) {
            logger.error(`[LogSourceFactory] Error getting sessions for project ${projectId}:`, error);
            return [];
        }
    }
    async findProjectById(projectId) {
        const parsed = this.parseProjectId(projectId);
        if (!parsed) {
            return null;
        }
        const { executorType, actualProjectId } = parsed;
        const source = this.executorSources.get(executorType);
        if (!source) {
            return null;
        }
        try {
            const projects = await source.getProjectList();
            const match = projects.find((project) => project.id === actualProjectId);
            if (!match) {
                return null;
            }
            return {
                project: {
                    ...match,
                    id: projectId
                },
                executorType,
                actualProjectId
            };
        }
        catch (error) {
            logger.error(`[LogSourceFactory] Error finding project ${projectId}:`, error);
            return null;
        }
    }
    /**
     * セッションIDからセッションストリームを取得（FILESYSTEM戦略）
     */
    async getSessionStream(sessionId) {
        const parsed = this.parseSessionId(sessionId);
        if (!parsed) {
            logger.error(`[LogSourceFactory] Invalid sessionId format: ${sessionId}`);
            return null;
        }
        const { executorType } = parsed;
        const sessionData = await this.findSessionById(sessionId);
        if (!sessionData) {
            return null;
        }
        const source = this.executorSources.get(executorType);
        if (!source) {
            logger.error(`[LogSourceFactory] Unknown executor type: ${executorType}`);
            return null;
        }
        if (source instanceof BaseExecutorLogSource) {
            return source.streamSessionInfo(sessionData.session);
        }
        try {
            return await source.getSessionById(sessionData.actualSessionId);
        }
        catch (error) {
            logger.error(`[LogSourceFactory] Error getting session ${sessionId}:`, error);
            return null;
        }
    }
    async findSessionById(sessionId) {
        const parsed = this.parseSessionId(sessionId);
        if (!parsed) {
            return null;
        }
        const { executorType, actualProjectId, actualSessionId } = parsed;
        const source = this.executorSources.get(executorType);
        if (!source) {
            return null;
        }
        try {
            const sessions = await source.getSessionList(actualProjectId);
            const match = sessions.find((session) => session.id === actualSessionId);
            if (!match) {
                return null;
            }
            const projectCompositeId = this.composeProjectId(executorType, actualProjectId);
            const isActive = activeExecutionRegistry.isActive(sessionId);
            return {
                session: {
                    ...match,
                    id: sessionId,
                    projectId: projectCompositeId,
                    status: isActive ? 'running' : match.status
                },
                executorType,
                projectCompositeId,
                actualProjectId,
                actualSessionId
            };
        }
        catch (error) {
            logger.error(`[LogSourceFactory] Error finding session ${sessionId}:`, error);
            return null;
        }
    }
    composeProjectId(executorType, actualProjectId) {
        return `${executorType}:${actualProjectId}`;
    }
    composeSessionId(executorType, actualProjectId, sessionId) {
        return `${executorType}:${actualProjectId}:${sessionId}`;
    }
    parseProjectId(projectId) {
        const [executorType, ...rest] = projectId.split(':');
        if (!executorType || rest.length === 0) {
            return null;
        }
        const actualProjectId = rest.join(':');
        return { executorType, actualProjectId };
    }
    parseSessionId(sessionId) {
        const [executorType, projectPart, ...rest] = sessionId.split(':');
        if (!executorType || !projectPart || rest.length === 0) {
            return null;
        }
        const actualSessionId = rest.join(':');
        return {
            executorType,
            actualProjectId: projectPart,
            actualSessionId
        };
    }
}
//# sourceMappingURL=logSourceFactory.js.map