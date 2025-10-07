/**
 * Returns the appropriate shell command and argument for the current platform.
 *
 * Returns [shell_program, shell_arg] where:
 * - Windows: ["cmd", "/C"]
 * - Unix-like: ["sh", "-c"] or ["bash", "-c"] if available
 */
export declare function getShellCommand(): [string, string];
/**
 * Resolves the full path of an executable using the system's PATH environment variable.
 * Note: On Windows, resolving the executable path can be necessary before passing
 * it to child_process.spawn, as it may have difficulties finding executables.
 */
export declare function resolveExecutablePath(executable: string): Promise<string | null>;
/**
 * Execute a shell command with proper shell handling
 */
export declare function executeShellCommand(command: string, options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
}): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}>;
/**
 * Execute command and return only stdout, throwing on non-zero exit
 */
export declare function executeShellCommandSimple(command: string, options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
}): Promise<string>;
/**
 * Check if a command exists in the system PATH
 */
export declare function commandExists(command: string): Promise<boolean>;
/**
 * Execute multiple commands sequentially
 */
export declare function executeShellCommands(commands: string[], options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    continueOnError?: boolean;
}): Promise<Array<{
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
}>>;
/**
 * Get environment variables with shell expansion
 */
export declare function expandEnvironmentVariables(text: string): string;
/**
 * Escape shell argument for safe execution
 */
export declare function escapeShellArg(arg: string): string;
/**
 * Build command with escaped arguments
 */
export declare function buildShellCommand(command: string, args: string[]): string;
//# sourceMappingURL=shell.d.ts.map