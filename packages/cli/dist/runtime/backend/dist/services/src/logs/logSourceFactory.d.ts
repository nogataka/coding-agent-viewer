import { ProjectInfo, SessionInfo } from './logSourceStrategy';
export declare class LogSourceFactory {
    private executorSources;
    constructor();
    /**
     * 全Executorのプロジェクト一覧を取得（FILESYSTEM戦略）
     */
    getAllProjects(): Promise<ProjectInfo[]>;
    /**
     * 指定プロジェクトのセッション一覧を取得（FILESYSTEM戦略）
     */
    getSessionsForProject(projectId: string): Promise<SessionInfo[]>;
    findProjectById(projectId: string): Promise<{
        project: ProjectInfo;
        executorType: string;
        actualProjectId: string;
    } | null>;
    /**
     * セッションIDからセッションストリームを取得（FILESYSTEM戦略）
     */
    getSessionStream(sessionId: string): Promise<import("stream").Readable>;
    findSessionById(sessionId: string): Promise<{
        session: SessionInfo;
        executorType: string;
        projectCompositeId: string;
        actualProjectId: string;
        actualSessionId: string;
    } | null>;
    private composeProjectId;
    private composeSessionId;
    private parseProjectId;
    private parseSessionId;
}
//# sourceMappingURL=logSourceFactory.d.ts.map