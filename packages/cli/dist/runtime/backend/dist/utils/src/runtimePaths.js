import path from 'path';
import { getDataDir } from './dataDir';
const runtimeRoot = process.env.CODING_AGENT_RUNTIME_DIR || process.cwd();
const userWorkingDir = process.env.CODING_AGENT_USER_CWD || process.env.INIT_CWD || process.cwd();
const dataDir = process.env.CODING_AGENT_DATA_DIR
    ? path.resolve(process.env.CODING_AGENT_DATA_DIR)
    : getDataDir();
const assetsDir = process.env.CODING_AGENT_ASSETS_DIR
    ? path.resolve(process.env.CODING_AGENT_ASSETS_DIR)
    : path.resolve(runtimeRoot, '..', 'assets');
const frontendDistDir = process.env.CODING_AGENT_FRONTEND_DIR || path.join(runtimeRoot, '..', 'frontend', 'dist');
export const runtimePaths = {
    root: runtimeRoot,
    dataDir,
    assetsDir,
    frontendDistDir
};
export const userPaths = {
    cwd: userWorkingDir
};
export function resolveRuntimePath(...segments) {
    return path.join(runtimeRoot, ...segments);
}
export function resolveDataPath(...segments) {
    return path.join(dataDir, ...segments);
}
export function resolveAssetsPath(...segments) {
    return path.join(assetsDir, ...segments);
}
export function resolveFrontendPath(...segments) {
    return path.join(frontendDistDir, ...segments);
}
export function resolveUserPath(...segments) {
    return path.join(userWorkingDir, ...segments);
}
//# sourceMappingURL=runtimePaths.js.map