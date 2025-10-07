#!/usr/bin/env node
import { LogSourceFactory } from '../../../backend/dist/services/src/logs/logSourceFactory.js';

/**
 * 指定されたプロジェクトのセッション一覧を表示
 */
async function listSessions(projectId, options = {}) {
  const {
    format = 'table',
    limit = null
  } = options;

  console.log('📋 Fetching sessions for project:', projectId);
  console.log();

  const factory = new LogSourceFactory();

  try {
    // セッション一覧を取得
    let sessions = await factory.getSessionsForProject(projectId);

    // 制限を適用
    if (limit) {
      sessions = sessions.slice(0, limit);
    }

    if (sessions.length === 0) {
      console.log('No sessions found.');
      return [];
    }

    console.log(`Found ${sessions.length} session(s):`);
    console.log();

    if (format === 'table') {
      // テーブル形式で表示
      console.table(sessions.map(s => ({
        ID: s.id.substring(0, 40) + '...',
        Title: s.title.substring(0, 60) + (s.title.length > 60 ? '...' : ''),
        Status: s.status,
        Updated: new Date(s.updatedAt).toLocaleString(),
        Size: `${(s.fileSize / 1024).toFixed(1)} KB`
      })));
    } else if (format === 'json') {
      // JSON形式で表示
      console.log(JSON.stringify(sessions, null, 2));
    } else {
      // シンプルなリスト形式
      sessions.forEach((s, i) => {
        console.log(`${i + 1}. ${s.title}`);
        console.log(`   ID: ${s.id}`);
        console.log(`   Status: ${s.status}`);
        console.log(`   Created: ${new Date(s.createdAt).toLocaleString()}`);
        console.log(`   Updated: ${new Date(s.updatedAt).toLocaleString()}`);
        if (s.firstUserMessage) {
          console.log(`   First Message: ${s.firstUserMessage.substring(0, 100)}...`);
        }
        console.log();
      });
    }

    console.log('💡 Tip: View logs with:');
    console.log(`   node src/stream-logs.js ${sessions[0].id}`);
    console.log();

    return sessions;
  } catch (error) {
    console.error('❌ Failed to fetch sessions:', error.message);
    throw error;
  }
}

// CLIとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node list-sessions.js <project-id> [--format <table|json|list>] [--limit <n>]');
    console.error();
    console.error('Example:');
    console.error('  node list-sessions.js CLAUDE_CODE:L1VzZXJz...');
    process.exit(1);
  }

  const projectId = args[0];
  let format = 'table';
  let limit = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' || args[i] === '-f') {
      format = args[++i];
    } else if (args[i] === '--limit' || args[i] === '-l') {
      limit = parseInt(args[++i], 10);
    }
  }

  listSessions(projectId, { format, limit })
    .catch(error => {
      process.exit(1);
    });
}

export { listSessions };
