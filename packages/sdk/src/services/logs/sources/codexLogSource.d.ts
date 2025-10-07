import { Readable } from 'stream';
import { BaseExecutorLogSource } from './baseExecutorLogSource.js';
import { ProjectInfo, SessionInfo } from '../logSourceStrategy.js';
/**
 * Codex用ログソース
 * セッションファイル: ~/.codex/sessions/.../rollout-*.jsonl
 */
export declare class CodexLogSource extends BaseExecutorLogSource {
    private readonly CODEX_SESSIONS_DIR;
    private execInfoMap;
    private mcpInfoMap;
    private currentWorkspacePath;
    private lastMessageByRole;
    private lastReasoning;
    getName(): string;
    private encodeProjectId;
    private decodeProjectId;
    private toDate;
    private readSessionHeader;
    private collectSessionMetadata;
    private extractFirstUserMessage;
    protected resolveSessionFilePath(_executionId: string, sessionId: string, _workingDir: string): Promise<string | null>;
    protected parseSessionLine(line: string): any;
    protected processLineAndEmit(line: string, stream: Readable, entryIndexRef: {
        value: number;
    }): void;
    private transformCodexJson;
    private handleResponseItem;
    private handleEventMessage;
    private createReplacePatch;
    private createAddPatch;
    streamSessionInfo(session: SessionInfo): Promise<Readable | null>;
    getProjectList(): Promise<ProjectInfo[]>;
    getSessionList(projectId: string): Promise<SessionInfo[]>;
}
//# sourceMappingURL=codexLogSource.d.ts.map