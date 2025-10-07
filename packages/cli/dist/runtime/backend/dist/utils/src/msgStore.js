// Message store utilities - equivalent to Rust's utils/src/msg_store.rs
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { logger } from './logger';
// 100 MB Limit (same as Rust version)
const HISTORY_BYTES = 100000 * 1024;
export var LogMsgType;
(function (LogMsgType) {
    LogMsgType["STDOUT"] = "stdout";
    LogMsgType["STDERR"] = "stderr";
    LogMsgType["JSON_PATCH"] = "json_patch";
    LogMsgType["SESSION_ID"] = "session_id";
    LogMsgType["FINISHED"] = "finished";
})(LogMsgType || (LogMsgType = {}));
export class MsgStore extends EventEmitter {
    inner;
    maxCapacity = 32;
    isFinished = false;
    executionId;
    dbSaveCallback;
    constructor() {
        super();
        this.inner = {
            history: [],
            totalBytes: 0
        };
    }
    /**
     * Setup realtime database saving (matches Rust's spawn_stream_raw_logs_to_db)
     */
    enableRealtimeDbSaving(executionId, saveCallback) {
        this.executionId = executionId;
        this.dbSaveCallback = saveCallback;
    }
    /**
     * Push a message to the store and emit to live listeners
     */
    push(msg) {
        // Emit to live listeners first
        this.emit('message', msg);
        const bytes = this.approximateBytes(msg);
        // Manage history size constraint
        while (this.inner.totalBytes + bytes > HISTORY_BYTES && this.inner.history.length > 0) {
            const front = this.inner.history.shift();
            if (front) {
                this.inner.totalBytes = Math.max(0, this.inner.totalBytes - front.bytes);
            }
        }
        // Add new message
        this.inner.history.push({ msg, bytes });
        this.inner.totalBytes += bytes;
        // Realtime database saving (matches Rust behavior)
        if (this.dbSaveCallback &&
            this.executionId &&
            (msg.type === 'stdout' || msg.type === 'stderr')) {
            this.dbSaveCallback(this.executionId, msg).catch((error) => {
                logger.error(`Failed to save log to database for execution ${this.executionId}:`, error);
            });
        }
        // Emit specific event type
        this.emit(msg.type, msg);
    }
    /**
     * Convenience method for stdout messages
     */
    pushStdout(content, sessionId) {
        logger.debug(`[MsgStore.pushStdout] Pushing stdout: ${content.substring(0, 100)}...`);
        this.push({
            type: LogMsgType.STDOUT,
            content,
            timestamp: new Date(),
            session_id: sessionId
        });
    }
    /**
     * Convenience method for stderr messages
     */
    pushStderr(content, sessionId) {
        this.push({
            type: LogMsgType.STDERR,
            content,
            timestamp: new Date(),
            session_id: sessionId
        });
    }
    /**
     * Convenience method for JSON patch messages
     */
    pushPatch(patch, sessionId) {
        logger.debug(`[MsgStore.pushPatch] Pushing patch with ${Array.isArray(patch) ? patch.length : 1} operations`);
        const patchesArray = Array.isArray(patch) ? patch : [patch];
        this.push({
            type: LogMsgType.JSON_PATCH,
            content: JSON.stringify(patch),
            timestamp: new Date(),
            session_id: sessionId,
            patch,
            patches: patchesArray
        });
    }
    /**
     * Convenience method for session ID messages
     */
    pushSessionId(sessionId) {
        this.push({
            type: LogMsgType.SESSION_ID,
            content: sessionId,
            timestamp: new Date(),
            session_id: sessionId
        });
    }
    /**
     * Convenience method for finished messages (matches Rust push_finished)
     */
    pushFinished(sessionId) {
        if (!this.isFinished) {
            this.isFinished = true;
            this.push({
                type: LogMsgType.FINISHED,
                content: 'Process finished',
                timestamp: new Date(),
                session_id: sessionId
            });
            this.emit('finished');
        }
    }
    /**
     * Get message history
     */
    getHistory() {
        return this.inner.history.map((stored) => stored.msg);
    }
    /**
     * Get filtered history by message type
     */
    getHistoryByType(type) {
        return this.inner.history.map((stored) => stored.msg).filter((msg) => msg.type === type);
    }
    /**
     * Get filtered history by session ID
     */
    getHistoryBySession(sessionId) {
        return this.inner.history
            .map((stored) => stored.msg)
            .filter((msg) => msg.session_id === sessionId);
    }
    /**
     * Convert LogMsg to Server-Sent Event format
     */
    toSSEEvent(msg) {
        const data = {
            type: msg.type,
            content: msg.content,
            timestamp: msg.timestamp.toISOString(),
            session_id: msg.session_id,
            ...(msg.patch && { patch: msg.patch })
        };
        return `data: ${JSON.stringify(data)}\n\n`;
    }
    /**
     * Create SSE stream from history plus live updates
     */
    createSSEStream() {
        const stream = new Readable({
            read() {
                // Readable will call this when it needs data
            }
        });
        // Send history first
        const history = this.getHistory();
        for (const msg of history) {
            stream.push(this.toSSEEvent(msg));
        }
        // Listen for new messages
        const messageHandler = (msg) => {
            stream.push(this.toSSEEvent(msg));
        };
        const finishedHandler = () => {
            stream.push(null); // End stream
        };
        this.on('message', messageHandler);
        this.on('finished', finishedHandler);
        // Cleanup on stream close
        stream.on('close', () => {
            this.removeListener('message', messageHandler);
            this.removeListener('finished', finishedHandler);
        });
        return stream;
    }
    /**
     * Create stdout-only stream
     */
    createStdoutStream() {
        const stream = new Readable({
            read() {
                // Readable will call this when it needs data
            }
        });
        // Send stdout history first
        const stdoutHistory = this.getHistoryByType(LogMsgType.STDOUT);
        for (const msg of stdoutHistory) {
            stream.push(msg.content);
        }
        // Listen for new stdout messages
        const stdoutHandler = (msg) => {
            if (msg.type === LogMsgType.STDOUT) {
                stream.push(msg.content);
            }
        };
        const finishedHandler = () => {
            stream.push(null); // End stream
        };
        this.on('message', stdoutHandler);
        this.on('finished', finishedHandler);
        // Cleanup on stream close
        stream.on('close', () => {
            this.removeListener('message', stdoutHandler);
            this.removeListener('finished', finishedHandler);
        });
        return stream;
    }
    /**
     * Create stderr-only stream
     */
    createStderrStream() {
        const stream = new Readable({
            read() {
                // Readable will call this when it needs data
            }
        });
        // Send stderr history first
        const stderrHistory = this.getHistoryByType(LogMsgType.STDERR);
        for (const msg of stderrHistory) {
            stream.push(msg.content);
        }
        // Listen for new stderr messages
        const stderrHandler = (msg) => {
            if (msg.type === LogMsgType.STDERR) {
                stream.push(msg.content);
            }
        };
        const finishedHandler = () => {
            stream.push(null); // End stream
        };
        this.on('message', stderrHandler);
        this.on('finished', finishedHandler);
        // Cleanup on stream close
        stream.on('close', () => {
            this.removeListener('message', stderrHandler);
            this.removeListener('finished', finishedHandler);
        });
        return stream;
    }
    /**
     * Create normalized SSE stream (filtered for JSON patches)
     */
    createNormalizedSSEStream() {
        const stream = new Readable({
            read() {
                // Readable will call this when it needs data
            }
        });
        // Format JSON patch for SSE (matches Rust format exactly)
        const formatPatchEvent = (msg) => {
            // For JSON patches, send only the patches array without wrapper
            // This matches Rust's format: event: json_patch\ndata: [patches]\n\n
            if (msg.patches && Array.isArray(msg.patches)) {
                return `event: json_patch\ndata: ${JSON.stringify(msg.patches)}\n\n`;
            }
            // Fallback for legacy format
            return `event: json_patch\ndata: ${msg.content}\n\n`;
        };
        // Send JSON patch history first
        const patchHistory = this.getHistoryByType(LogMsgType.JSON_PATCH);
        for (const msg of patchHistory) {
            stream.push(formatPatchEvent(msg));
        }
        // Check if stream is already finished (from historical data)
        // This matches Rust's behavior of chaining a Finished event
        const hasFinished = this.inner.history.some((msg) => msg.msg.type === LogMsgType.FINISHED) || this.isFinished;
        logger.info(`[createNormalizedSSEStream] hasFinished: ${hasFinished}, isFinished: ${this.isFinished}, history has finished: ${this.inner.history.some((msg) => msg.msg.type === LogMsgType.FINISHED)}`);
        if (hasFinished) {
            // If already finished, send the finished event and end the stream immediately
            // This matches Rust's chain(stream::once(Ok(LogMsg::Finished.to_sse_event())))
            logger.info(`[createNormalizedSSEStream] Sending finished event and ending stream`);
            stream.push(`event: finished\ndata: ${JSON.stringify({ message: 'Log stream ended' })}\n\n`);
            stream.push(null); // End stream
            return stream;
        }
        // Listen for new JSON patch messages
        const patchHandler = (msg) => {
            if (msg.type === LogMsgType.JSON_PATCH) {
                stream.push(formatPatchEvent(msg));
            }
        };
        let streamEnded = false;
        const finishedHandler = () => {
            if (!streamEnded) {
                streamEnded = true;
                stream.push(`event: finished
data: ${JSON.stringify({ message: 'Log stream ended' })}

`);
                stream.push(null); // End stream
            }
        };
        this.on('message', patchHandler);
        this.on('finished', finishedHandler);
        // Cleanup on stream close
        stream.on('close', () => {
            this.removeListener('message', patchHandler);
            this.removeListener('finished', finishedHandler);
        });
        return stream;
    }
    /**
     * Subscribe to messages (returns unsubscribe function)
     */
    subscribe(handler) {
        this.on('message', handler);
        return () => this.removeListener('message', handler);
    }
    /**
     * Wait for stream to finish
     */
    async waitForFinish() {
        return new Promise((resolve) => {
            const handler = () => {
                this.removeListener('finished', handler);
                resolve();
            };
            this.on('finished', handler);
            // Check if already finished
            const hasFinished = this.inner.history.some((stored) => stored.msg.type === LogMsgType.FINISHED);
            if (hasFinished) {
                this.removeListener('finished', handler);
                resolve();
            }
        });
    }
    /**
     * History plus stream iterator (for async iteration)
     */
    async *historyPlusStream() {
        // Yield all history messages first
        for (const stored of this.inner.history) {
            yield stored.msg;
        }
        // Then yield new messages as they arrive
        const messageQueue = [];
        let finished = false;
        const messageHandler = (msg) => {
            messageQueue.push(msg);
        };
        const finishedHandler = () => {
            finished = true;
        };
        this.on('message', messageHandler);
        this.on('finished', finishedHandler);
        try {
            while (!finished) {
                if (messageQueue.length > 0) {
                    const msg = messageQueue.shift();
                    yield msg;
                    if (msg.type === LogMsgType.FINISHED) {
                        break;
                    }
                }
                else {
                    // Wait a bit for new messages
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            }
        }
        finally {
            this.removeListener('message', messageHandler);
            this.removeListener('finished', finishedHandler);
        }
    }
    /**
     * Clear all stored messages
     */
    clear() {
        this.inner.history = [];
        this.inner.totalBytes = 0;
        this.emit('cleared');
    }
    /**
     * Get memory usage info
     */
    getStats() {
        return {
            messageCount: this.inner.history.length,
            totalBytes: this.inner.totalBytes,
            maxBytes: HISTORY_BYTES
        };
    }
    /**
     * Approximate byte size of a LogMsg
     */
    approximateBytes(msg) {
        const baseSize = 50; // Fixed overhead for the LogMsg structure
        const contentSize = new TextEncoder().encode(msg.content).length;
        const sessionIdSize = msg.session_id ? new TextEncoder().encode(msg.session_id).length : 0;
        const patchSize = msg.patch ? new TextEncoder().encode(JSON.stringify(msg.patch)).length : 0;
        return baseSize + contentSize + sessionIdSize + patchSize;
    }
}
// Global message store instance for singleton usage
let globalMsgStore = null;
export function getGlobalMsgStore() {
    if (!globalMsgStore) {
        globalMsgStore = new MsgStore();
    }
    return globalMsgStore;
}
// Export LogMsg creation helpers
export function createStdoutMsg(content, sessionId) {
    return {
        type: LogMsgType.STDOUT,
        content,
        timestamp: new Date(),
        session_id: sessionId
    };
}
export function createStderrMsg(content, sessionId) {
    return {
        type: LogMsgType.STDERR,
        content,
        timestamp: new Date(),
        session_id: sessionId
    };
}
export function createPatchMsg(patch, sessionId) {
    return {
        type: LogMsgType.JSON_PATCH,
        content: JSON.stringify(patch),
        timestamp: new Date(),
        session_id: sessionId,
        patch
    };
}
export function createSessionMsg(sessionId) {
    return {
        type: LogMsgType.SESSION_ID,
        content: sessionId,
        timestamp: new Date(),
        session_id: sessionId
    };
}
export function createFinishedMsg(sessionId) {
    return {
        type: LogMsgType.FINISHED,
        content: 'Process finished',
        timestamp: new Date(),
        session_id: sessionId
    };
}
//# sourceMappingURL=msgStore.js.map