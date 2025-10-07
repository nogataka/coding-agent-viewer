export class ActiveExecutionRegistry {
    activeSessions = new Set();
    register(sessionId) {
        if (!sessionId)
            return;
        this.activeSessions.add(sessionId);
    }
    updateSessionId(oldSessionId, newSessionId) {
        if (!oldSessionId || !newSessionId || oldSessionId === newSessionId) {
            return;
        }
        if (this.activeSessions.delete(oldSessionId)) {
            this.activeSessions.add(newSessionId);
        }
    }
    unregister(sessionId) {
        if (!sessionId)
            return;
        this.activeSessions.delete(sessionId);
    }
    isActive(sessionId) {
        if (!sessionId)
            return false;
        return this.activeSessions.has(sessionId);
    }
}
export const activeExecutionRegistry = new ActiveExecutionRegistry();
//# sourceMappingURL=activeExecutionRegistry.js.map