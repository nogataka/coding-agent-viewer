#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { executeAgent } from './src/execute-agent.js';
import { listProjects } from './src/list-projects.js';
import { listSessions } from './src/list-sessions.js';
import { streamLogs } from './src/stream-logs.js';

program
  .name('coding-agent-cli')
  .description('CLI tool for Coding Agent Viewer (Level 1 - Library Usage)')
  .version('1.0.0');

// list-projects コマンド
program
  .command('list-projects')
  .alias('lp')
  .description('List all available projects')
  .option('-p, --profile <profile>', 'Filter by profile (claude-code, cursor, gemini, etc.)')
  .option('-f, --format <format>', 'Output format (table, json, list)', 'table')
  .action(async (options) => {
    const spinner = ora('Fetching projects...').start();
    try {
      spinner.stop();
      await listProjects({ 
        profile: options.profile, 
        format: options.format 
      });
    } catch (error) {
      spinner.fail('Failed to fetch projects');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// list-sessions コマンド
program
  .command('list-sessions <project-id>')
  .alias('ls')
  .description('List all sessions for a project')
  .option('-f, --format <format>', 'Output format (table, json, list)', 'table')
  .option('-l, --limit <number>', 'Limit number of results', parseInt)
  .action(async (projectId, options) => {
    const spinner = ora('Fetching sessions...').start();
    try {
      spinner.stop();
      await listSessions(projectId, { 
        format: options.format,
        limit: options.limit
      });
    } catch (error) {
      spinner.fail('Failed to fetch sessions');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// execute コマンド
program
  .command('execute')
  .alias('exec')
  .description('Execute an AI agent')
  .requiredOption('-w, --workspace <path>', 'Workspace path')
  .requiredOption('-p, --prompt <prompt>', 'Prompt for the agent')
  .option('--profile <profile>', 'Agent profile (claude-code, cursor, etc.)', 'claude-code')
  .option('--variant <variant>', 'Profile variant (e.g., plan for claude-code)')
  .action(async (options) => {
    console.log(chalk.blue.bold('🚀 Coding Agent Execution'));
    console.log();
    
    const spinner = ora('Starting agent...').start();
    try {
      spinner.stop();
      await executeAgent(options.workspace, options.prompt, {
        profile: options.profile,
        variant: options.variant
      });
    } catch (error) {
      spinner.fail('Execution failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// show-logs コマンド
program
  .command('show-logs <session-id>')
  .alias('logs')
  .description('Stream logs for a session')
  .option('-f, --format <format>', 'Display format (pretty, simple)', 'pretty')
  .option('--raw', 'Show raw SSE events')
  .action(async (sessionId, options) => {
    try {
      await streamLogs(sessionId, {
        format: options.format,
        raw: options.raw
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// ヘルプの改善
program.on('--help', () => {
  console.log();
  console.log('Examples:');
  console.log();
  console.log('  $ coding-agent-cli list-projects');
  console.log('  $ coding-agent-cli list-sessions CLAUDE_CODE:L1VzZXJz...');
  console.log('  $ coding-agent-cli execute -w /path/to/project -p "Create a README"');
  console.log('  $ coding-agent-cli show-logs CLAUDE_CODE:...:uuid');
  console.log();
});

program.parse();
