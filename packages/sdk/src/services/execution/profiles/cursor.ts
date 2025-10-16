import {
  ProfileDefinition,
  ProcessParameters,
  LaunchRequest,
  SessionResolutionContext,
  CommandConfig,
  NewChatRequest,
  FollowUpRequest
} from '../types.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';

const CURSOR_CHATS_ROOT = path.join(os.homedir(), '.cursor', 'chats');
const SESSION_SCAN_INTERVAL_MS = 500;
const SESSION_STALENESS_ALLOWANCE_MS = 5_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const resolveCursorSessionId = async (
  context: SessionResolutionContext
): Promise<string | null> => {
  const { request, startedAt, timeoutMs } = context;
  const projectHash = request.actualProjectId;
  const projectDir = path.join(CURSOR_CHATS_ROOT, projectHash);
  const deadline = startedAt.getTime() + timeoutMs;

  while (Date.now() < deadline) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(projectDir, { withFileTypes: true });
    } catch {
      await delay(SESSION_SCAN_INTERVAL_MS);
      continue;
    }

    const launchedAtMs = startedAt.getTime();
    let best: { sessionId: string; updatedAtMs: number } | null = null;
    let freshest: { sessionId: string; updatedAtMs: number } | null = null;

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const storePath = path.join(projectDir, entry.name, 'store.db');
      const stats = await fs.stat(storePath).catch(() => null);
      if (!stats) {
        continue;
      }

      if (!freshest || stats.mtimeMs > freshest.updatedAtMs) {
        freshest = { sessionId: entry.name, updatedAtMs: stats.mtimeMs };
      }

      if (stats.mtimeMs + SESSION_STALENESS_ALLOWANCE_MS < launchedAtMs) {
        continue;
      }

      if (!best || stats.mtimeMs > best.updatedAtMs) {
        best = { sessionId: entry.name, updatedAtMs: stats.mtimeMs };
      }
    }

    if (best) {
      return best.sessionId;
    }

    if (freshest) {
      return freshest.sessionId;
    }

    await delay(SESSION_SCAN_INTERVAL_MS);
  }

  return null;
};

const buildCursorProcessParameters = (
  command: CommandConfig,
  request: LaunchRequest
): ProcessParameters => {
  const parameters: ProcessParameters = {
    args: [...command.args]
  };

  if (request.kind === 'new') {
    const newRequest = request as NewChatRequest;
    if (typeof newRequest.prompt === 'string' && newRequest.prompt.trim().length > 0) {
      parameters.stdinPayload = newRequest.prompt;
    }
    parameters.resolveSessionId = (context) => resolveCursorSessionId(context);
  } else if (request.kind === 'follow-up') {
    const followUpRequest = request as FollowUpRequest;
    if (
      typeof followUpRequest.message === 'string' &&
      followUpRequest.message.trim().length > 0
    ) {
      parameters.stdinPayload = followUpRequest.message;
    }
  }

  return parameters;
};

export const cursorProfile: ProfileDefinition = {
  label: 'cursor',
  command: {
    binary: 'cursor-agent',
    args: ['-p', '--output-format=stream-json', '--force']
  },
  buildProcessParameters: buildCursorProcessParameters
};
