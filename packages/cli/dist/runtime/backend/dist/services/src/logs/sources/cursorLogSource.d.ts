import { Readable } from 'stream';
import { BaseExecutorLogSource } from './baseExecutorLogSource';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy';
/**
 * Cursor用ログソース
 * セッションファイル: ~/.cursor/chats/{MD5ハッシュ}/{sessionId}/store.db
 */
export declare class CursorLogSource extends BaseExecutorLogSource {
    private readonly CURSOR_CHATS_DIR;
    private readonly CURSOR_PROJECTS_DIR;
    private workspacePathCache;
    getName(): string;
    private loadWorkspacePathCache;
    private getWorkspacePathFromHash;
    protected resolveSessionFilePath(executionId: string, sessionId: string, workingDir: string): Promise<string | null>;
    protected parseSessionLine(line: string): any;
    protected streamCompletedSession(filePath: string): Promise<Readable>;
    /**
     * プロジェクト一覧を取得
     */
    getProjectList(): Promise<ProjectInfo[]>;
    /**
     * 指定プロジェクトのセッション一覧を取得
     */
    private extractFirstUserMessage;
    getSessionList(projectId: string): Promise<SessionInfo[]>;
}
//# sourceMappingURL=cursorLogSource.d.ts.map