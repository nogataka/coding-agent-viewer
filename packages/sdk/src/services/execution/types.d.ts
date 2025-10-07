export type ExecutionKind = 'new' | 'follow-up';
export type CommandConfig = {
    binary: string;
    args: string[];
    env?: Record<string, string>;
};
export type ProfileVariantConfig = {
    label: string;
    command: CommandConfig;
};
export type ProfileConfig = {
    label: string;
    command: CommandConfig;
    variants?: ProfileVariantConfig[];
    buildProcessParameters?: ProcessParameterBuilder;
};
export type ExecutionContext = {
    profileLabel: string;
    variantLabel?: string | null;
    executorType: string;
    projectId: string;
    actualProjectId: string;
    workspacePath: string;
};
export type NewChatRequest = ExecutionContext & {
    prompt: string;
};
export type FollowUpRequest = ExecutionContext & {
    sessionId: string;
    message: string;
};
export type ExecutionResult = {
    sessionId: string;
    processId: number | null;
    startedAt: Date;
    projectId: string;
    kind: ExecutionKind;
};
export type FollowUpResult = ExecutionResult;
export type LaunchRequest = (NewChatRequest | FollowUpRequest) & {
    kind: ExecutionKind;
    sessionId: string;
};
export type SessionIdResolver = {
    handleChunk: (chunk: string) => string | null;
};
export type SessionResolutionContext = {
    request: LaunchRequest;
    mintedSessionId: string;
    startedAt: Date;
    timeoutMs: number;
};
export type ProcessParameters = {
    args: string[];
    stdinPayload?: string;
    createSessionIdResolver?: () => SessionIdResolver;
    resolveSessionId?: (context: SessionResolutionContext) => Promise<string | null>;
};
export type ProcessParameterBuilder = (command: CommandConfig, request: LaunchRequest) => ProcessParameters;
export type ProfileDefinition = {
    label: string;
    command: CommandConfig;
    variants?: ProfileVariantConfig[];
    buildProcessParameters?: ProcessParameterBuilder;
};
//# sourceMappingURL=types.d.ts.map