import { Readable } from 'stream';
/**
 * プロジェクト情報
 */
export interface ProjectInfo {
    id: string;
    name: string;
    git_repo_path: string;
    created_at: Date;
    updated_at: Date;
}
/**
 * セッション情報
 */
export interface SessionInfo {
    id: string;
    projectId: string;
    filePath: string;
    title: string;
    firstUserMessage?: string;
    workspacePath?: string | null;
    status: 'running' | 'completed' | 'failed';
    createdAt: Date;
    updatedAt: Date;
    fileSize: number;
}
/**
 * ログソース戦略の抽象インターフェース
 */
export interface ILogSourceStrategy {
    /**
     * 戦略名
     */
    getName(): string;
    /**
     * プロジェクト一覧を取得
     */
    getProjectList(): Promise<ProjectInfo[]>;
    /**
     * 指定プロジェクトのセッション一覧を取得
     */
    getSessionList(projectId: string): Promise<SessionInfo[]>;
    /**
     * セッションIDからセッション詳細をストリーミングで取得
     */
    getSessionById(sessionId: string): Promise<Readable | null>;
}
//# sourceMappingURL=logSourceStrategy.d.ts.map