# Backendモジュール概要

## はじめに

このドキュメントは、`/Users/nogataka/dev/coding-agent-viewer/backend` に含まれる3つのモジュールの全体像と相互関係を説明します。

## モジュール構成

backendディレクトリには、以下の3つの独立したモジュールが含まれています：

```
backend/
├── server/                    # 1. APIモジュール
│   └── src/
│       ├── main.ts
│       ├── middleware/
│       └── routes/
├── services/                  # 2 & 3. サービスモジュール
│   └── src/
│       ├── execution/         # 2. エージェント実行管理モジュール
│       └── logs/              # 3. セッションログ管理モジュール
└── utils/                     # 共通ユーティリティ
    └── src/
```

### 1. APIモジュール (`server/`)

**役割**: REST APIサーバーとして、フロントエンドとバックエンドサービス間の通信インターフェースを提供

**主な機能**:
- プロジェクト、タスク、プロファイルの管理API
- 実行プロセスの制御API
- Server-Sent Events (SSE)によるリアルタイムログストリーミング
- フロントエンド静的ファイルの配信（本番環境）

**詳細**: [API_MODULE_SPEC.md](./API_MODULE_SPEC.md)

### 2. エージェント実行管理モジュール (`services/execution/`)

**役割**: 複数のAIコーディングエージェントの実行を統一的に管理

**主な機能**:
- プロファイルベースの設定管理
- プロセスのライフサイクル管理（起動、停止）
- セッションID解決
- アクティブプロセスの追跡

**サポートエージェント**:
- Claude Code
- Cursor
- Gemini
- Codex
- Opencode

**詳細**: [EXECUTION_MODULE_SPEC.md](./EXECUTION_MODULE_SPEC.md)

### 3. セッションログ管理モジュール (`services/logs/`)

**役割**: エージェントのログをファイルシステムから収集し、正規化された形式でストリーミング配信

**主な機能**:
- ファイルシステムベースのログ収集
- エージェント別のログソース戦略
- リアルタイムログストリーミング（chokidar使用）
- 正規化されたログエントリ変換
- JSON Patch形式でのストリーミング配信

**詳細**: [LOG_MODULE_SPEC.md](./LOG_MODULE_SPEC.md)

## アーキテクチャ

### 全体フロー

```
┌─────────────┐
│  Frontend   │
└──────┬──────┘
       │ HTTP / SSE
┌──────▼──────────────────────────────────────┐
│  APIモジュール (server/)                      │
│  ┌────────────────────────────────────────┐ │
│  │ Routes                                  │ │
│  │  • /api/projects                       │ │
│  │  • /api/tasks                          │ │
│  │  • /api/task-attempts                  │ │
│  │  • /api/execution-processes            │ │
│  │  • /api/profiles                       │ │
│  └────────────────────────────────────────┘ │
└──────┬─────────────────────────────┬────────┘
       │                             │
       │ Service Calls               │ SSE Stream
       │                             │
┌──────▼─────────────────┐   ┌──────▼──────────────────┐
│ 実行管理モジュール       │   │ ログ管理モジュール         │
│ (services/execution/)  │   │ (services/logs/)        │
│                        │   │                         │
│ ┌──────────────────┐  │   │ ┌───────────────────┐  │
│ │ExecutionService  │  │   │ │LogSourceFactory   │  │
│ │                  │  │   │ │                   │  │
│ │- startNewChat()  │  │   │ │- getAllProjects(filter?) │ │
│ │- sendFollowUp()  │  │   │ │- getSessions()    │  │
│ │- stopExecution() │  │   │ │- getSessionStream│  │
│ └──────────────────┘  │   │ └───────────────────┘  │
│                        │   │                         │
│ ┌──────────────────┐  │   │ ┌───────────────────┐  │
│ │ProfileRegistry   │  │   │ │LogSource Strategy │  │
│ │                  │  │   │ │                   │  │
│ │- claude-code     │  │   │ │- ClaudeLogSource  │  │
│ │- cursor          │  │   │ │- CursorLogSource  │  │
│ │- gemini          │  │   │ │- GeminiLogSource  │  │
│ │- codex           │  │   │ │- CodexLogSource   │  │
│ │- opencode        │  │   │ │- OpencodeLogSource│  │
│ └──────────────────┘  │   │ └───────────────────┘  │
└────────┬───────────────┘   └──────┬──────────────────┘
         │                          │
         │ spawn process            │ read files
         │                          │
┌────────▼──────────────────────────▼──────────────────┐
│             Filesystem                               │
│  ┌────────────────────────────────────────────────┐ │
│  │ ~/.claude/projects/                            │ │
│  │ ~/.gemini/tmp/                                 │ │
│  │ ~/.cursor/sessions/                            │ │
│  │ etc...                                         │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Running Processes                              │ │
│  │  • claude-code                                 │ │
│  │  • cursor-agent                                │ │
│  │  • gemini-cli                                  │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### モジュール間の依存関係

```
┌─────────────────┐
│   API モジュール  │
│   (server/)     │
└────┬───────┬────┘
     │       │
     │       └──────────────────────┐
     │                              │
┌────▼──────────────┐     ┌─────────▼────────────┐
│ 実行管理モジュール │     │ ログ管理モジュール     │
│ (execution/)      │     │ (logs/)              │
└────┬──────────────┘     └──────────────────────┘
     │                             ▲
     │                             │
     └─────────────────────────────┘
       activeExecutionRegistry (shared)
```

**依存関係の詳細**:

1. **APIモジュール → 実行管理モジュール**
   - `ExecutionService` を使用してエージェントを起動
   - タスク試行の開始、フォローアップ、停止

2. **APIモジュール → ログ管理モジュール**
   - `LogSourceFactory` を使用してログを取得
   - プロジェクト、タスク、セッションの情報を取得
   - SSEでログをストリーミング

3. **実行管理モジュール ↔ ログ管理モジュール**
   - `activeExecutionRegistry` を共有
   - 実行中のセッションステータスを同期

## データフロー

### 1. 新規タスク実行の開始

```
Frontend
  │
  │ POST /api/task-attempts
  │ { projectId, prompt, variantLabel }
  ▼
API Module (taskAttempts.ts)
  │
  │ decodeProjectId()
  │ resolveProfileLabel()
  ▼
Execution Module (executionService.ts)
  │
  │ startNewChat()
  ├─ composeSessionId()
  ├─ getProfile()
  ├─ getCommand()
  ├─ buildProcessParameters()
  ├─ composeEnvironment()
  ├─ spawn() → child process
  ├─ register to activeExecutionRegistry
  └─ resolveSessionId() (if needed)
  │
  ▼
Child Process (e.g., claude-code)
  │
  │ stdout/stderr → parent process
  │ create log file → filesystem
  ▼
Filesystem
```

### 2. ログストリーミング

```
Frontend
  │
  │ GET /api/execution-processes/:id/normalized-logs (SSE)
  ▼
API Module (executionProcesses.ts)
  │
  │ streamNormalizedLogs()
  ▼
Log Module (logSourceFactory.ts)
  │
  │ getSessionStream()
  ├─ findSessionById()
  ├─ get LogSource by executor type
  └─ streamSessionInfo()
  │
  ▼
Log Source (e.g., ClaudeLogSource)
  │
  │ check session status
  ├─ if running → streamLiveSession()
  │   ├─ read existing content
  │   ├─ watch file with chokidar
  │   └─ stream new content
  └─ if completed → streamCompletedSession()
      └─ read entire file
  │
  │ for each line:
  ├─ parseSessionLine()
  ├─ toNormalizedEntry()
  ├─ convertEntryToJsonPatch()
  └─ emit as SSE event
  │
  ▼
Frontend (receives SSE events)
```

### 3. プロジェクト一覧の取得

```
Frontend
  │
  │ GET /api/projects?profile=claude-code
  ▼
API Module (projects.ts)
  │
  │ getExecutorTypeFromProfile()
  ▼
Log Module (logSourceFactory.ts)
  │
  │ getAllProjects(executorType?)
  ├─ resolve executor filter (if provided)
  ├─ targeted sourcesのみで getProjectList()
  └─ prefix + merge + sort
  │
  ▼
Log Source (e.g., ClaudeLogSource)
  │
  │ getProjectList()
  ├─ read ~/.claude/projects/
  ├─ filter directories
  ├─ transform to readable paths
  └─ create ProjectInfo[]
  │
  ▼
API Module
  │
  │ map to response format
  ▼
Frontend
```

## ID形式とエンコーディング

### プロジェクトID

**形式**: `{EXECUTOR_TYPE}:{ACTUAL_PROJECT_ID}`

**例**: `CLAUDE_CODE:L1VzZXJzL25vZ2F0YWthL2Rldi9wcm9qZWN0`

**ACTUAL_PROJECT_ID**:
- ワークスペースパスをbase64urlエンコードしたもの
- 例: `/Users/nogataka/dev/project` → `L1VzZXJzL25vZ2F0YWthL2Rldi9wcm9qZWN0`

### セッションID

**形式**: `{EXECUTOR_TYPE}:{ACTUAL_PROJECT_ID}:{SESSION_UUID}`

**例**: `CLAUDE_CODE:L1VzZXJzL25vZ2F0YWthL2Rldi9wcm9qZWN0:550e8400-e29b-41d4-a716-446655440000`

### Executor Type マッピング

| Profile Label | Executor Type |
|--------------|---------------|
| `claude-code` | `CLAUDE_CODE` |
| `cursor` | `CURSOR` |
| `gemini` | `GEMINI` |
| `codex` | `CODEX` |
| `opencode` | `OPENCODE` |

## 正規化されたログエントリ

### 目的

各エージェントは独自のログフォーマットを使用しますが、フロントエンドで統一的に処理するために正規化します。

### NormalizedEntry 構造

```typescript
interface NormalizedEntry {
  timestamp: string | null;
  entry_type: NormalizedEntryType;
  content: string;
  metadata: unknown;  // 元のログエントリ
}
```

### Entry Type 種類

| Type | 説明 | 例 |
|------|------|---|
| `user_message` | ユーザーメッセージ | プロンプト、フォローアップ |
| `assistant_message` | アシスタントメッセージ | エージェントの返答 |
| `tool_use` | ツール使用 | ファイル読み書き、コマンド実行 |
| `system_message` | システムメッセージ | モデル情報、診断情報 |
| `error_message` | エラーメッセージ | エラー詳細 |
| `thinking` | 思考過程 | エージェントの推論 |

### Action Type（ツール使用時）

| Action | 説明 | フィールド |
|--------|------|----------|
| `file_read` | ファイル読み取り | `path` |
| `file_edit` | ファイル編集 | `path`, `changes[]` |
| `command_run` | コマンド実行 | `command`, `result` |
| `search` | 検索 | `query` |
| `tool` | その他のツール | `tool_name`, `arguments`, `result` |
| `todo_management` | TODO管理 | `todos[]`, `operation` |
| `other` | その他 | `description` |

### JSON Patch フォーマット

ログエントリはJSON Patch形式でSSEストリームに出力されます：

```json
{
  "op": "add",
  "path": "/entries/0",
  "value": {
    "type": "NORMALIZED_ENTRY",
    "content": {
      "timestamp": null,
      "entry_type": { "type": "user_message" },
      "content": "Create a new React component",
      "metadata": { /* original log entry */ }
    }
  }
}
```

## プロセスライフサイクル

### 1. 起動

```
ExecutionService.startNewChat()
  ├─ generate session ID
  ├─ validate workspace
  ├─ get profile and command
  ├─ build process parameters
  ├─ set environment variables
  ├─ spawn child process
  ├─ register to activeExecutionRegistry
  ├─ setup stdout/stderr handlers
  ├─ resolve session ID (if needed)
  └─ return ExecutionResult
```

### 2. 実行中

```
Child Process
  ├─ stdout → parent process console
  ├─ stderr → parent process console
  └─ log file → filesystem
       │
       ▼
chokidar (in LogSource)
  ├─ detect file changes
  ├─ read new content
  ├─ parse and normalize
  └─ stream to frontend via SSE
```

### 3. 終了

```
Child Process exits
  ├─ emit 'exit' event
  ├─ unregister from activeExecutionRegistry
  └─ log exit code

LogSource
  ├─ detect session is completed
  ├─ stop watching file
  └─ emit 'finished' event to SSE
```

### 4. 強制停止

```
Frontend
  │ POST /api/task-attempts/:sessionId/stop
  ▼
API Module
  ▼
ExecutionService.stopExecution()
  ├─ find process by session ID
  ├─ send SIGTERM signal
  ├─ unregister from activeExecutionRegistry
  └─ return success
```

## 環境変数

各モジュールで使用される環境変数：

### APIモジュール

| 変数名 | 説明 | デフォルト |
|-------|------|----------|
| `NODE_ENV` | 実行環境 | - |
| `BACKEND_PORT` | バックエンドポート | - |
| `PORT` | ポート（BACKEND_PORT優先） | 3001 |
| `HOST` | バインドホスト | 127.0.0.1 |
| `LOG_LEVEL` | ロギングレベル | info |

### 実行管理モジュール（子プロセスに設定）

| 変数名 | 説明 |
|-------|------|
| `NORMALIZED_EXECUTION_KIND` | 実行種別（"new" または "follow-up"） |
| `NORMALIZED_EXECUTION_PROFILE` | プロファイルラベル |
| `NORMALIZED_EXECUTION_PROJECT_ID` | プロジェクトID |
| `NORMALIZED_EXECUTION_ACTUAL_PROJECT_ID` | 実際のプロジェクトID |
| `NORMALIZED_EXECUTION_WORKSPACE` | ワークスペースパス |
| `NORMALIZED_EXECUTION_SESSION_ID` | セッションID |
| `NORMALIZED_EXECUTION_VARIANT` | バリアントラベル（設定時のみ） |

## エラーハンドリング戦略

### APIモジュール

- 統一されたエラーハンドラーミドルウェア
- すべてのエラーを `ApiResponse` 形式で返却
- エラーログの記録

### 実行管理モジュール

- ワークスペース検証エラー
- プロファイル/コマンド検証エラー
- プロセス起動エラー
- すべてエラーをスローし、上位レイヤーで処理

### ログ管理モジュール

- ファイル読み取りエラー → SSE error イベント
- パースエラー → スキップして処理続行
- セッション未検出 → null 返却

## ロギング

### Winston Logger

すべてのモジュールで共通のWinston loggerを使用：

```typescript
import { logger } from '../../utils/src/logger';

logger.info('Information message');
logger.warn('Warning message');
logger.error('Error message', error);
logger.debug('Debug message');
```

**設定**:
- レベル: `LOG_LEVEL` 環境変数（デフォルト: "info"）
- フォーマット: JSON（タイムスタンプ、スタックトレース付き）
- 出力先: コンソール（カラー表示）

### HTTPリクエストロギング

Morgan ミドルウェアを使用：
- フォーマット: Apache Combined Log
- すべてのHTTPリクエストを記録
- Winston logger経由で出力

## セキュリティ考慮事項

### 現状の設定

1. **Helmet.js**: 基本的なセキュリティヘッダー
2. **CORS**: すべてのオリジン許可（開発重視）
3. **認証なし**: 現在は認証機構なし

### 今後の追加推奨事項

1. **認証・認可**
   - JWTトークン認証
   - APIキー認証
   - ロールベースのアクセス制御

2. **レート制限**
   - リクエスト数制限
   - DDoS対策

3. **入力検証**
   - リクエストボディのバリデーション強化
   - SQLインジェクション対策（現在DB未使用）

4. **CORS設定**
   - 本番環境での厳密なオリジン制限

## パフォーマンス考慮事項

### 現状の最適化

1. **ストリーミング**: 大きなログファイルもメモリに全て読み込まずに処理
2. **ファイル監視**: chokidarによる効率的な変更検出
3. **非同期処理**: `express-async-errors` による非同期エラーハンドリング

### 今後の最適化候補

1. **キャッシング**
   - プロジェクト/セッション一覧のキャッシュ
   - Redis等の導入

2. **並列処理**
   - 複数エージェントのログ取得を並列化

3. **インデックス化**
   - ログファイルのインデックス作成
   - 高速検索

4. **圧縮**
   - 古いログの圧縮・アーカイブ

## テスト戦略

### 現状

- 自動テストなし（`npm test` はプレースホルダー）
- 手動テストとスモークテストに依存

### 推奨テスト構成

1. **ユニットテスト**
   - 各モジュールの主要クラス/関数
   - Vitest または Jest

2. **統合テスト**
   - APIエンドポイントのテスト
   - Supertest

3. **E2Eテスト**
   - フロントエンド〜バックエンド全体
   - Playwright

## SDK化の方針

各モジュールを独立したnpmパッケージとして配布する際の推奨事項：

### 1. APIモジュール SDK

**パッケージ名**: `@coding-agent-viewer/api-module`

**エクスポート**:
```typescript
export { setupRoutes } from './routes';
export { errorHandler } from './middleware/errorHandler';
export type { ApiResponse } from './types';
```

**使用例**:
```typescript
import express from 'express';
import { setupRoutes } from '@coding-agent-viewer/api-module';

const app = express();
setupRoutes(app);
app.listen(3001);
```

### 2. 実行管理モジュール SDK

**パッケージ名**: `@coding-agent-viewer/execution-module`

**エクスポート**:
```typescript
export { ExecutionService } from './executionService';
export { ProfileRegistry } from './profileRegistry';
export { activeExecutionRegistry } from './activeExecutionRegistry';
export { profileDefinitions } from './profiles';
export type * from './types';
```

**使用例**:
```typescript
import { ExecutionService } from '@coding-agent-viewer/execution-module';

const service = new ExecutionService();
const result = await service.startNewChat({...});
```

### 3. ログ管理モジュール SDK

**パッケージ名**: `@coding-agent-viewer/log-module`

**エクスポート**:
```typescript
export { LogSourceFactory } from './logSourceFactory';
export type { ILogSourceStrategy, ProjectInfo, SessionInfo } from './logSourceStrategy';
export * from './sources';
export type * from './executors/types';
```

**使用例**:
```typescript
import { LogSourceFactory } from '@coding-agent-viewer/log-module';

const factory = new LogSourceFactory();
const projects = await factory.getAllProjects('CLAUDE_CODE');
// 省略すると全 Executor のプロジェクトをまとめて取得
```

### 共通推奨事項

1. **TypeScript型定義の提供**: すべてのパブリックAPIに型を提供
2. **README**: 各パッケージに詳細なREADMEを含める
3. **バージョニング**: Semantic Versioningに従う
4. **依存関係の最小化**: 必要最小限の外部依存のみ
5. **ドキュメント**: API Docコメントの充実

## まとめ

### 各モジュールの責務

| モジュール | 責務 | 主要クラス |
|----------|------|----------|
| API | HTTPインターフェース | Express Routes |
| 実行管理 | プロセス管理 | ExecutionService |
| ログ管理 | ログ収集・配信 | LogSourceFactory |

### 相互作用

1. **API → 実行管理**: タスク実行の制御
2. **API → ログ管理**: ログの取得と配信
3. **実行管理 ↔ ログ管理**: 実行ステータスの同期

### 拡張性

各モジュールは独立しており、以下の拡張が容易：

- **新しいエージェントの追加**: プロファイルとログソースを追加
- **新しいAPI**: ルーターを追加
- **認証・認可**: ミドルウェアを追加
- **データベース**: ログ管理をDBベースに変更可能

## 参考資料

- [API_MODULE_SPEC.md](./API_MODULE_SPEC.md) - APIモジュール詳細仕様
- [EXECUTION_MODULE_SPEC.md](./EXECUTION_MODULE_SPEC.md) - 実行管理モジュール詳細仕様
- [LOG_MODULE_SPEC.md](./LOG_MODULE_SPEC.md) - ログ管理モジュール詳細仕様
