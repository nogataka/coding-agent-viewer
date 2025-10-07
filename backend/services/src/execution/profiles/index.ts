import { ProfileDefinition } from '../types';
import { claudeCodeProfile } from './claudeCode';
import { geminiProfile } from './gemini';
import { codexProfile } from './codex';
import { opencodeProfile } from './opencode';
import { cursorProfile } from './cursor';

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
