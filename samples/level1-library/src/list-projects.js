#!/usr/bin/env node
import { LogSourceFactory } from '@nogataka/coding-agent-viewer/services/logs';

/**
 * すべてのプロジェクトを一覧表示
 */
async function listProjects(options = {}) {
  const {
    profile = null,
    format = 'table'
  } = options;

  console.log('📂 Fetching projects...');
  console.log();

  const factory = new LogSourceFactory();

  try {
    // すべてのプロジェクトを取得
    let projects = await factory.getAllProjects();

    // プロファイルでフィルタ
    if (profile) {
      const executorTypeMap = {
        'claude-code': 'CLAUDE_CODE',
        'cursor': 'CURSOR',
        'gemini': 'GEMINI',
        'codex': 'CODEX',
        'opencode': 'OPENCODE'
      };
      const executorType = executorTypeMap[profile] || profile.toUpperCase().replace(/-/g, '_');
      projects = projects.filter(p => p.id.startsWith(`${executorType}:`));
    }

    if (projects.length === 0) {
      console.log('No projects found.');
      return [];
    }

    console.log(`Found ${projects.length} project(s):`);
    console.log();

    if (format === 'table') {
      // テーブル形式で表示
      console.table(projects.map(p => ({
        ID: p.id.substring(0, 50) + (p.id.length > 50 ? '...' : ''),
        Name: p.name,
        Path: p.git_repo_path,
        Updated: new Date(p.updated_at).toLocaleString()
      })));
    } else if (format === 'json') {
      // JSON形式で表示
      console.log(JSON.stringify(projects, null, 2));
    } else {
      // シンプルなリスト形式
      projects.forEach((p, i) => {
        console.log(`${i + 1}. ${p.name}`);
        console.log(`   ID: ${p.id}`);
        console.log(`   Path: ${p.git_repo_path}`);
        console.log(`   Updated: ${new Date(p.updated_at).toLocaleString()}`);
        console.log();
      });
    }

    return projects;
  } catch (error) {
    console.error('❌ Failed to fetch projects:', error.message);
    throw error;
  }
}

// CLIとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  let profile = null;
  let format = 'table';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' || args[i] === '-p') {
      profile = args[++i];
    } else if (args[i] === '--format' || args[i] === '-f') {
      format = args[++i];
    }
  }

  listProjects({ profile, format })
    .catch(error => {
      process.exit(1);
    });
}

export { listProjects };
