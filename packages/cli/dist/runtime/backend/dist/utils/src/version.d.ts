/**
 * Get the current application version from package.json
 */
export declare function getAppVersion(): Promise<string>;
/**
 * Static application version (to be updated during build)
 */
export declare const APP_VERSION = "0.1.0";
/**
 * Get version info including Node.js version
 */
export declare function getVersionInfo(): Promise<{
    app: string;
    node: string;
    platform: string;
    arch: string;
}>;
/**
 * Compare two semantic version strings
 */
export declare function compareVersions(version1: string, version2: string): number;
/**
 * Check if a version satisfies a requirement (simple semver check)
 */
export declare function satisfiesVersion(version: string, requirement: string): boolean;
//# sourceMappingURL=version.d.ts.map