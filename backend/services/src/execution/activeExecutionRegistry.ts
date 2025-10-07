export class ActiveExecutionRegistry {
  private readonly activeSessions = new Set<string>();

  register(sessionId: string): void {
    if (!sessionId) return;
    this.activeSessions.add(sessionId);
  }

  updateSessionId(oldSessionId: string, newSessionId: string): void {
    if (!oldSessionId || !newSessionId || oldSessionId === newSessionId) {
      return;
    }
    if (this.activeSessions.delete(oldSessionId)) {
      this.activeSessions.add(newSessionId);
    }
  }

  unregister(sessionId: string): void {
    if (!sessionId) return;
    this.activeSessions.delete(sessionId);
  }

  isActive(sessionId: string): boolean {
    if (!sessionId) return false;
    return this.activeSessions.has(sessionId);
  }
}

export const activeExecutionRegistry = new ActiveExecutionRegistry();
