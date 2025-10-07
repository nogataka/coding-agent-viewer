import { EventEmitter } from 'events';
export declare enum LogMsgType {
    STDOUT = "stdout",
    STDERR = "stderr",
    JSON_PATCH = "json_patch",
    SESSION_ID = "session_id",
    FINISHED = "finished"
}
export interface LogMsg {
    type: LogMsgType | string;
    content: string;
    timestamp?: Date;
    session_id?: string;
    patch?: JsonPatchPayload;
    patches?: JsonPatchOperation[];
}
export declare class MsgStore extends EventEmitter {
    private inner;
    private readonly maxCapacity;
    private isFinished;
    private executionId?;
    private dbSaveCallback?;
    constructor();
    /**
     * Setup realtime database saving (matches Rust's spawn_stream_raw_logs_to_db)
     */
    enableRealtimeDbSaving(executionId: string, saveCallback: (executionId: string, msg: LogMsg) => Promise<void>): void;
    /**
     * Push a message to the store and emit to live listeners
     */
    push(msg: LogMsg): void;
    /**
     * Convenience method for stdout messages
     */
    pushStdout(content: string, sessionId?: string): void;
    /**
     * Convenience method for stderr messages
     */
    pushStderr(content: string, sessionId?: string): void;
    /**
     * Convenience method for JSON patch messages
     */
    pushPatch(patch: JsonPatchPayload, sessionId?: string): void;
    /**
     * Convenience method for session ID messages
     */
    pushSessionId(sessionId: string): void;
    /**
     * Convenience method for finished messages (matches Rust push_finished)
     */
    pushFinished(sessionId?: string): void;
    /**
     * Get message history
     */
    getHistory(): LogMsg[];
    /**
     * Get filtered history by message type
     */
    getHistoryByType(type: LogMsgType): LogMsg[];
    /**
     * Get filtered history by session ID
     */
    getHistoryBySession(sessionId: string): LogMsg[];
    /**
     * Convert LogMsg to Server-Sent Event format
     */
    toSSEEvent(msg: LogMsg): string;
    /**
     * Create SSE stream from history plus live updates
     */
    createSSEStream(): NodeJS.ReadableStream;
    /**
     * Create stdout-only stream
     */
    createStdoutStream(): NodeJS.ReadableStream;
    /**
     * Create stderr-only stream
     */
    createStderrStream(): NodeJS.ReadableStream;
    /**
     * Create normalized SSE stream (filtered for JSON patches)
     */
    createNormalizedSSEStream(): NodeJS.ReadableStream;
    /**
     * Subscribe to messages (returns unsubscribe function)
     */
    subscribe(handler: (msg: LogMsg) => void): () => void;
    /**
     * Wait for stream to finish
     */
    waitForFinish(): Promise<void>;
    /**
     * History plus stream iterator (for async iteration)
     */
    historyPlusStream(): AsyncIterableIterator<LogMsg>;
    /**
     * Clear all stored messages
     */
    clear(): void;
    /**
     * Get memory usage info
     */
    getStats(): {
        messageCount: number;
        totalBytes: number;
        maxBytes: number;
    };
    /**
     * Approximate byte size of a LogMsg
     */
    private approximateBytes;
}
export declare function getGlobalMsgStore(): MsgStore;
export declare function createStdoutMsg(content: string, sessionId?: string): LogMsg;
export declare function createStderrMsg(content: string, sessionId?: string): LogMsg;
export declare function createPatchMsg(patch: JsonPatchPayload, sessionId?: string): LogMsg;
export interface JsonPatchOperation {
    op: 'add' | 'replace' | 'remove';
    path: string;
    value?: unknown;
}
export type JsonPatchPayload = JsonPatchOperation | JsonPatchOperation[];
export declare function createSessionMsg(sessionId: string): LogMsg;
export declare function createFinishedMsg(sessionId?: string): LogMsg;
//# sourceMappingURL=msgStore.d.ts.map