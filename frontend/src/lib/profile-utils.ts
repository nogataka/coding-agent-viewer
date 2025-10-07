const EXECUTOR_TO_PROFILE: Record<string, string> = {
  CLAUDE_CODE: 'claude-code',
  CURSOR: 'cursor',
  GEMINI: 'gemini',
  CODEX: 'codex',
  OPENCODE: 'opencode',
};

const PROFILE_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  gemini: 'Gemini',
  codex: 'Codex',
  opencode: 'OpenCode',
};

export const profileFromExecutorType = (
  executorType?: string
): string | undefined => {
  if (!executorType) return undefined;
  const normalized = executorType.trim().toUpperCase();
  return EXECUTOR_TO_PROFILE[normalized] ?? normalized.toLowerCase();
};

export const profileFromProjectId = (
  projectId?: string | null
): string | undefined => {
  if (!projectId) return undefined;
  const [executorType] = projectId.split(':');
  return profileFromExecutorType(executorType);
};

export const profileDisplayName = (profile?: string | null): string | undefined => {
  if (!profile) return undefined;
  const key = profile.trim().toLowerCase();
  return PROFILE_DISPLAY_NAMES[key] ?? profile;
};

export const decodeBase64Url = (value: string): string => {
  try {
    const padded = value.padEnd(
      value.length + ((4 - (value.length % 4)) % 4),
      '='
    );
    const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
    const atobFn =
      (typeof globalThis !== 'undefined' &&
        (globalThis as Window & typeof globalThis).atob) ||
      (typeof window !== 'undefined' ? window.atob : undefined);
    if (atobFn) {
      return decodeURIComponent(
        Array.prototype.map
          .call(
            atobFn(normalized),
            (c: string) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`
          )
          .join('')
      );
    }
    const globalBuffer =
      typeof globalThis !== 'undefined' &&
      (
        globalThis as unknown as {
          Buffer?: {
            from: (
              input: string,
              encoding: string
            ) => { toString(enc: string): string };
          };
        }
      ).Buffer;
    if (globalBuffer) {
      return globalBuffer.from(normalized, 'base64').toString('utf-8');
    }
    return value;
  } catch (error) {
    console.warn('Failed to decode base64url value', { value, error });
    return value;
  }
};

export const workspaceNameFromProjectId = (
  projectId?: string | null
): string | undefined => {
  if (!projectId) return undefined;
  const [, encoded] = projectId.split(':');
  if (!encoded) return undefined;
  const decoded = decodeBase64Url(encoded);
  const parts = decoded.split(/[\\/]+/).filter(Boolean);
  return parts.pop() ?? decoded;
};
