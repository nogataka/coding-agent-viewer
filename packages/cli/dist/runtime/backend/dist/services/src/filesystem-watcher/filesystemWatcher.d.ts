import * as fsSync from 'fs';
import { EventEmitter } from 'events';
export interface FilesystemChangeEvent {
    type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
    path: string;
    stats?: fsSync.Stats;
    timestamp: Date;
}
export declare class FilesystemWatcherError extends Error {
    code?: string;
    constructor(message: string, code?: string);
}
export interface FilesystemWatcherOptions {
    /** Debounce delay in milliseconds */
    debounceMs?: number;
    /** Include hidden files and directories */
    includeHidden?: boolean;
    /** Follow symbolic links */
    followSymlinks?: boolean;
    /** Custom ignore patterns (in addition to .gitignore) */
    ignorePatterns?: string[];
    /** Maximum depth to watch */
    maxDepth?: number;
}
export declare class FilesystemWatcher extends EventEmitter {
    private watcher;
    private gitignore;
    private isWatching;
    private watchedPath;
    private debounceTimers;
    private options;
    constructor(options?: FilesystemWatcherOptions);
    /**
     * Start watching a directory
     */
    startWatching(watchPath: string): Promise<void>;
    /**
     * Stop watching
     */
    stopWatching(): Promise<void>;
    /**
     * Check if currently watching
     */
    isCurrentlyWatching(): boolean;
    /**
     * Get the currently watched path
     */
    getWatchedPath(): string;
    /**
     * Build gitignore rules from .gitignore files
     */
    private buildGitignoreRules;
    /**
     * Process .gitignore files in the directory tree
     */
    private processGitignoreFiles;
    /**
     * Find all .gitignore files in the directory tree
     */
    private findGitignoreFiles;
    /**
     * Check if a path should be ignored
     */
    private shouldIgnorePath;
    /**
     * Set up event handlers for the watcher
     */
    private setupEventHandlers;
    /**
     * Handle debounced events
     */
    private handleDebouncedEvent;
    /**
     * Get watcher statistics
     */
    getStats(): {
        isWatching: boolean;
        watchedPath: string;
        pendingEvents: number;
    };
    /**
     * Force trigger events for all files in watched directory
     */
    forceRefresh(): Promise<void>;
    /**
     * Get all files in the watched directory that match the ignore rules
     */
    private getAllWatchedFiles;
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}
export declare function getGlobalFilesystemWatcher(): FilesystemWatcher;
//# sourceMappingURL=filesystemWatcher.d.ts.map