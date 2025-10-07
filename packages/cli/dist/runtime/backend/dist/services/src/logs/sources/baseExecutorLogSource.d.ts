import { Readable } from 'stream';
import { ILogSourceStrategy, ProjectInfo, SessionInfo } from '../logSourceStrategy';
import type { NormalizedEntry, JsonPatchOperation } from '../executors/types';
/**
 * Executor固有のログソースの基底クラス
 */
export declare abstract class BaseExecutorLogSource implements ILogSourceStrategy {
    abstract getName(): string;
    /**
     * セッションファイルパスを解決（各Executorで実装）
     */
    protected abstract resolveSessionFilePath(executionId: string, sessionId: string, workingDir: string): Promise<string | null>;
    /**
     * JSONLファイルの1行をパースして正規化エントリに変換（各Executorで実装）
     */
    protected abstract parseSessionLine(line: string): any;
    /**
     * プロジェクト一覧を取得（各Executorで実装）
     */
    abstract getProjectList(): Promise<ProjectInfo[]>;
    /**
     * 指定プロジェクトのセッション一覧を取得（各Executorで実装）
     */
    abstract getSessionList(projectId: string): Promise<SessionInfo[]>;
    /**
     * セッションIDからセッション詳細をストリーミングで取得
     * ファイルから直接読み取る実装
     */
    getSessionById(sessionId: string): Promise<Readable | null>;
    streamSessionInfo(session: SessionInfo): Promise<Readable | null>;
    /**
     * 完了済みセッションのストリーミング
     */
    protected streamCompletedSession(filePath: string): Promise<Readable>;
    /**
     * リアルタイムセッションのストリーミング（chokidar使用）
     */
    protected streamLiveSession(filePath: string): Promise<Readable>;
    protected processLineAndEmit(line: string, stream: Readable, entryIndexRef: {
        value: number;
    }): void;
    /**
     * エントリをJSON Patchに変換
     */
    protected convertEntryToJsonPatch(entry: any, entryIndex: number): JsonPatchOperation | null;
    protected toNormalizedEntry(entry: any): NormalizedEntry | null;
    private safeJsonParse;
    private formatToolArgumentContent;
    private createToolUseEntryType;
    private createCommandResult;
    private containsInstructionTags;
    private sanitizeInstructionText;
    private extractTextContent;
    protected stringifyPayload(payload: unknown): string;
}
//# sourceMappingURL=baseExecutorLogSource.d.ts.map