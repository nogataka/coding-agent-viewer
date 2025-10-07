import { claudeCodeProfile } from './claudeCode';
import { geminiProfile } from './gemini';
import { codexProfile } from './codex';
import { opencodeProfile } from './opencode';
import { cursorProfile } from './cursor';
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