// Version utilities - equivalent to Rust's utils/src/version.rs
import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * Get the current application version from package.json
 */
export async function getAppVersion() {
    try {
        const packagePath = path.join(process.cwd(), 'package.json');
        const packageContent = await fs.readFile(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        return packageJson.version || '0.0.0';
    }
    catch (error) {
        console.warn('Failed to read version from package.json:', error);
        return '0.0.0';
    }
}
/**
 * Static application version (to be updated during build)
 */
export const APP_VERSION = '0.1.0'; // This should match package.json
/**
 * Get version info including Node.js version
 */
export async function getVersionInfo() {
    const appVersion = await getAppVersion();
    return {
        app: appVersion,
        node: process.version,
        platform: process.platform,
        arch: process.arch
    };
}
/**
 * Compare two semantic version strings
 */
export function compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    for (let i = 0; i < maxLength; i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        if (v1Part > v2Part)
            return 1;
        if (v1Part < v2Part)
            return -1;
    }
    return 0;
}
/**
 * Check if a version satisfies a requirement (simple semver check)
 */
export function satisfiesVersion(version, requirement) {
    // Handle basic requirements like ">=1.0.0", "^1.0.0", "~1.0.0"
    if (requirement.startsWith('>=')) {
        const requiredVersion = requirement.substring(2);
        return compareVersions(version, requiredVersion) >= 0;
    }
    else if (requirement.startsWith('^')) {
        const requiredVersion = requirement.substring(1);
        const versionParts = version.split('.').map(Number);
        const reqParts = requiredVersion.split('.').map(Number);
        // Major version must match, minor and patch can be higher
        return versionParts[0] === reqParts[0] && compareVersions(version, requiredVersion) >= 0;
    }
    else if (requirement.startsWith('~')) {
        const requiredVersion = requirement.substring(1);
        const versionParts = version.split('.').map(Number);
        const reqParts = requiredVersion.split('.').map(Number);
        // Major and minor must match, patch can be higher
        return (versionParts[0] === reqParts[0] &&
            versionParts[1] === reqParts[1] &&
            compareVersions(version, requiredVersion) >= 0);
    }
    else {
        // Exact match
        return version === requirement;
    }
}
//# sourceMappingURL=version.js.map