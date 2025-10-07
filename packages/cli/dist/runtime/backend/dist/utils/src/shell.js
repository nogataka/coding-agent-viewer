// Cross-platform shell command utilities - equivalent to Rust's utils/src/shell.rs
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { accessSync } from 'fs';
const execAsync = promisify(exec);
/**
 * Returns the appropriate shell command and argument for the current platform.
 *
 * Returns [shell_program, shell_arg] where:
 * - Windows: ["cmd", "/C"]
 * - Unix-like: ["sh", "-c"] or ["bash", "-c"] if available
 */
export function getShellCommand() {
    if (process.platform === 'win32') {
        return ['cmd', '/C'];
    }
    else {
        // Prefer bash if available, fallback to sh
        try {
            accessSync('/bin/bash');
            return ['bash', '-c'];
        }
        catch {
            return ['sh', '-c'];
        }
    }
}
/**
 * Resolves the full path of an executable using the system's PATH environment variable.
 * Note: On Windows, resolving the executable path can be necessary before passing
 * it to child_process.spawn, as it may have difficulties finding executables.
 */
export async function resolveExecutablePath(executable) {
    try {
        // Try to use 'which' command on Unix-like systems
        if (process.platform !== 'win32') {
            const { stdout } = await execAsync(`which ${executable}`);
            return stdout.trim() || null;
        }
        else {
            // On Windows, try 'where' command
            const { stdout } = await execAsync(`where ${executable}`);
            const lines = stdout.trim().split('\n');
            return lines[0] || null;
        }
    }
    catch {
        // Fallback: check if executable exists in common locations
        const commonPaths = process.env.PATH?.split(path.delimiter) || [];
        for (const dir of commonPaths) {
            const executableExtensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
            for (const ext of executableExtensions) {
                const fullPath = path.join(dir, executable + ext);
                try {
                    await fs.access(fullPath);
                    return fullPath;
                }
                catch {
                    // Continue to next path
                }
            }
        }
        return null;
    }
}
/**
 * Execute a shell command with proper shell handling
 */
export async function executeShellCommand(command, options = {}) {
    const [shell, shellArg] = getShellCommand();
    return new Promise((resolve, reject) => {
        const child = spawn(shell, [shellArg, command], {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: 'pipe'
        });
        let stdout = '';
        let stderr = '';
        let timeoutHandle = null;
        if (options.timeout) {
            timeoutHandle = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Command timed out after ${options.timeout}ms`));
            }, options.timeout);
        }
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: code || 0
            });
        });
        child.on('error', (error) => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            reject(error);
        });
    });
}
/**
 * Execute command and return only stdout, throwing on non-zero exit
 */
export async function executeShellCommandSimple(command, options = {}) {
    const result = await executeShellCommand(command, options);
    if (result.exitCode !== 0) {
        throw new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr}`);
    }
    return result.stdout;
}
/**
 * Check if a command exists in the system PATH
 */
export async function commandExists(command) {
    const resolvedPath = await resolveExecutablePath(command);
    return resolvedPath !== null;
}
/**
 * Execute multiple commands sequentially
 */
export async function executeShellCommands(commands, options = {}) {
    const results = [];
    for (const command of commands) {
        try {
            const result = await executeShellCommand(command, options);
            results.push({ command, ...result });
            // If command failed and we shouldn't continue on error, break
            if (result.exitCode !== 0 && !options.continueOnError) {
                break;
            }
        }
        catch (error) {
            const errorResult = {
                command,
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
                exitCode: -1
            };
            results.push(errorResult);
            if (!options.continueOnError) {
                break;
            }
        }
    }
    return results;
}
/**
 * Get environment variables with shell expansion
 */
export function expandEnvironmentVariables(text) {
    // Simple environment variable expansion
    // Supports both $VAR and ${VAR} formats
    return text
        .replace(/\$\{([^}]+)\}/g, (_, varName) => {
        return process.env[varName] || '';
    })
        .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, varName) => {
        return process.env[varName] || '';
    });
}
/**
 * Escape shell argument for safe execution
 */
export function escapeShellArg(arg) {
    if (process.platform === 'win32') {
        // Windows shell escaping
        return `"${arg.replace(/"/g, '""')}"`;
    }
    else {
        // Unix shell escaping
        return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }
}
/**
 * Build command with escaped arguments
 */
export function buildShellCommand(command, args) {
    const escapedArgs = args.map(escapeShellArg);
    return [command, ...escapedArgs].join(' ');
}
//# sourceMappingURL=shell.js.map