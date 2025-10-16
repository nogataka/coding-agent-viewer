# Coding Agent Viewer

**マルチAIコーディングエージェント管理SDK**

Coding Agent Viewerは、Claude Code、Cursor、Gemini、Codexなどの複数のAIコーディングエージェントを統合管理するための**SDKとツールセット**です。

## 🎯 主な特徴

### 📦 SDK提供が中心

このプロジェクトの**最大の特徴は、npmパッケージとしてSDKを提供**していることです：

```bash
npm install @nogataka/coding-agent-viewer-sdk
```

3つのコアモジュールをライブラリとして利用可能：
- **🔧 Execution Module** - AIエージェントの実行管理
- **📜 Log Module** - セッションログの収集・正規化
- **🌐 API Module** - REST API + SSE (Server-Sent Events)

### 🎨 完成されたアプリケーションも提供

SDK以外に、すぐに使えるフルスタックアプリケーションも提供：

```bash
npx @nogataka/coding-agent-viewer
```

- 美しいWeb UI（React + Vite）
- リアルタイムログストリーミング
- マルチエージェント対応
- プロジェクト・セッション管理

---

## 🚀 4つの利用レベル

Coding Agent Viewerは、ニーズに応じて**4つのレベル**で利用できます：

| レベル | 説明 | 用途 | 難易度 |
|--------|------|------|--------|
| **Level 1: Library** | SDKを直接インポート | CLIツール、バッチ処理、組み込み | ⭐⭐ |
| **Level 2: API** | RESTful API + SSE | カスタムフロント、マイクロサービス | ⭐⭐⭐ |
| **Level 3: Full-stack** | 完成されたWebアプリ | そのまま利用、カスタマイズ | ⭐ |
| **Level 4: Custom Web Chat** | WebチャットUIサンプル | 既存SaaSへの組み込み・PoC | ⭐⭐⭐ |

詳細は [`samples/`](./samples/) ディレクトリを参照してください。

---

## 📚 クイックスタート

### Level 1: ライブラリとして使用（SDK）

SDKを直接利用してCLIツールやアプリケーションに組み込み：

```bash
# インストール
npm install @nogataka/coding-agent-viewer-sdk
```

```javascript
// 使用例
import { ExecutionService } from '@nogataka/coding-agent-viewer-sdk/services/execution';
import { LogSourceFactory } from '@nogataka/coding-agent-viewer-sdk/services/logs';

const executor = new ExecutionService();
const logFactory = new LogSourceFactory();

// プロジェクト一覧を取得（引数なしで全プロファイル、フィルタ指定も可能）
const projects = await logFactory.getAllProjects('CLAUDE_CODE');

// const projects = await logFactory.getAllProjects(); // ← 全エージェントの結果を取得したい場合はこちら

// エージェントを実行
const result = await executor.startNewChat({
  profileLabel: 'claude-code',
  workspacePath: '/path/to/project',
  prompt: 'Create a README file'
});
```

**サンプル**: [`samples/level1-library/`](./samples/level1-library/)
- 🎨 Ink版CLI（枠付きTUI）
- 💬 Simple版CLI（インタラクティブ）
- ⚡ Command版CLI（自動化向け）

---

### Level 2: APIサーバーとして使用

REST API + SSEを提供するバックエンドサーバー：

```bash
# インストール
npm install @nogataka/coding-agent-viewer-sdk
```

```javascript
// サーバー起動
import express from 'express';
import { setupRoutes } from '@nogataka/coding-agent-viewer-sdk/server/routes';

const app = express();
setupRoutes(app);
app.listen(3001);
```

**エンドポイント例**:
- `GET /api/projects` - プロジェクト一覧
- `GET /api/tasks?project_id=<id>` - セッション一覧
- `POST /api/task-attempts` - エージェント実行
- `GET /api/execution-processes/:id/normalized-logs` - ログストリーミング (SSE)

**サンプル**: [`samples/level2-api/`](./samples/level2-api/)

---

### Level 3: フルスタックアプリとして使用

完成されたWebアプリケーションをそのまま利用：

```bash
# npx経由で即起動
npx @nogataka/coding-agent-viewer

# または、ローカルで起動
git clone https://github.com/your-org/coding-agent-viewer
cd coding-agent-viewer
npm run install:all
npm run dev
```

**含まれるもの**:
- React製の美しいWeb UI
- リアルタイムログビューア
- プロジェクト・セッション管理
- 複数エージェントのサポート

**サンプル**: [`samples/level3-fullstack/`](./samples/level3-fullstack/)

---

### Level 4: カスタムWebチャット

Coding Agent Viewerの `POST /api/task-attempts` と正規化ログ SSE を呼び出すシングルページアプリの例：

```bash
cd samples/level4-custom
pnpm install
pnpm dev
```

ブラウザで <http://localhost:5174> を開き、使用するプロフィール・プロジェクト・プロンプトを指定します。送信するとバックエンドに `/api/task-attempts` を投げ、返却された `sessionId` で `/api/execution-processes/<id>/normalized-logs` に SSE 接続し、種別ごとに整形したログをリアルタイム表示します。UI から API ベースでエージェントを制御したい場合のベースラインとして利用できます。

**サンプル**: [`samples/level4-custom/`](./samples/level4-custom/)

---

## 📖 ドキュメント

詳細なドキュメントは [`docs/public/`](./docs/public/) を参照してください：

### 📘 モジュール仕様書

各モジュールの詳細な仕様とAPI：

- **[API Module 仕様](./docs/public/API_MODULE_SPEC.md)**
  - REST API エンドポイント
  - SSE (Server-Sent Events) の実装
  - ミドルウェアとエラーハンドリング

- **[Execution Module 仕様](./docs/public/EXECUTION_MODULE_SPEC.md)**
  - エージェント実行管理
  - プロファイル設定
  - セッションライフサイクル

- **[Log Module 仕様](./docs/public/LOG_MODULE_SPEC.md)**
  - ログ収集とストリーミング
  - 正規化とフォーマット変換
  - ファイルシステム監視

### 📗 アーキテクチャガイド

- **[モジュール化戦略](./docs/public/MODULARIZATION_STRATEGY.md)**
  - パッケージ構成
  - 依存関係
  - デプロイメント戦略
  - エコシステム形成

### 🔨 サンプルコード

実際に動くサンプルアプリケーション（各 README で手順を解説）：

- **[Level 1](./samples/level1-library/README.md)** — SDK を直接呼び出す CLI 群
- **[Level 2](./samples/level2-api/README.md)** — Express API + SSE サーバー
- **[Level 3](./samples/level3-fullstack/README.md)** — Viewer 本体のフルスタック構成
- **[Level 4](./samples/level4-custom/README.md)** — Web チャット UI（タスク実行 API + 正規化ログ）

---

## 🎯 対応AIエージェント

以下のコーディングエージェントをサポート：

- 🎨 **Claude Code** - Anthropic Claude搭載
- 🖱️ **Cursor** - AI統合エディタ
- 💎 **Gemini** - Google Gemini
- 📦 **Codex** - OpenAI Codex
- 🔓 **OpenCode** - オープンソースAI

各エージェントのセッションログを統一フォーマットで管理できます。

---

## 🛠️ 開発者向け情報

### 前提条件

- [Node.js](https://nodejs.org/) (>=18)
- [npm](https://www.npmjs.com/) (>=9) または [pnpm](https://pnpm.io/) (>=8)

### プロジェクト構造

```
coding-agent-viewer/
├── backend/           # TypeScript バックエンド (サーバーエントリ)
├── packages/
│   ├── cli/           # CLI 配布パッケージ (@nogataka/coding-agent-viewer)
│   └── sdk/           # SDK / ライブラリ (@nogataka/coding-agent-viewer-sdk)
├── frontend/          # React UI (Vite)
├── shared/            # 共有型定義
├── samples/           # サンプルアプリケーション
│   ├── level1-library/   # SDK直接利用
│   ├── level2-api/       # APIサーバー
│   ├── level3-fullstack/ # フルスタック
│   └── level4-custom/    # Webチャット
└── docs/
    └── public/        # ドキュメント
```

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-org/coding-agent-viewer
cd coding-agent-viewer

# 依存関係をインストール
npm run install:all

# バックエンドをビルド（SDK使用時）
cd backend
npm run build
```

### 開発サーバー起動

```bash
# フルスタックで起動
npm run dev

# 個別に起動
npm run backend:dev   # Backend: http://localhost:3001
npm run frontend:dev  # Frontend: http://localhost:3000
```

### テストと品質チェック

```bash
# 型チェック
npm run check

# Lint & Format（backend）
cd backend
npm run lint
npm run format:check
npm run typecheck
```

### 環境変数

| 変数 | タイプ | デフォルト | 説明 |
|------|--------|-----------|------|
| `POSTHOG_API_KEY` | ビルド時 | 空 | PostHog分析APIキー |
| `POSTHOG_API_ENDPOINT` | ビルド時 | 空 | PostHog分析エンドポイント |
| `PORT` | 実行時 | `3001` | バックエンドポート |
| `BACKEND_PORT` | 実行時 | `3001` | バックエンドポート（代替） |
| `FRONTEND_PORT` | 実行時 | `3000` | フロントエンドポート |
| `HOST` | 実行時 | `127.0.0.1` | バックエンドホスト |

---

## 📦 npmパッケージ

このプロジェクトは以下の2つのパッケージを提供します：

- **CLI**（ランタイム同梱）: `@nogataka/coding-agent-viewer`
- **SDK**（ライブラリ/API）: `@nogataka/coding-agent-viewer-sdk`

ライブラリとして利用する場合は SDK をインストールしてください:

```bash
npm install @nogataka/coding-agent-viewer-sdk
```

### SDK で利用できるモジュール

```javascript
// Execution Module
import { ExecutionService } from '@nogataka/coding-agent-viewer-sdk/services/execution';
import { activeExecutionRegistry } from '@nogataka/coding-agent-viewer-sdk/services/execution/activeExecutionRegistry';

// Log Module
import { LogSourceFactory } from '@nogataka/coding-agent-viewer-sdk/services/logs';

// API Module
import { setupRoutes } from '@nogataka/coding-agent-viewer-sdk/server/routes';
import { errorHandler } from '@nogataka/coding-agent-viewer-sdk/server/middleware/errorHandler.js';

// Utils
import { logger } from '@nogataka/coding-agent-viewer-sdk/utils/logger.js';
```

**シンプルで直感的なインポートパス**を提供：
- `services/execution` - エージェント実行管理
- `services/logs` - ログ収集・ストリーミング
- `server/routes` - Express ルート設定
- `server/middleware/errorHandler.js` - エラーハンドラー
- `utils/logger.js` - ロガー

---

## 🤝 コントリビューション

アイデアや変更提案は、まずGitHub Issuesで議論してください。実装の詳細や既存のロードマップとの整合性を確認してから、プルリクエストを作成してください。

---

## 📄 ライセンス

詳細は [LICENSE](./LICENSE) ファイルを参照してください。

---

## 🔗 関連リンク

- **ドキュメント**: [`docs/public/`](./docs/public/)
- **サンプル**: [`samples/`](./samples/)
- **CLI (npm)**: `@nogataka/coding-agent-viewer`
- **SDK (npm)**: `@nogataka/coding-agent-viewer-sdk`
- **Issue報告**: [GitHub Issues](https://github.com/your-org/coding-agent-viewer/issues)

---

## 💡 ユースケース

### CLIツール開発者
Level 1のSDKを使用して、独自のCLIツールを構築

### バックエンド開発者
Level 2のAPIを使用して、カスタムフロントエンドやマイクロサービスを構築

### エンドユーザー
Level 3のフルスタックアプリをそのまま使用、または必要に応じてカスタマイズ

### SaaS / PoC チーム
Level 4のWebチャットサンプルを基に、ブラウザからタスク実行 API とログストリームを利用する UI を素早く構築

---
