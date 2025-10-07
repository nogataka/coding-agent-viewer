import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { access } from 'fs/promises';
import { ProfileRegistry } from './profileRegistry.js';
import { activeExecutionRegistry } from './activeExecutionRegistry.js';
import {
  CommandConfig,
  ExecutionResult,
  FollowUpRequest,
  LaunchRequest,
  NewChatRequest,
  ProcessParameters
} from './types.js';

export class ExecutionService {
  private static readonly SESSION_ID_RESOLUTION_TIMEOUT_MS = 30000;

  private readonly registry = new ProfileRegistry();
  private readonly activeProcesses = new Map<string, ChildProcess>();

  async startNewChat(request: NewChatRequest): Promise<ExecutionResult> {
    const sessionId = this.composeSessionId(request.executorType, request.actualProjectId);
    const launchRequest: LaunchRequest = { ...request, kind: 'new', sessionId };
    return this.launch(launchRequest);
  }

  async sendFollowUp(request: FollowUpRequest): Promise<ExecutionResult> {
    const launchRequest: LaunchRequest = { ...request, kind: 'follow-up' };
    return this.launch(launchRequest);
  }

  private async launch(request: LaunchRequest): Promise<ExecutionResult> {
    await this.ensureWorkspace(request.workspacePath);

    const profile = this.registry.getProfile(request.profileLabel);
    if (!profile) {
      throw new Error(`Profile config not found for ${request.profileLabel}`);
    }

    const command = this.registry.getCommand(request.profileLabel, request.variantLabel);
    if (!command) {
      throw new Error(`Profile command not found for ${request.profileLabel}`);
    }

    const { args, stdinPayload, createSessionIdResolver, resolveSessionId } =
      profile.buildProcessParameters?.(command, request) ??
      this.buildDefaultProcessParameters(command, request);
    const env = this.composeEnvironment(command, request);

    const launchedAt = new Date();
    const child = spawn(command.binary, args, {
      cwd: request.workspacePath,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const mintedSessionId = request.sessionId;
    let currentSessionId = mintedSessionId;
    this.activeProcesses.set(mintedSessionId, child);
    activeExecutionRegistry.register(mintedSessionId);

    let resolveActualSessionUuid: (value: string | null) => void = () => {};
    let actualSessionUuid: string | null = null;
    const sessionIdResolver = createSessionIdResolver?.();
    const actualSessionUuidPromise = sessionIdResolver
      ? new Promise<string | null>((resolve) => {
          resolveActualSessionUuid = resolve;
        })
      : Promise.resolve(null);

    const handleStdout = (chunk: Buffer) => {
      const text = chunk.toString();
      if (sessionIdResolver && actualSessionUuid === null) {
        const maybeUuid = sessionIdResolver.handleChunk(text);
        if (maybeUuid) {
          actualSessionUuid = maybeUuid;
          resolveActualSessionUuid(maybeUuid);
        }
      }
      process.stdout.write(`[execution:${currentSessionId}] ${text}`);
    };

    child.stdout?.on('data', handleStdout);

    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[execution:${currentSessionId}] ${chunk.toString()}`);
    });

    child.once('exit', (code, signal) => {
      this.activeProcesses.delete(currentSessionId);
      activeExecutionRegistry.unregister(currentSessionId);
      if (sessionIdResolver && actualSessionUuid === null) {
        resolveActualSessionUuid(null);
      }
      process.stdout.write(
        `Execution ${currentSessionId} exited with code ${code ?? 'null'} signal ${signal ?? 'null'}\n`
      );
    });

    child.once('error', (error) => {
      process.stderr.write(`Execution ${currentSessionId} failed to start: ${String(error)}\n`);
      activeExecutionRegistry.unregister(currentSessionId);
    });

    if (stdinPayload && child.stdin) {
      child.stdin.write(stdinPayload);
      child.stdin.end();
    } else {
      child.stdin?.end();
    }

    let resolvedSessionId = mintedSessionId;
    if (sessionIdResolver || resolveSessionId) {
      let timeoutId: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<string>((resolve) => {
        timeoutId = setTimeout(
          () => resolve(mintedSessionId),
          ExecutionService.SESSION_ID_RESOLUTION_TIMEOUT_MS
        );
      });

      const exitPromise = new Promise<string>((resolve) => {
        const handleExit = () => resolve(mintedSessionId);
        const handleError = () => resolve(mintedSessionId);
        child.once('exit', handleExit);
        child.once('error', handleError);
        actualSessionUuidPromise.finally(() => {
          child.off('exit', handleExit);
          child.off('error', handleError);
        });
      });

      const resolutionCandidates: Array<Promise<string>> = [];

      if (sessionIdResolver) {
        resolutionCandidates.push(
          actualSessionUuidPromise.then((uuid) =>
            uuid
              ? this.composeSessionId(request.executorType, request.actualProjectId, uuid)
              : mintedSessionId
          )
        );
      }

      if (resolveSessionId) {
        resolutionCandidates.push(
          resolveSessionId({
            request,
            mintedSessionId,
            startedAt: launchedAt,
            timeoutMs: ExecutionService.SESSION_ID_RESOLUTION_TIMEOUT_MS
          })
            .then((uuid) =>
              uuid
                ? this.composeSessionId(request.executorType, request.actualProjectId, uuid)
                : mintedSessionId
            )
            .catch(() => mintedSessionId)
        );
      }

      const composed = await Promise.race([...resolutionCandidates, exitPromise, timeoutPromise]);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (composed !== mintedSessionId) {
        this.updateProcessSessionId(mintedSessionId, composed, child);
        activeExecutionRegistry.updateSessionId(mintedSessionId, composed);
        currentSessionId = composed;
        resolvedSessionId = composed;
      }
    }

    return {
      sessionId: resolvedSessionId,
      processId: child.pid ?? null,
      startedAt: launchedAt,
      projectId: request.projectId,
      kind: request.kind
    };
  }

  private composeSessionId(
    executorType: string,
    actualProjectId: string,
    sessionUuid?: string
  ): string {
    const suffix = sessionUuid ?? randomUUID();
    return `${executorType}:${actualProjectId}:${suffix}`;
  }

  private composeEnvironment(command: CommandConfig, request: LaunchRequest): NodeJS.ProcessEnv {
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...command.env,
      NORMALIZED_EXECUTION_KIND: request.kind,
      NORMALIZED_EXECUTION_PROFILE: request.profileLabel,
      NORMALIZED_EXECUTION_PROJECT_ID: request.projectId,
      NORMALIZED_EXECUTION_ACTUAL_PROJECT_ID: request.actualProjectId,
      NORMALIZED_EXECUTION_WORKSPACE: request.workspacePath,
      NORMALIZED_EXECUTION_SESSION_ID: request.sessionId
    };

    if (request.variantLabel) {
      baseEnv.NORMALIZED_EXECUTION_VARIANT = request.variantLabel;
    }

    return baseEnv;
  }

  private async ensureWorkspace(workspacePath: string): Promise<void> {
    try {
      await access(workspacePath);
    } catch (error) {
      throw new Error(`Workspace path does not exist: ${workspacePath}`);
    }
  }

  stopExecution(sessionId: string): boolean {
    const child = this.activeProcesses.get(sessionId);
    if (!child) {
      return false;
    }
    const result = child.kill('SIGTERM');
    if (result) {
      this.activeProcesses.delete(sessionId);
      activeExecutionRegistry.unregister(sessionId);
    }
    return result;
  }

  private buildDefaultProcessParameters(
    command: CommandConfig,
    request: LaunchRequest
  ): ProcessParameters {
    const args = [...command.args];
    const payload =
      request.kind === 'new'
        ? (request as NewChatRequest).prompt
        : (request as FollowUpRequest).message;

    if (payload && payload.length > 0) {
      return { args, stdinPayload: payload };
    }

    return { args };
  }

  private updateProcessSessionId(oldId: string, newId: string, child: ChildProcess) {
    if (oldId === newId) {
      return;
    }
    if (this.activeProcesses.get(oldId) === child) {
      this.activeProcesses.delete(oldId);
      this.activeProcesses.set(newId, child);
    }
  }
}
