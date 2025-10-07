import { ExecutionResult, FollowUpRequest, NewChatRequest } from './types';
export declare class ExecutionService {
    private static readonly SESSION_ID_RESOLUTION_TIMEOUT_MS;
    private readonly registry;
    private readonly activeProcesses;
    startNewChat(request: NewChatRequest): Promise<ExecutionResult>;
    sendFollowUp(request: FollowUpRequest): Promise<ExecutionResult>;
    private launch;
    private composeSessionId;
    private composeEnvironment;
    private ensureWorkspace;
    stopExecution(sessionId: string): boolean;
    private buildDefaultProcessParameters;
    private updateProcessSessionId;
}
//# sourceMappingURL=executionService.d.ts.map