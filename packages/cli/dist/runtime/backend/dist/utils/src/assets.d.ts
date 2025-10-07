/**
 * Get the appropriate asset directory path based on environment
 *
 * Development: PROJECT_ROOT/dev_assets
 * Production: OS-appropriate app data directory
 * - macOS: ~/Library/Application Support/coding-agent-viewer
 * - Linux: ~/.local/share/coding-agent-viewer
 * - Windows: %APPDATA%\coding-agent-viewer
 */
export declare function assetDir(): Promise<string>;
/**
 * Get the config file path
 */
export declare function configPath(): Promise<string>;
/**
 * Get the profiles file path
 */
export declare function profilesPath(): Promise<string>;
/**
 * Get path for logs directory
 */
export declare function logsDir(): Promise<string>;
/**
 * Get path for temp directory
 */
export declare function tempDir(): Promise<string>;
/**
 * Get path for cache directory
 */
export declare function cacheDir(): Promise<string>;
/**
 * Check if a file exists in the asset directory
 */
export declare function assetExists(filename: string): Promise<boolean>;
/**
 * Read asset file content
 */
export declare function readAssetFile(filename: string): Promise<string>;
/**
 * Write asset file content
 */
export declare function writeAssetFile(filename: string, content: string): Promise<void>;
/**
 * Asset management for embedded content
 * TypeScript/Node.js equivalent of Rust's RustEmbed functionality
 */
export declare class AssetManager {
    private static scriptsPath;
    static initialize(): Promise<void>;
    static listScripts(): Promise<string[]>;
    static getScriptPath(filename: string): Promise<string | null>;
}
//# sourceMappingURL=assets.d.ts.map