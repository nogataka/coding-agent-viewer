import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import ignoreModule, { Ignore } from 'ignore';
import { logger } from '../../utils/logger.js';
type IgnoreFactory = (options?: unknown) => Ignore;
const createIgnore = ignoreModule as unknown as IgnoreFactory;

export interface FilesystemChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  stats?: fsSync.Stats;
  timestamp: Date;
}

export class FilesystemWatcherError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'FilesystemWatcherError';
  }
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

export class FilesystemWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private gitignore: Ignore | null = null;
  private isWatching: boolean = false;
  private watchedPath: string = '';
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private options: Required<FilesystemWatcherOptions>;

  constructor(options: FilesystemWatcherOptions = {}) {
    super();
    this.options = {
      debounceMs: options.debounceMs ?? 100,
      includeHidden: options.includeHidden ?? false,
      followSymlinks: options.followSymlinks ?? false,
      ignorePatterns: options.ignorePatterns ?? [],
      maxDepth: options.maxDepth ?? 20
    };
  }

  /**
   * Start watching a directory
   */
  async startWatching(watchPath: string): Promise<void> {
    if (this.isWatching) {
      throw new FilesystemWatcherError('Already watching a directory', 'ALREADY_WATCHING');
    }

    const resolvedPath = path.resolve(watchPath);

    try {
      // Verify the path exists and is a directory
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new FilesystemWatcherError(
          `Path is not a directory: ${resolvedPath}`,
          'NOT_DIRECTORY'
        );
      }

      this.watchedPath = resolvedPath;

      // Build gitignore rules
      await this.buildGitignoreRules(resolvedPath);

      // Set up chokidar watcher
      this.watcher = watch(resolvedPath, {
        followSymlinks: this.options.followSymlinks,
        ignoreInitial: true,
        persistent: true,
        depth: this.options.maxDepth,
        ignored: this.shouldIgnorePath.bind(this),
        // Chokidar options
        usePolling: false,
        useFsEvents: process.platform === 'darwin',
        alwaysStat: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
      });

      // Set up event handlers
      this.setupEventHandlers();

      this.isWatching = true;
      logger.info(`Started watching filesystem: ${resolvedPath}`);
    } catch (error) {
      throw new FilesystemWatcherError(
        `Failed to start watching ${resolvedPath}: ${error}`,
        'START_WATCH_FAILED'
      );
    }
  }

  /**
   * Stop watching
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      return;
    }

    try {
      // Clear all debounce timers
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();

      // Close the watcher
      await this.watcher.close();
      this.watcher = null;

      this.isWatching = false;
      this.watchedPath = '';
      this.gitignore = null;

      logger.info('Stopped filesystem watching');
    } catch (error) {
      throw new FilesystemWatcherError(`Failed to stop watching: ${error}`, 'STOP_WATCH_FAILED');
    }
  }

  /**
   * Check if currently watching
   */
  isCurrentlyWatching(): boolean {
    return this.isWatching;
  }

  /**
   * Get the currently watched path
   */
  getWatchedPath(): string {
    return this.watchedPath;
  }

  /**
   * Build gitignore rules from .gitignore files
   */
  private async buildGitignoreRules(rootPath: string): Promise<void> {
    try {
      this.gitignore = createIgnore();

      // Add custom ignore patterns
      this.gitignore.add(this.options.ignorePatterns);

      // Add common ignore patterns
      this.gitignore.add([
        'node_modules/**',
        '.git/**',
        '.vscode/**',
        '.idea/**',
        '**/.DS_Store',
        '**/Thumbs.db',
        '**/*.log',
        '**/dist/**',
        '**/build/**',
        '**/.cache/**',
        '**/.tmp/**'
      ]);

      // Find and process .gitignore files
      await this.processGitignoreFiles(rootPath);

      // Add .git/info/exclude if it exists
      const excludePath = path.join(rootPath, '.git', 'info', 'exclude');
      try {
        const excludeContent = await fs.readFile(excludePath, 'utf-8');
        this.gitignore.add(
          excludeContent.split('\n').filter((line) => line.trim() && !line.startsWith('#'))
        );
      } catch {
        // .git/info/exclude doesn't exist, which is fine
      }
    } catch (error) {
      logger.warn(`Failed to build gitignore rules: ${error}`);
      // Continue without gitignore rules
      this.gitignore = createIgnore();
    }
  }

  /**
   * Process .gitignore files in the directory tree
   */
  private async processGitignoreFiles(rootPath: string): Promise<void> {
    try {
      const gitignoreFiles = await this.findGitignoreFiles(rootPath);

      for (const gitignoreFile of gitignoreFiles) {
        try {
          const content = await fs.readFile(gitignoreFile, 'utf-8');
          const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

          // Convert to paths relative to the root
          const gitignoreDir = path.dirname(gitignoreFile);
          const relativePath = path.relative(rootPath, gitignoreDir);

          const adjustedLines = lines.map((line) => {
            if (relativePath && relativePath !== '.') {
              return path.join(relativePath, line).replace(/\\/g, '/');
            }
            return line;
          });

          this.gitignore.add(adjustedLines);
        } catch (error) {
          logger.debug(`Failed to read ${gitignoreFile}: ${error}`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to process .gitignore files: ${error}`);
    }
  }

  /**
   * Find all .gitignore files in the directory tree
   */
  private async findGitignoreFiles(rootPath: string, maxDepth: number = 10): Promise<string[]> {
    const gitignoreFiles: string[] = [];

    const searchDir = async (dirPath: string, currentDepth: number = 0) => {
      if (currentDepth > maxDepth) return;

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isFile() && entry.name === '.gitignore') {
            gitignoreFiles.push(fullPath);
          } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
            await searchDir(fullPath, currentDepth + 1);
          }
        }
      } catch (error) {
        // Ignore permission errors and continue
        logger.debug(`Cannot access directory ${dirPath}: ${error}`);
      }
    };

    await searchDir(rootPath);
    return gitignoreFiles;
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnorePath(filePath: string): boolean {
    if (!this.gitignore) return false;

    // Convert absolute path to relative path from watched root
    const relativePath = path.relative(this.watchedPath, filePath);

    // Don't ignore paths outside the watched directory
    if (relativePath.startsWith('..')) {
      return false;
    }

    // Check against gitignore rules
    const shouldIgnore = this.gitignore.ignores(relativePath);

    // Handle hidden files
    if (!this.options.includeHidden) {
      const basename = path.basename(relativePath);
      if (basename.startsWith('.') && basename !== '.gitignore') {
        return true;
      }
    }

    return shouldIgnore;
  }

  /**
   * Set up event handlers for the watcher
   */
  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher.on('add', (filePath, stats) => {
      this.handleDebouncedEvent('add', filePath, stats);
    });

    this.watcher.on('change', (filePath, stats) => {
      this.handleDebouncedEvent('change', filePath, stats);
    });

    this.watcher.on('unlink', (filePath) => {
      this.handleDebouncedEvent('unlink', filePath);
    });

    this.watcher.on('addDir', (dirPath, stats) => {
      this.handleDebouncedEvent('addDir', dirPath, stats);
    });

    this.watcher.on('unlinkDir', (dirPath) => {
      this.handleDebouncedEvent('unlinkDir', dirPath);
    });

    this.watcher.on('error', (error) => {
      logger.error('Filesystem watcher error:', error);
      this.emit('error', new FilesystemWatcherError(`Watcher error: ${error}`, 'WATCHER_ERROR'));
    });

    this.watcher.on('ready', () => {
      logger.debug('Filesystem watcher ready');
      this.emit('ready');
    });
  }

  /**
   * Handle debounced events
   */
  private handleDebouncedEvent(
    eventType: FilesystemChangeEvent['type'],
    filePath: string,
    stats?: fsSync.Stats
  ): void {
    // Clear existing timer for this path
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);

      const event: FilesystemChangeEvent = {
        type: eventType,
        path: filePath,
        stats,
        timestamp: new Date()
      };

      this.emit('change', event);
      this.emit(eventType, event);
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Get watcher statistics
   */
  getStats(): {
    isWatching: boolean;
    watchedPath: string;
    pendingEvents: number;
  } {
    return {
      isWatching: this.isWatching,
      watchedPath: this.watchedPath,
      pendingEvents: this.debounceTimers.size
    };
  }

  /**
   * Force trigger events for all files in watched directory
   */
  async forceRefresh(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      throw new FilesystemWatcherError('Not currently watching', 'NOT_WATCHING');
    }

    try {
      // Get all files in the watched directory
      const files = await this.getAllWatchedFiles(this.watchedPath);

      for (const filePath of files) {
        try {
          const stats = await fs.stat(filePath);
          const event: FilesystemChangeEvent = {
            type: stats.isDirectory() ? 'addDir' : 'add',
            path: filePath,
            stats,
            timestamp: new Date()
          };
          this.emit('change', event);
        } catch {
          // File might have been deleted since listing
          continue;
        }
      }

      logger.debug(`Force refreshed ${files.length} files`);
    } catch (error) {
      throw new FilesystemWatcherError(`Failed to force refresh: ${error}`, 'FORCE_REFRESH_FAILED');
    }
  }

  /**
   * Get all files in the watched directory that match the ignore rules
   */
  private async getAllWatchedFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    const walkDir = async (currentPath: string) => {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          if (!this.shouldIgnorePath(fullPath)) {
            files.push(fullPath);

            if (entry.isDirectory()) {
              await walkDir(fullPath);
            }
          }
        }
      } catch {
        // Ignore errors and continue
      }
    };

    await walkDir(dirPath);
    return files;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stopWatching();
    this.removeAllListeners();
  }
}

// Global filesystem watcher instance
let globalFilesystemWatcher: FilesystemWatcher | null = null;

export function getGlobalFilesystemWatcher(): FilesystemWatcher {
  if (!globalFilesystemWatcher) {
    globalFilesystemWatcher = new FilesystemWatcher();
  }
  return globalFilesystemWatcher;
}
