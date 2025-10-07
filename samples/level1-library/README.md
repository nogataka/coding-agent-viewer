# レベル1: ライブラリとして直接利用

このサンプルは、Execution ModuleとLog Moduleを直接利用する最もシンプルな形態です。

## 概要

- **利用モジュール**: `execution-module`, `log-module`
- **HTTP不要**: APIサーバーなし
- **用途**: CLIツール、バッチ処理、CI/CD、他アプリへの組み込み

## ディレクトリ構造

```
level1-library/
├── README.md
├── package.json
├── src/
│   ├── execute-agent.js      # エージェント実行の例
│   ├── list-projects.js      # プロジェクト一覧の例
│   ├── list-sessions.js      # セッション一覧の例
│   └── stream-logs.js        # ログストリーミングの例
└── cli.js                    # CLIエントリーポイント
```

## インストール

```bash
cd samples/level1-library
npm install
```

## 使用方法

### 1. プロジェクト一覧を表示

```bash
node src/list-projects.js
```

### 2. 特定のプロジェクトのセッション一覧を表示

```bash
node src/list-sessions.js CLAUDE_CODE:L1VzZXJz...
```

### 3. エージェントを実行

```bash
node src/execute-agent.js \
  --workspace "/path/to/your/project" \
  --prompt "Create a new React component"
```

### 4. セッションのログをストリーミング表示

```bash
node src/stream-logs.js CLAUDE_CODE:L1VzZXJz...:550e8400-e29b-41d4-a716
```

### 5. CLIとして使用

```bash
node cli.js --help

# プロジェクト一覧
node cli.js list-projects

# エージェント実行
node cli.js execute --workspace "/path/to/project" --prompt "your prompt"

# セッション一覧
node cli.js list-sessions --project-id "CLAUDE_CODE:..."

# ログ表示
node cli.js show-logs --session-id "CLAUDE_CODE:...:uuid"
```

## API使用例

### ExecutionService

```javascript
import { ExecutionService } from '../../backend/services/src/execution/index.js';

const executor = new ExecutionService();

// 新しいチャットを開始
const result = await executor.startNewChat({
  profileLabel: 'claude-code',
  variantLabel: null, // または 'plan'
  executorType: 'CLAUDE_CODE',
  projectId: 'CLAUDE_CODE:base64encodedpath',
  actualProjectId: 'base64encodedpath',
  workspacePath: '/path/to/workspace',
  prompt: 'Create a new feature'
});

console.log('Session ID:', result.sessionId);
console.log('Process ID:', result.processId);
```

### LogSourceFactory

```javascript
import { LogSourceFactory } from '../../backend/services/src/logs/logSourceFactory.js';

const factory = new LogSourceFactory();

// すべてのプロジェクトを取得
const projects = await factory.getAllProjects();

// セッション一覧を取得
const sessions = await factory.getSessionsForProject('CLAUDE_CODE:...');

// ログストリームを取得
const stream = await factory.getSessionStream('CLAUDE_CODE:...:uuid');
stream.on('data', (chunk) => {
  console.log(chunk.toString());
});
```

## 環境変数

エージェント実行に必要なAPIキーを設定してください：

```bash
# .env ファイルを作成
export ANTHROPIC_API_KEY=your_api_key_here
export GOOGLE_AI_API_KEY=your_api_key_here
```

## ユースケース

1. **CLIツール**: コマンドラインからエージェントを実行
2. **バッチ処理**: 定期的なタスクの自動実行
3. **CI/CDパイプライン**: GitHub ActionsなどでのAIレビュー
4. **既存アプリへの組み込み**: Node.jsアプリ内で直接呼び出し
5. **スクリプト自動化**: 繰り返し作業の自動化

## 注意事項

- APIサーバーは不要です
- ログファイルはローカルのファイルシステムから直接読み取ります
- エージェントのプロセスはこのNode.jsプロセスの子プロセスとして起動します
- 実行中のプロセスは `Ctrl+C` で中断できます

## 他のアプリへの組み込み例

```javascript
// Express アプリでの使用
import express from 'express';
import { ExecutionService } from '../../backend/services/src/execution/index.js';

const app = express();
const executor = new ExecutionService();

app.post('/api/execute', async (req, res) => {
  const { workspace, prompt } = req.body;
  
  const result = await executor.startNewChat({
    profileLabel: 'claude-code',
    executorType: 'CLAUDE_CODE',
    projectId: 'CLAUDE_CODE:' + Buffer.from(workspace).toString('base64url'),
    actualProjectId: Buffer.from(workspace).toString('base64url'),
    workspacePath: workspace,
    prompt
  });
  
  res.json(result);
});

app.listen(3000);
```

## トラブルシューティング

### エラー: `Profile config not found`
- プロファイルラベルが正しいか確認してください
- 対応プロファイル: `claude-code`, `cursor`, `gemini`, `codex`, `opencode`

### エラー: `Workspace path does not exist`
- ワークスペースパスが存在するか確認してください
- 絶対パスを使用してください

### ログが表示されない
- セッションIDが正しいか確認してください
- ログファイルが生成されるまで数秒かかる場合があります
