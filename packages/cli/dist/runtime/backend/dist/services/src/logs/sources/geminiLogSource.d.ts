import { BaseExecutorLogSource } from './baseExecutorLogSource';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy';
import { Readable } from 'stream';
/**
 * Gemini用ログソース
 * セッションファイル: ~/.gemini/tmp/{projectHash}/chats/session-*.json
 */
export declare class GeminiLogSource extends BaseExecutorLogSource {
    private readonly GEMINI_TMP_DIR;
    getName(): string;
    protected resolveSessionFilePath(executionId: string, sessionId: string, _workingDir: string): Promise<string | null>;
    private findSessionFile;
    protected parseSessionLine(line: string): any;
    private extractFirstUserMessage;
    protected streamCompletedSession(filePath: string): Promise<Readable>;
    /**
     * プロジェクト一覧を取得
     * Geminiは各projectHashをプロジェクトとして扱う
     */
    getProjectList(): Promise<ProjectInfo[]>;
    /**
     * 指定プロジェクトのセッション一覧を取得
     */
    getSessionList(projectId: string): Promise<SessionInfo[]>;
}
//# sourceMappingURL=geminiLogSource.d.ts.map