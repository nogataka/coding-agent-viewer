# モジュール化戦略

## 概要

本プロジェクトは、フロントエンドとバックエンドを含む完全なモジュール化戦略を採用します。ユーザーは必要に応じて、フルスタック、バックエンドのみ、またはコアライブラリのみを選択して利用できます。

## 設計思想

### プログレッシブ・エンハンスメント

```
レベル3: フルスタック
├─ Frontend Module (UI)
└─ API Module (HTTP)
    ├─ Execution Module (Core)
    └─ Log Module (Core)

レベル2: バックエンドのみ
└─ API Module
    ├─ Execution Module
    └─ Log Module

レベル1: ライブラリのみ
├─ Execution Module
└─ Log Module
```

ユーザーは自身のニーズに応じて、段階的に深くコミットできます。

## パッケージ構成

### 推奨構成

```
@coding-agent-viewer/
├── execution-module        # v1.0.0 - 完全独立
├── log-module             # v1.0.0 - execution に依存
├── api-module             # v1.0.0 - execution + log に依存
├── frontend               # v1.0.0 - API or direct に対応
└── full-stack             # v1.0.0 - 全部入りメタパッケージ
```

### 依存関係グラフ

```
full-stack (メタパッケージ)
  ├─→ frontend
  │     └─→ api-module (optional)
  └─→ api-module
        ├─→ execution-module
        └─→ log-module
              └─→ execution-module (activeExecutionRegistry のみ)
```

## 利用パターン

### パターンA: フルスタック利用

**対象ユーザー**: 評価・デモ、すぐに使いたい、公式UIを使いたい

**インストール**:
```bash
npm install -g @coding-agent-viewer/full-stack
```

**使用方法**:
```bash
coding-agent-viewer start
# → Frontend (port 3000) + API (port 3001) 起動
# → ブラウザで http://localhost:3000 を開く
```

**内部動作**:
```typescript
// @coding-agent-viewer/full-stack の CLI
import { startServer } from '@coding-agent-viewer/api-module';
import { serveFrontend } from '@coding-agent-viewer/frontend';

await startServer({ port: 3001 });
await serveFrontend({ port: 3000 });
```

**ユースケース**:
- 5分で動作デモ
- 社内向け展開
- ローカル開発環境
- プレゼンテーション

**デプロイ先**:
- Docker Container
- AWS EC2/ECS
- Heroku
- Railway

---

### パターンB: バックエンドのみ（API）

**対象ユーザー**: カスタムフロントエンドを構築、モバイルアプリ、API統合

**インストール**:
```bash
npm install @coding-agent-viewer/api-module
```

**使用方法**:
```typescript
import { startServer } from '@coding-agent-viewer/api-module';

await startServer({ 
  port: 3001,
  cors: { origin: 'https://my-custom-frontend.com' },
  // 他の設定...
});
```

**ユースケース**:
- React Native アプリのバックエンド
- カスタムWebフロントエンド
- マイクロサービスの一部
- API Gateway配下での動作

**デプロイ先**:
- AWS Lambda + API Gateway
- Google Cloud Run
- Vercel Serverless Functions
- Kubernetes Pod

---

### パターンC: ライブラリとして直接利用

**対象ユーザー**: 既存アプリへの組み込み、カスタムワークフロー、完全な制御

**インストール**:
```bash
npm install @coding-agent-viewer/execution-module
npm install @coding-agent-viewer/log-module
```

**使用方法**:

#### 例1: Next.js App Router での利用

```typescript
// app/api/agent/execute/route.ts
import { ExecutionService } from '@coding-agent-viewer/execution-module';

export async function POST(req: Request) {
  const { prompt, projectId } = await req.json();
  
  const executor = new ExecutionService();
  const result = await executor.startNewChat({
    profileLabel: 'claude-code',
    executorType: 'CLAUDE_CODE',
    projectId,
    actualProjectId: projectId.split(':')[1],
    workspacePath: '/path/to/workspace',
    prompt
  });
  
  return Response.json(result);
}
```

```typescript
// app/dashboard/page.tsx
import { LogViewer } from '@coding-agent-viewer/frontend/components';

export default function Dashboard() {
  return (
    <div>
      <h1>My Custom Dashboard</h1>
      <LogViewer apiUrl="/api/agent" />
    </div>
  );
}
```

#### 例2: Electron アプリでの利用

```typescript
// main.js (Node.js メインプロセス)
import { app, BrowserWindow, ipcMain } from 'electron';
import { ExecutionService } from '@coding-agent-viewer/execution-module';
import { LogSourceFactory } from '@coding-agent-viewer/log-module';

const executor = new ExecutionService();
const logs = new LogSourceFactory();

ipcMain.handle('start-execution', async (event, { prompt, projectId }) => {
  return await executor.startNewChat({
    profileLabel: 'claude-code',
    executorType: 'CLAUDE_CODE',
    projectId,
    actualProjectId: projectId.split(':')[1],
    workspacePath: '/path/to/workspace',
    prompt
  });
});

ipcMain.handle('get-projects', async () => {
  return await logs.getAllProjects();
});

ipcMain.handle('get-sessions', async (event, projectId) => {
  return await logs.getSessionsForProject(projectId);
});
```

```typescript
// renderer.js (レンダラープロセス)
import { createApp } from '@coding-agent-viewer/frontend';

const app = createApp({
  type: 'custom',
  adapter: {
    startExecution: (prompt, projectId) => 
      ipcRenderer.invoke('start-execution', { prompt, projectId }),
    
    getProjects: () => 
      ipcRenderer.invoke('get-projects'),
    
    getSessions: (projectId) => 
      ipcRenderer.invoke('get-sessions', projectId),
    
    // その他のメソッド...
  }
});
```

#### 例3: CLIツールでの利用

```typescript
#!/usr/bin/env node
import { ExecutionService } from '@coding-agent-viewer/execution-module';
import { LogSourceFactory } from '@coding-agent-viewer/log-module';
import { program } from 'commander';

program
  .command('execute')
  .option('-p, --prompt <prompt>', 'Prompt for the agent')
  .option('-w, --workspace <path>', 'Workspace path')
  .action(async (options) => {
    const executor = new ExecutionService();
    
    const result = await executor.startNewChat({
      profileLabel: 'claude-code',
      executorType: 'CLAUDE_CODE',
      projectId: 'CLAUDE_CODE:' + Buffer.from(options.workspace).toString('base64url'),
      actualProjectId: Buffer.from(options.workspace).toString('base64url'),
      workspacePath: options.workspace,
      prompt: options.prompt
    });
    
    console.log('Execution started:', result.sessionId);
  });

program
  .command('list-projects')
  .action(async () => {
    const logs = new LogSourceFactory();
    const projects = await logs.getAllProjects();
    console.table(projects);
  });

program.parse();
```

**ユースケース**:
- VSCode拡張機能
- Tauri/Wails デスクトップアプリ
- 社内ツールへの統合
- CI/CDパイプラインでの自動化
- バッチ処理スクリプト

**環境**:
- Node.js アプリケーション
- Electron
- Tauri
- Deno/Bun（将来対応）

---

## フロントエンドモジュールの設計

### 配布形式

```json
// @coding-agent-viewer/frontend package.json
{
  "name": "@coding-agent-viewer/frontend",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.esm.js",
  "browser": "./dist/browser.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./standalone": {
      "import": "./dist/standalone.esm.js",
      "require": "./dist/standalone.js"
    },
    "./components": {
      "import": "./dist/components.esm.js",
      "require": "./dist/components.js",
      "types": "./dist/components.d.ts"
    },
    "./web-components": {
      "import": "./dist/wc.esm.js",
      "require": "./dist/wc.js"
    }
  },
  "files": [
    "dist"
  ]
}
```

### 利用形式

#### 1. スタンドアロンアプリとして

```typescript
import { createApp } from '@coding-agent-viewer/frontend/standalone';

const app = createApp({
  apiUrl: 'http://localhost:3001'
});

app.mount('#app');
```

#### 2. React Component Library として

```typescript
import { 
  AgentExecutor, 
  LogViewer, 
  ProjectList,
  TaskList 
} from '@coding-agent-viewer/frontend/components';

export default function MyPage() {
  return (
    <div className="my-app">
      <ProjectList apiUrl="http://localhost:3001" />
      <AgentExecutor 
        projectId="CLAUDE_CODE:..."
        onExecutionStart={(result) => console.log(result)}
      />
      <LogViewer sessionId="CLAUDE_CODE:...:uuid" />
    </div>
  );
}
```

#### 3. Web Components として

```html
<!-- 他のフレームワーク（Vue, Angular等）でも使用可能 -->
<script type="module">
  import '@coding-agent-viewer/frontend/web-components';
</script>

<coding-agent-viewer
  api-url="http://localhost:3001"
  theme="dark"
></coding-agent-viewer>

<coding-agent-log-viewer
  session-id="CLAUDE_CODE:...:uuid"
  api-url="http://localhost:3001"
></coding-agent-log-viewer>
```

### API接続の柔軟性

```typescript
export type ApiAdapter = 
  | { type: 'http'; baseUrl: string; }
  | { type: 'direct'; modules: { execution: ExecutionService; log: LogSourceFactory; } }
  | { type: 'custom'; adapter: CustomApiAdapter; };

export function createApp(config: {
  api: ApiAdapter;
  theme?: 'light' | 'dark';
  // その他の設定...
}) {
  // ...
}
```

**使用例**:

```typescript
// 1. HTTP経由（通常のWeb利用）
createApp({ 
  api: { 
    type: 'http', 
    baseUrl: 'http://localhost:3001' 
  }
});

// 2. 直接呼び出し（Electron等）
import { ExecutionService } from '@coding-agent-viewer/execution-module';
import { LogSourceFactory } from '@coding-agent-viewer/log-module';

createApp({ 
  api: { 
    type: 'direct', 
    modules: { 
      execution: new ExecutionService(),
      log: new LogSourceFactory()
    }
  }
});

// 3. カスタムアダプター
createApp({
  api: {
    type: 'custom',
    adapter: {
      startExecution: async (params) => {
        // カスタムロジック（例: GraphQL経由）
        return await myGraphQLClient.mutate(...);
      },
      getProjects: async () => {
        // カスタムロジック
        return await myGraphQLClient.query(...);
      },
      // その他のメソッド...
    }
  }
});
```

## デプロイメント戦略

### マイクロサービス構成

```yaml
# docker-compose.yml
version: '3.8'

services:
  # フロントエンド
  frontend:
    image: coding-agent-viewer/frontend:latest
    ports:
      - "3000:80"
    environment:
      - API_URL=http://api-gateway:3001
  
  # API Gateway / Load Balancer
  api-gateway:
    image: nginx:alpine
    ports:
      - "3001:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - api-claude
      - api-gemini
  
  # Claude Code専用APIサーバー
  api-claude:
    image: coding-agent-viewer/api:latest
    environment:
      - PROFILES=claude-code,cursor
      - PORT=3001
    volumes:
      - ~/.claude:/root/.claude
      - ~/.cursor:/root/.cursor
  
  # Gemini専用APIサーバー
  api-gemini:
    image: coding-agent-viewer/api:latest
    environment:
      - PROFILES=gemini,codex
      - PORT=3001
    volumes:
      - ~/.gemini:/root/.gemini
```

### サーバーレス構成

```typescript
// Vercel Serverless Function
// api/execute.ts
import { ExecutionService } from '@coding-agent-viewer/execution-module';

export default async function handler(req, res) {
  const { prompt, projectId } = req.body;
  
  const executor = new ExecutionService();
  const result = await executor.startNewChat({
    profileLabel: 'claude-code',
    executorType: 'CLAUDE_CODE',
    projectId,
    actualProjectId: projectId.split(':')[1],
    workspacePath: '/tmp/workspace', // 一時ディレクトリ
    prompt
  });
  
  res.json(result);
}
```

### スタンドアロンバイナリ

```bash
# pkg または nexe を使用してバイナリ化
npm install -g pkg

# ビルド
pkg --targets node18-macos-x64,node18-linux-x64,node18-win-x64 \
    --output dist/coding-agent-viewer \
    index.js
```

## 具体的な利用シーン

### シーン1: 評価・デモ（最重要）

```bash
# 5秒でフルスタック起動
npx @coding-agent-viewer/full-stack start

# 自動的にブラウザが開く
# http://localhost:3000
```

**目的**: 
- 最初の印象を最高にする
- 導入障壁を最小化
- すぐに動作を確認できる

---

### シーン2: カスタムフロントエンド開発

```bash
# バックエンドAPIのみ起動
npm install @coding-agent-viewer/api-module
```

```typescript
import { startServer } from '@coding-agent-viewer/api-module';

await startServer({ 
  port: 3001,
  cors: { 
    origin: ['http://localhost:5173', 'https://my-app.com']
  }
});
```

```bash
# 独自のReact/Vue/Svelteフロントエンドを開発
# API: http://localhost:3001 を使用
```

---

### シーン3: エンタープライズ統合

```typescript
// 社内の既存Next.jsアプリに統合
import { ExecutionService } from '@coding-agent-viewer/execution-module';
import { LogSourceFactory } from '@coding-agent-viewer/log-module';

// 社内認証システムと統合
import { verifyToken } from '@company/auth';

export async function POST(req: Request) {
  const token = req.headers.get('Authorization');
  const user = await verifyToken(token);
  
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // ユーザーごとにワークスペースを分離
  const workspacePath = `/workspaces/${user.id}`;
  
  const executor = new ExecutionService();
  const result = await executor.startNewChat({
    // ... 社内ポリシーに従った設定
  });
  
  // 監査ログに記録
  await auditLog.create({
    userId: user.id,
    action: 'agent_execution',
    sessionId: result.sessionId
  });
  
  return Response.json(result);
}
```

---

### シーン4: CI/CDパイプライン

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Agent Modules
        run: |
          npm install @coding-agent-viewer/execution-module
          npm install @coding-agent-viewer/log-module
      
      - name: Run AI Review
        run: node scripts/ai-review.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
```

```javascript
// scripts/ai-review.js
import { ExecutionService } from '@coding-agent-viewer/execution-module';
import { execSync } from 'child_process';

const executor = new ExecutionService();

// PRの差分を取得
const diff = execSync('git diff origin/main...HEAD').toString();

// AIレビューを実行
const result = await executor.startNewChat({
  profileLabel: 'claude-code',
  executorType: 'CLAUDE_CODE',
  projectId: 'CLAUDE_CODE:' + Buffer.from(process.cwd()).toString('base64url'),
  actualProjectId: Buffer.from(process.cwd()).toString('base64url'),
  workspacePath: process.cwd(),
  prompt: `以下のコード変更をレビューしてください:\n\n${diff}`
});

console.log('Review started:', result.sessionId);
```

---

### シーン5: VSCode拡張機能

```typescript
// extension.ts
import * as vscode from 'vscode';
import { ExecutionService } from '@coding-agent-viewer/execution-module';
import { LogSourceFactory } from '@coding-agent-viewer/log-module';

export function activate(context: vscode.ExtensionContext) {
  const executor = new ExecutionService();
  const logs = new LogSourceFactory();
  
  // コマンド: エージェント実行
  let disposable = vscode.commands.registerCommand(
    'coding-agent-viewer.execute',
    async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Enter your instruction for the AI agent'
      });
      
      if (!prompt) return;
      
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;
      
      const result = await executor.startNewChat({
        profileLabel: 'claude-code',
        executorType: 'CLAUDE_CODE',
        projectId: 'CLAUDE_CODE:' + Buffer.from(workspaceFolder.uri.fsPath).toString('base64url'),
        actualProjectId: Buffer.from(workspaceFolder.uri.fsPath).toString('base64url'),
        workspacePath: workspaceFolder.uri.fsPath,
        prompt
      });
      
      vscode.window.showInformationMessage(
        `Execution started: ${result.sessionId}`
      );
      
      // WebViewでログを表示
      showLogView(result.sessionId);
    }
  );
  
  context.subscriptions.push(disposable);
}

function showLogView(sessionId: string) {
  // WebViewでログをリアルタイム表示
  // @coding-agent-viewer/frontend/components を使用
}
```

---

## エコシステムの形成

### コミュニティ拡張の例

```
@coding-agent-viewer/
├── execution-module          # 公式
├── log-module               # 公式
├── api-module               # 公式
├── frontend                 # 公式
│
└── コミュニティ拡張:
    ├── @community/mobile-app
    │   └── React Native アプリ
    │
    ├── @community/vscode-extension
    │   └── VSCode拡張機能
    │
    ├── @community/graphql-api
    │   └── GraphQL版API
    │
    ├── @community/tauri-app
    │   └── Tauri デスクトップアプリ
    │
    ├── @community/custom-profiles
    │   └── 追加のエージェントプロファイル
    │
    └── @enterprise/auth-plugin
        └── エンタープライズ認証統合
```

## パフォーマンス考慮事項

### フロントエンドのビルドサイズ最適化

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-components': ['./src/components'],
          'log-viewer': ['./src/components/logs']
        }
      }
    }
  }
});
```

### Tree-shaking対応

```typescript
// 各コンポーネントを個別にインポート可能に
import { LogViewer } from '@coding-agent-viewer/frontend/components/LogViewer';
// 全体をインポートしない
// import * from '@coding-agent-viewer/frontend/components'; ❌
```

## バージョニング戦略

### Semantic Versioning

```
execution-module: v1.2.3
log-module:       v1.2.1  (execution ^1.2.0 に依存)
api-module:       v1.3.0  (execution ^1.2.0, log ^1.2.0 に依存)
frontend:         v1.4.0  (api-module は optional)
full-stack:       v1.4.0  (すべてに依存)
```

### 互換性マトリクス

| full-stack | frontend | api-module | execution | log |
|-----------|----------|------------|-----------|-----|
| 1.0.0 | 1.0.0 | 1.0.0 | 1.0.0 | 1.0.0 |
| 1.1.0 | 1.1.0 | 1.0.x | 1.0.x | 1.0.x |
| 1.2.0 | 1.2.0 | 1.1.0 | 1.1.0 | 1.0.x |

### 破壊的変更の管理

```typescript
// v1.x → v2.x への移行
// execution-module v2.0.0

// BREAKING CHANGE: startNewChat の引数形式が変更
// Before (v1.x):
await executor.startNewChat({
  profileLabel: 'claude-code',
  executorType: 'CLAUDE_CODE',
  // ...
});

// After (v2.x):
await executor.startNewChat({
  profile: { label: 'claude-code', type: 'CLAUDE_CODE' },
  // ...
});
```

マイグレーションガイドを提供する。

## 他の有名OSSとの比較

### Strapi（CMS）

```
✅ 類似パターン
- @strapi/strapi         → コアエンジン
- @strapi/admin          → 管理画面（フロントエンド）
- @strapi/plugin-*       → 拡張機能
```

### Grafana（可視化プラットフォーム）

```
✅ 類似パターン
- grafana                → フルスタック
- grafana-toolkit        → 開発ツール
- 各種データソースプラグイン → 独立パッケージ
```

### Supabase（Backend as a Service）

```
✅ 類似パターン
- @supabase/supabase-js  → クライアントライブラリ
- supabase CLI           → フルスタック管理
- Docker Compose         → ローカルフルスタック
```

**本プロジェクトの設計は業界標準に沿っています。**

## ドキュメント戦略

### 各パッケージのREADME

```
@coding-agent-viewer/execution-module/
├── README.md
│   ├── Installation
│   ├── Quick Start
│   ├── API Reference
│   ├── Examples
│   └── Advanced Usage
│
@coding-agent-viewer/log-module/
├── README.md
│   ├── Installation
│   ├── Quick Start
│   ├── API Reference
│   ├── Custom Log Sources
│   └── Examples
│
@coding-agent-viewer/api-module/
├── README.md
│   ├── Installation
│   ├── Quick Start
│   ├── API Endpoints
│   ├── Configuration
│   └── Deployment
│
@coding-agent-viewer/frontend/
├── README.md
│   ├── Installation
│   ├── Standalone Usage
│   ├── Component Library
│   ├── Web Components
│   └── Theming
│
@coding-agent-viewer/full-stack/
└── README.md
    ├── Quick Start (最優先)
    ├── Configuration
    ├── Docker Deployment
    └── Links to other packages
```

### サンプルリポジトリ

```
examples/
├── 01-full-stack/          # フルスタック起動
├── 02-api-only/            # APIのみ
├── 03-nextjs-integration/  # Next.js統合
├── 04-electron-app/        # Electronアプリ
├── 05-cli-tool/            # CLIツール
├── 06-vscode-extension/    # VSCode拡張
└── 07-ci-cd-pipeline/      # CI/CD統合
```

## 実装チェックリスト

### Phase 1: コアモジュール

- [ ] execution-module
  - [ ] package.json 作成
  - [ ] エントリーポイント整備
  - [ ] TypeScript型定義エクスポート
  - [ ] README作成
  - [ ] npm publish

- [ ] log-module
  - [ ] 依存性注入対応（logger, activeExecutionRegistry）
  - [ ] package.json 作成
  - [ ] エントリーポイント整備
  - [ ] TypeScript型定義エクスポート
  - [ ] README作成
  - [ ] npm publish

### Phase 2: APIモジュール

- [ ] api-module
  - [ ] コアモジュールをpeer dependencyに
  - [ ] startServer() 関数のエクスポート
  - [ ] 設定オプションの整理
  - [ ] package.json 作成
  - [ ] README作成
  - [ ] npm publish

### Phase 3: フロントエンドモジュール

- [ ] frontend
  - [ ] スタンドアロン版ビルド
  - [ ] Component Library ビルド
  - [ ] Web Components ビルド
  - [ ] API Adapter実装
  - [ ] package.json 作成（複数エントリーポイント）
  - [ ] README作成
  - [ ] npm publish

### Phase 4: メタパッケージ

- [ ] full-stack
  - [ ] CLI実装
  - [ ] 全依存関係の定義
  - [ ] Docker イメージ作成
  - [ ] package.json 作成
  - [ ] README作成（Getting Started重視）
  - [ ] npm publish

### Phase 5: ドキュメント・サンプル

- [ ] 公式ドキュメントサイト
- [ ] サンプルリポジトリ（7パターン）
- [ ] マイグレーションガイド
- [ ] API リファレンス
- [ ] ビデオチュートリアル

## まとめ

### この設計の利点

✅ **柔軟性**: 3つの利用パターンに対応  
✅ **段階的導入**: 必要に応じて拡張可能  
✅ **エコシステム**: コミュニティ拡張が容易  
✅ **業界標準**: 成功事例と同じパターン  
✅ **保守性**: 各モジュールの責務が明確  
✅ **拡張性**: 新機能の追加が容易  
✅ **デプロイ多様性**: あらゆる環境に対応  

### 成功の鍵

1. **優れたドキュメント**: 各利用パターンを明確に説明
2. **豊富なサンプル**: すぐに始められる実例
3. **段階的リリース**: コアから順に安定化
4. **コミュニティ育成**: 拡張機能の開発を促進
5. **互換性維持**: semverの厳格な遵守

### 次のステップ

1. execution-module の切り出しとnpm publish
2. log-module の切り出しとnpm publish
3. api-module の作成とnpm publish
4. frontend の分割ビルド設定
5. full-stack メタパッケージの作成
6. ドキュメントサイトの構築
7. サンプルリポジトリの作成

---

**この設計で自信を持って進めてください！** 🚀
