export declare class ActiveExecutionRegistry {
    private readonly activeSessions;
    register(sessionId: string): void;
    updateSessionId(oldSessionId: string, newSessionId: string): void;
    unregister(sessionId: string): void;
    isActive(sessionId: string): boolean;
}
export declare const activeExecutionRegistry: ActiveExecutionRegistry;
//# sourceMappingURL=activeExecutionRegistry.d.ts.map