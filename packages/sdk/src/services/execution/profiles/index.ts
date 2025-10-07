import { ProfileDefinition } from '../types.js';
import { claudeCodeProfile } from './claudeCode.js';
import { geminiProfile } from './gemini.js';
import { codexProfile } from './codex.js';
import { opencodeProfile } from './opencode.js';
import { cursorProfile } from './cursor.js';

export const profileDefinitions: ProfileDefinition[] = [
  claudeCodeProfile,
  geminiProfile,
  codexProfile,
  opencodeProfile,
  cursorProfile
];

export type ProfileKey = 'claude-code' | 'gemini' | 'codex' | 'opencode' | 'cursor';

export const profileMap: Record<ProfileKey, ProfileDefinition> = {
  'claude-code': claudeCodeProfile,
  gemini: geminiProfile,
  codex: codexProfile,
  opencode: opencodeProfile,
  cursor: cursorProfile
};
