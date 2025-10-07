import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
import { Readable } from 'stream';
/**
 * Claude Code用ログソース
 * セッションファイル: ~/.claude/projects/{worktree-path}/{sessionId}.jsonl
 */
export declare class ClaudeLogSource extends BaseExecutorLogSource {
    private readonly CLAUDE_PROJECTS_DIR;
    private reportedModel;
    private toolEntryMap;
    getName(): string;
    protected resolveSessionFilePath(executionId: string, sessionId: string, workingDir: string): Promise<string | null>;
    protected parseSessionLine(line: string): any;
    /**
     * worktreeパスをClaudeのディレクトリ名に変換
     * 例: /Users/user/project → -Users-user-project-
     */
    private transformWorktreePath;
    /**
     * Claudeのディレクトリ名を読みやすいパスに変換
     * 例: -Users-user-project- → /Users/user/project
     */
    private transformToReadable;
    /**
     * パスをbase64エンコードしてプロジェクトIDを生成
     */
    private pathToId;
    /**
     * プロジェクトIDからパスをデコード
     */
    private idToPath;
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
     * SessionInfoのfilePathフィールドを利用せずに、sessionIdから直接ファイルパスを構築
     */
    getSessionById(sessionId: string): Promise<Readable | null>;
    protected streamCompletedSession(filePath: string): Promise<Readable>;
    protected streamLiveSession(filePath: string): Promise<Readable>;
    protected processLineAndEmit(line: string, stream: Readable, entryIndexRef: {
        value: number;
    }): void;
    private resetState;
    private transformClaudeLine;
    private processToolResults;
    private updateToolResult;
    private createToolEntryFromClaude;
    private mapToolToAction;
    private extractText;
    private createAddPatch;
}
//# sourceMappingURL=claudeLogSource.d.ts.map