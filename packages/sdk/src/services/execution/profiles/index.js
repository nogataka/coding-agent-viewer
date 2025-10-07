import { claudeCodeProfile } from './claudeCode.js';
import { geminiProfile } from './gemini.js';
import { codexProfile } from './codex.js';
import { opencodeProfile } from './opencode.js';
import { cursorProfile } from './cursor.js';
export const profileDefinitions = [
    claudeCodeProfile,
    geminiProfile,
    codexProfile,
    opencodeProfile,
    cursorProfile
];
export const profileMap = {
    'claude-code': claudeCodeProfile,
    gemini: geminiProfile,
    codex: codexProfile,
    opencode: opencodeProfile,
    cursor: cursorProfile
};
//# sourceMappingURL=index.js.map