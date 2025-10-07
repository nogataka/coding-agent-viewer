import {
  CommandConfig,
  FollowUpRequest,
  LaunchRequest,
  NewChatRequest,
  ProcessParameters,
  ProfileDefinition,
  SessionResolutionContext
} from '../types.js';
import * as path from 'path';
import * as os from 'os';
import { readdir, stat } from 'fs/promises';
import type { Dirent } from 'fs';

const GEMINI_TMP_ROOT = path.join(os.homedir(), '.gemini', 'tmp');
const SESSION_SCAN_INTERVAL_MS = 500;
const SESSION_STALENESS_ALLOWANCE_MS = 5_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseCompositeSessionId = (
  sessionId: string
): { executorType: string; actualProjectId: string; actualSessionId: string } | null => {
  const [executorType, projectId, ...rest] = sessionId.split(':');
  if (!executorType || !projectId || rest.length === 0) {
    return null;
  }
  return {
    executorType,
    actualProjectId: projectId,
    actualSessionId: rest.join(':')
  };
};

const resolveGeminiSessionIdFromFilesystem = async (
  context: SessionResolutionContext
): Promise<string | null> => {
  const projectId = context.request.actualProjectId;
  const projectDir = path.join(GEMINI_TMP_ROOT, projectId);
  const chatsDir = path.join(projectDir, 'chats');
  const deadline = context.startedAt.getTime() + context.timeoutMs;

  while (Date.now() < deadline) {
    let entries: Dirent[];
    try {
      entries = await readdir(chatsDir, { withFileTypes: true });
    } catch {
      await delay(SESSION_SCAN_INTERVAL_MS);
      continue;
    }

    const launchedAtMs = context.startedAt.getTime();
    let best: { sessionId: string; updatedAtMs: number } | null = null;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.startsWith('session-') || !entry.name.endsWith('.json')) {
        continue;
      }

      const fullPath = path.join(chatsDir, entry.name);
      const fileStats = await stat(fullPath).catch(() => null);
      if (!fileStats) {
        continue;
      }

      if (fileStats.mtimeMs + SESSION_STALENESS_ALLOWANCE_MS < launchedAtMs) {
        continue;
      }

      const sessionId = entry.name.replace('session-', '').replace('.json', '');
      if (!sessionId) {
        continue;
      }

      if (!best || fileStats.mtimeMs > best.updatedAtMs) {
        best = { sessionId, updatedAtMs: fileStats.mtimeMs };
      }
    }

    if (best) {
      return best.sessionId;
    }

    await delay(SESSION_SCAN_INTERVAL_MS);
  }

  return null;
};

const buildGeminiParameters = (
  command: CommandConfig,
  request: LaunchRequest
): ProcessParameters => {
  const args = [...command.args];
  const payload =
    request.kind === 'new'
      ? (request as NewChatRequest).prompt
      : (request as FollowUpRequest).message;

  if (request.kind === 'follow-up') {
    const parsed = parseCompositeSessionId(request.sessionId);
    if (!parsed || !parsed.actualSessionId) {
      throw new Error('Invalid session identifier for Gemini follow-up');
    }
  }

  return {
    args,
    stdinPayload: payload && payload.length > 0 ? payload : undefined,
    resolveSessionId: request.kind === 'new' ? resolveGeminiSessionIdFromFilesystem : undefined
  };
};

export const geminiProfile: ProfileDefinition = {
  label: 'gemini',
  command: {
    binary: 'npx',
    args: ['-y', '@google/gemini-cli@latest', '--yolo']
  },
  variants: [
    {
      label: 'flash',
      command: {
        binary: 'npx',
        args: ['-y', '@google/gemini-cli@latest', '--yolo', '--model', 'gemini-2.5-flash']
      }
    }
  ],
  buildProcessParameters: buildGeminiParameters
};
