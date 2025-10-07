**Note: This project is a TypeScript/Node.js port of the original Rust backend implementation.**

## Overview

AI coding agents are increasingly writing the world's code and human engineers now spend the majority of their time planning, reviewing, and orchestrating tasks. Vibe Kanban streamlines this process, enabling you to:

- Easily switch between different coding agents
- Orchestrate the execution of multiple coding agents in parallel or in sequence
- Quickly review work and start dev servers
- Track the status of tasks that your coding agents are working on
- Centralise configuration of coding agent MCP configs

## TypeScript/Node.js Version

This is the TypeScript/Node.js implementation of Vibe Kanban, providing full compatibility with the original Rust version while leveraging the JavaScript ecosystem.

## Installation

Make sure you have authenticated with your favourite coding agent. A full list of supported coding agents can be found in the [docs](https://vibekanban.com/). Then in your terminal run:

```bash
npx coding-agent-viewer
```

## Support

Please open an issue on this repo if you find any bugs or have any feature requests.

## Contributing

We would prefer that ideas and changes are raised with the core team via GitHub issues, where we can discuss implementation details and alignment with the existing roadmap. Please do not open PRs without first discussing your proposal with the team.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (>=18)
- [npm](https://www.npmjs.com/) (>=9) or [pnpm](https://pnpm.io/) (>=8)

### Project Structure

```
coding-agent-viewer/
├── backend/         # Node.js/TypeScript backend
│   ├── server/      # Express API server
│   ├── services/    # Filesystem-based log sources & profile helpers
│   └── utils/       # Shared utilities
├── frontend/        # React UI
└── shared/          # Shared TypeScript types
```

### Installation

Install all dependencies:
```bash
npm install
npm run install:all   # Installs frontend, backend, and CLI packages
```

### Running the Development Server

Start both frontend and backend in development mode:
```bash
npm run dev
```

This will start:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

Individual servers:
```bash
npm run frontend:dev  # Frontend only
npm run backend:dev   # Backend only
```

### Building

Build both frontend and backend:
```bash
npm run build
```

### Testing & Quality

```bash
# Type checking
npm run check          # Check both frontend and backend
npm run backend:check  # Backend only
npm run frontend:check # Frontend only

# Linting & Formatting (backend)
cd backend
npm run lint           # ESLint
npm run format         # Prettier format
npm run format:check   # Prettier check
npm run typecheck      # TypeScript check
```

### Environment Variables

The following environment variables can be configured:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `POSTHOG_API_KEY` | Build-time | Empty | PostHog analytics API key (disables analytics if empty) |
| `POSTHOG_API_ENDPOINT` | Build-time | Empty | PostHog analytics endpoint (disables analytics if empty) |
| `PORT` | Runtime | `3001` | Backend server port |
| `BACKEND_PORT` | Runtime | `3001` | Alternative backend server port |
| `FRONTEND_PORT` | Runtime | `3000` | Frontend development server port |
| `HOST` | Runtime | `127.0.0.1` | Backend server host |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Runtime | Not set | Disable git worktree cleanup (for debugging) |

### Port Configuration

Development ports are configured in `.dev-ports.json`:
```json
{
  "frontend": 3000,
  "backend": 3001
}
```

### API Compatibility

This TypeScript/Node.js version maintains 95%+ API compatibility with the original Rust implementation. See `API_COMPARISON_FINAL.md` for detailed compatibility information.

## Migration from Rust Version

This TypeScript/Node.js implementation is designed to be a drop-in replacement for the Rust version. All data formats, API endpoints, and frontend interactions remain compatible. Simply stop the Rust server and start the Node.js server to switch implementations.

## Performance Considerations

While the TypeScript/Node.js version may have slightly different performance characteristics compared to the Rust version, it offers:
- Easier deployment and maintenance
- Broader ecosystem compatibility
- Simplified development workflow
- Full feature parity

## License

See the LICENSE file for details.


## プロジェクト構成と主要機能
- **モノレポ構成**: `backend/`(Express + TypeScript API)、`frontend/`(Vite + React UI)、`shared/`(型定義)、`npx-cli/`(配布用CLI)が協調し、ルートのnpmスクリプトで横断的に管理します。
- **バックエンド API**: `backend/server/src/main.ts`がヘルメットやCORS設定を行い、`/api/projects`・`/api/tasks`・`/api/task-attempts`などのルートを提供します。各ルートはログソースからプロジェクト/セッション情報を読み出し、JSONレスポンスを返します。
- **エージェント実行管理**: `backend/services/src/execution/ExecutionService`がプロファイル定義(`profiles/*.ts`)を参照しつつnpx経由でClaude CodeやGemini CLIを起動し、環境変数とアクティブセッションを追跡します。
- **ログ正規化と配信**: `LogSourceFactory`と各Executor用ログソースがファイルシステムのJSONLを解析し、JSON Patch形式のイベントをSSE (`/api/execution-processes/:id/normalized-logs`) 経由でフロントに送ります。
- **フロントエンド UI**: `App.tsx`以下でプロファイル選択→プロジェクト一覧→タスク詳細までをReact Routerで構築し、`useEventSourceManager`がSSEを購読してNormalizedEntryログを可視化します。
- **CLI 配布**: `npx-cli/bin/cli.js`はビルド済みバックエンド/フロントエンドを同梱し、ランタイム用の環境変数を設定して単一コマンドでビューアを起動できるようにします。
- **開発時のポイント**: `npm run dev`で前後両方のサーバーを並列起動し、`npm run check`で型・Lint・フォーマットを一括検証できます。SSEやエージェント連携を触る際はローカルの`.claude/`や`.gemini/`ディレクトリがデータソースになる点に注意してください。
