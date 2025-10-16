import {
  ProfileDefinition,
  LaunchRequest,
  ProcessParameters,
  SessionIdResolver
} from '../types.js';

const SESSION_ID_KEYS = ['session_uuid', 'session_id', 'sessionId'];

const createSessionIdResolver = (): SessionIdResolver => {
  let buffer = '';

  const tryParseLine = (line: string): string | null => {
    if (!line) {
      return null;
    }

    try {
      const parsed = JSON.parse(line);
      return extractSessionIdentifier(parsed);
    } catch {
      return null;
    }
  };

  return {
    handleChunk(chunk: string): string | null {
      buffer += chunk;

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        const maybeId = tryParseLine(line);
        if (maybeId) {
          return maybeId;
        }

        newlineIndex = buffer.indexOf('\n');
      }

      const trimmed = buffer.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const maybeId = tryParseLine(trimmed);
        if (maybeId) {
          buffer = '';
          return maybeId;
        }
      }

      return null;
    }
  };
};

const extractSessionIdentifier = (payload: any): string | null => {
  for (const key of SESSION_ID_KEYS) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const message = payload?.message;
  if (message && typeof message === 'object') {
    for (const key of SESSION_ID_KEYS) {
      const value = message[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  const session = payload?.session;
  if (session && typeof session === 'object') {
    for (const key of SESSION_ID_KEYS) {
      const value = session[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return null;
};

const buildProcessParameters = (command: ProfileDefinition['command'], request: LaunchRequest): ProcessParameters => {
  const args = [...command.args];
  let stdinPayload: string | undefined;

  if (request.kind === 'new' && 'prompt' in request) {
    stdinPayload = typeof request.prompt === 'string' ? request.prompt : undefined;
  } else if (request.kind === 'follow-up' && 'message' in request) {
    stdinPayload = typeof request.message === 'string' ? request.message : undefined;
  }

  const parameters: ProcessParameters = {
    args,
    stdinPayload
  };

  if (request.kind === 'new') {
    parameters.createSessionIdResolver = createSessionIdResolver;
  }

  return parameters;
};

export const claudeCodeProfile: ProfileDefinition = {
  label: 'claude-code',
  command: {
    binary: 'npx',
    args: [
      '-y',
      '@anthropic-ai/claude-code@latest',
      '-p',
      '--dangerously-skip-permissions',
      '--verbose',
      '--output-format=stream-json'
    ]
  },
  variants: [
    {
      label: 'plan',
      command: {
        binary: 'npx',
        args: [
          '-y',
          '@anthropic-ai/claude-code@latest',
          '-p',
          '--permission-mode=plan',
          '--verbose',
          '--output-format=stream-json'
        ]
      }
    }
  ],
  buildProcessParameters
};
