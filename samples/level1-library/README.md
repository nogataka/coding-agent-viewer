# レベル1: ライブラリとして直接利用

このサンプルは、Execution ModuleとLog Moduleを直接利用する最もシンプルな形態です。

**3種類のCLI**を提供し、さまざまな用途に対応：
- 🎨 **Ink版** - ccresume-codex風の枠付きリッチUI
- 💬 **Simple版** - 初心者向けインタラクティブメニュー
- ⚡ **Command版** - スクリプト・自動化向けコマンドライン

## 概要

- **利用モジュール**: `@nogataka/coding-agent-viewer-sdk` (npm package)
- **HTTP不要**: APIサーバーなし
- **3つのCLI**: Ink版、Simple版、Command版
- **用途**: CLIツール、バッチ処理、CI/CD、他アプリへの組み込み

## ディレクトリ構造

```
level1-library/
├── README.md
├── package.json
├── cli.js                    # ⚡ Command版CLI（Commander.js）
├── simple-cli.js             # 💬 Simple版CLI（Inquirer）
├── ink-cli.tsx               # 🎨 Ink版CLI（React TUI）
└── src/
    ├── execute-agent.js      # エージェント実行の例
    ├── list-projects.js      # プロジェクト一覧の例
    ├── list-sessions.js      # セッション一覧の例
    └── stream-logs.js        # ログストリーミングの例
```

## インストール

npmパッケージ`@nogataka/coding-agent-viewer-sdk`を使用するため、バックエンドのビルドは不要です：

```bash
cd samples/level1-library
npm install
```

> **Note**: このサンプルは公開されたnpmパッケージ `@nogataka/coding-agent-viewer-sdk@latest` を使用します。

## 使用方法

レベル1では**3種類のCLI**を提供しています。用途に応じて選択してください：

| CLI | ファイル | 用途 | スタイル |
|-----|---------|------|----------|
| 🎨 **Ink版** | `ink-cli.tsx` | 視覚的に美しいUI | リッチTUI（枠付き） |
| 💬 **Simple版** | `simple-cli.js` | 対話型操作 | インタラクティブ |
| ⚡ **Command版** | `cli.js` | スクリプト・自動化 | コマンドライン |

---

### 🎨 Ink版CLI（リッチUI - 推奨！）

**特徴**: ccresume-codexと同様の**枠で囲まれた美しいTUI**（Terminal UI）

```bash
npm run ink

# または
npx tsx ink-cli.tsx
```

**機能**:
- 🎯 ボックスレイアウトで整理された画面
- 📂 プロファイル → プロジェクト → セッション → ログの階層ナビゲーション
- 🎨 カラフルなシンタックスハイライト
- 📋 セッション詳細表示
- 📜 リアルタイムログストリーミング
- ⌨️  Vimライクなキーバインディング（j/k）

**操作方法**:
- `↑/↓` または `j/k`: 項目を上下に移動
- `Enter`: 選択・決定・次へ
- `ESC` または `b`: 前の画面に戻る
- `q` または `Ctrl+C`: 終了

**向いている人**: 
- ビジュアルなUIが好きな人
- セッションを頻繁にブラウズする人
- ccresume-codexのようなツールが好きな人

**画面イメージ**:
```
┌─────────────────────────────────────┐
│ 🤖 Coding Agent Viewer CLI         │
│ Select Agent Profile                │
├─────────────────────────────────────┤
│ Agent Profiles:                     │
│ ▶ 🎨 CLAUDE_CODE (5 projects)      │
│   🖱️ CURSOR (3 projects)            │
│   💎 GEMINI (2 projects)            │
└─────────────────────────────────────┘
↑/↓: Navigate | ENTER: Select | Q: Quit
```

---

### 💬 Simple版CLI（インタラクティブ - 初心者向け）

**特徴**: inquirerベースの**対話型メニュー選択式CLI**

```bash
npm run simple

# または
node simple-cli.js
```

**機能**:
- 📂 プロジェクトブラウザ（プロファイル別グループ化）
- 📋 セッション一覧と詳細表示
- 🚀 新規セッション開始
- 📜 リアルタイムログストリーミング
- 💬 フォローアップメッセージ送信
- ⏹️  実行中セッションの停止

**操作方法**:
- 矢印キー（↑/↓）で項目を選択
- `Enter`で決定
- すべてインタラクティブ（引数不要）
- 質問に答えていくだけで操作完了

**向いている人**: 
- CLIに慣れていない初心者
- 引数やオプションを覚えたくない人
- ステップバイステップで操作したい人

**使用例**:
```bash
$ npm run simple

🤖 Coding Agent Viewer CLI

? 何を行いますか？ 
  📂 プロジェクトをブラウズ
❯ 🚀 新しいエージェントセッションを開始
  ↩️ 終了
```

---

### ⚡ Command版CLI（コマンドライン - 自動化向け）

**特徴**: Commander.jsベースの**サブコマンド式CLI**（従来型）

```bash
npm start -- <command> [options]

# または
node cli.js <command> [options]
```

**機能**:
- 📋 プロジェクト一覧表示（フィルタ・フォーマット指定可）
- 📂 セッション一覧表示
- 🚀 エージェント実行
- 📜 ログストリーミング
- 🔧 豊富なオプションとフラグ

**操作方法**:
- サブコマンド + オプション形式
- 非インタラクティブ（引数で全て指定）
- シェルスクリプトや自動化に最適

**向いている人**: 
- スクリプトで自動化したい人
- CI/CDパイプラインに組み込みたい人
- ワンライナーで実行したい人
- コマンドライン上級者

**使用例**:

#### 1. プロジェクト一覧を表示

```bash
# 基本
npm start -- list-projects

# プロファイルでフィルタ
npm start -- list-projects --profile claude-code

# JSON形式で出力
npm start -- list-projects --format json
```

#### 2. セッション一覧を表示

```bash
# 基本
npm start -- list-sessions CLAUDE_CODE:L1VzZXJz...

# 最新10件のみ表示
npm start -- list-sessions CLAUDE_CODE:L1VzZXJz... --limit 10

# JSON形式で出力
npm start -- list-sessions CLAUDE_CODE:L1VzZXJz... --format json
```

#### 3. エージェントを実行

```bash
# 基本（Claude Code）
npm start -- execute \
  --workspace /path/to/project \
  --prompt "Create a README file"

# 別のプロファイルを使用
npm start -- execute \
  --workspace /path/to/project \
  --prompt "Refactor main.js" \
  --profile cursor

# バリアント指定
npm start -- execute \
  --workspace /path/to/project \
  --prompt "Plan the architecture" \
  --profile claude-code \
  --variant plan
```

#### 4. ログをストリーミング表示

```bash
# 基本（pretty形式）
npm start -- show-logs CLAUDE_CODE:L1VzZXJz...:uuid

# シンプル形式
npm start -- show-logs CLAUDE_CODE:L1VzZXJz...:uuid --format simple

# 生のSSEイベントを表示
npm start -- show-logs CLAUDE_CODE:L1VzZXJz...:uuid --raw
```

#### ヘルプとオプション

```bash
# 全コマンド一覧
npm start -- --help

# 特定のコマンドのヘルプ
npm start -- execute --help
npm start -- list-projects --help
```

**自動化例（シェルスクリプト）**:
```bash
#!/bin/bash
# 自動実行スクリプトの例

PROJECT_ID="CLAUDE_CODE:L1VzZXJz..."

# プロジェクト一覧を取得
node cli.js list-projects --format json > projects.json

# エージェントを実行
node cli.js execute \
  --workspace "/path/to/project" \
  --prompt "Run tests and fix any failing tests" \
  --profile claude-code

# ログをファイルに保存
node cli.js show-logs "$SESSION_ID" > session.log
```

---

## 📊 3種類のCLIの比較

| 特徴 | 🎨 Ink版 | 💬 Simple版 | ⚡ Command版 |
|------|---------|------------|-------------|
| **UI** | 枠付きTUI | メニュー選択 | コマンドライン |
| **操作性** | ビジュアル | 対話型 | 非対話型 |
| **学習コスト** | 低い | 低い | 中程度 |
| **自動化** | 不可 | 不可 | 可能 |
| **スクリプト化** | ❌ | ❌ | ✅ |
| **CI/CD** | ❌ | ❌ | ✅ |
| **初心者向け** | ✅✅✅ | ✅✅✅ | ⭐⭐ |
| **上級者向け** | ⭐⭐ | ⭐ | ✅✅✅ |
| **見た目** | 最高 | 良い | シンプル |

**おすすめの選び方**:
- 🎨 **Ink版**: セッションを視覚的に探索・ブラウズしたい → `npm run ink`
- 💬 **Simple版**: 初めて使う、操作方法を覚えたくない → `npm run simple`
- ⚡ **Command版**: スクリプトで自動化、CI/CDに組み込む → `npm start -- <command>`

---

## API使用例

SDKとしてライブラリを直接利用する方法：

### ExecutionService

```javascript
import { ExecutionService } from '@nogataka/coding-agent-viewer-sdk/services/execution';

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
import { LogSourceFactory } from '@nogataka/coding-agent-viewer-sdk/services/logs';

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
