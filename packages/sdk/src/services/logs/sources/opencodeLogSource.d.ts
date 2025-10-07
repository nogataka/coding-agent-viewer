import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
import { Readable } from 'stream';
/**
 * Opencode用ログソース
 * セッションファイル: ~/.local/share/opencode/storage/session/ 配下の .json ファイル
 */
export declare class OpencodeLogSource extends BaseExecutorLogSource {
    private readonly OPENCODE_STORAGE_DIR;
    private readonly SESSION_DIR;
    private encodeProjectId;
    private decodeProjectId;
    private toDate;
    private readSessionMetadata;
    private collectSessionMetadata;
    private extractFirstUserMessage;
    getName(): string;
    protected resolveSessionFilePath(_executionId: string, sessionId: string, _workingDir: string): Promise<string | null>;
    protected parseSessionLine(line: string): any;
    protected streamCompletedSession(filePath: string): Promise<Readable>;
    private createToolEntryFromOpencodePart;
    private toMillis;
    private toIso;
    private createPatch;
    /**
     * プロジェクト一覧を取得
     * セッションメタデータの directory 単位でグルーピングする
     */
    getProjectList(): Promise<ProjectInfo[]>;
    /**
     * 指定プロジェクトのセッション一覧を取得
     */
    getSessionList(projectId: string): Promise<SessionInfo[]>;
}
//# sourceMappingURL=opencodeLogSource.d.ts.map