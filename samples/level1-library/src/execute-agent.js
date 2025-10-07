#!/usr/bin/env node
import { ExecutionService } from '@nogataka/coding-agent-viewer-sdk/services/execution';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * エージェントを実行する
 */
async function executeAgent(workspacePath, prompt, options = {}) {
  const {
    profile = 'claude-code',
    variant = null
  } = options;

  console.log('🚀 Starting agent execution...');
  console.log('  Workspace:', workspacePath);
  console.log('  Profile:', profile);
  if (variant) console.log('  Variant:', variant);
  console.log('  Prompt:', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));
  console.log();

  // Executor Typeを決定
  const executorTypeMap = {
    'claude-code': 'CLAUDE_CODE',
    'cursor': 'CURSOR',
    'gemini': 'GEMINI',
    'codex': 'CODEX',
    'opencode': 'OPENCODE'
  };

  const executorType = executorTypeMap[profile] || profile.toUpperCase().replace(/-/g, '_');

  // プロジェクトIDを生成
  const actualProjectId = Buffer.from(workspacePath).toString('base64url');
  const projectId = `${executorType}:${actualProjectId}`;

  // ExecutionServiceを初期化
  const executor = new ExecutionService();

  try {
    // 実行開始
    const result = await executor.startNewChat({
      profileLabel: profile,
      variantLabel: variant,
      executorType,
      projectId,
      actualProjectId,
      workspacePath,
      prompt
    });

    console.log('✅ Execution started successfully!');
    console.log();
    console.log('Session ID:', result.sessionId);
    console.log('Process ID:', result.processId);
    console.log('Started At:', result.startedAt.toISOString());
    console.log();
    console.log('💡 Tip: Use the session ID to view logs:');
    console.log(`   node src/stream-logs.js ${result.sessionId}`);
    console.log();

    return result;
  } catch (error) {
    console.error('❌ Execution failed:', error.message);
    throw error;
  }
}

// CLIとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  // 引数のパース
  let workspace = null;
  let prompt = null;
  let profile = 'claude-code';
  let variant = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' || args[i] === '-w') {
      workspace = args[++i];
    } else if (args[i] === '--prompt' || args[i] === '-p') {
      prompt = args[++i];
    } else if (args[i] === '--profile') {
      profile = args[++i];
    } else if (args[i] === '--variant') {
      variant = args[++i];
    }
  }

  if (!workspace || !prompt) {
    console.error('Usage: node execute-agent.js --workspace <path> --prompt <prompt> [--profile <profile>] [--variant <variant>]');
    console.error();
    console.error('Example:');
    console.error('  node execute-agent.js --workspace /path/to/project --prompt "Create a README file"');
    process.exit(1);
  }

  executeAgent(resolve(workspace), prompt, { profile, variant })
    .catch(error => {
      process.exit(1);
    });
}

export { executeAgent };
