# APIモジュール仕様書

## 概要

APIモジュールは、Express.jsベースのREST APIサーバーで、フロントエンドとバックエンドサービス間の通信インターフェースを提供します。プロジェクト、タスク、プロファイル、実行プロセスの管理エンドポイントを公開し、Server-Sent Events (SSE)によるリアルタイムログストリーミングをサポートします。

## モジュール構成

### ディレクトリ構造

```
server/
├── src/
│   ├── main.ts                    # サーバーエントリーポイント
│   ├── lib.ts                     # 共通ライブラリ
│   ├── middleware/
│   │   └── errorHandler.ts       # エラーハンドリングミドルウェア
│   └── routes/
│       ├── index.ts               # ルート設定
│       ├── executionProcesses.ts # 実行プロセスAPI
│       ├── frontend.ts            # フロントエンド配信
│       ├── profiles.ts            # プロファイル管理API
│       ├── projects.ts            # プロジェクト管理API
│       ├── taskAttempts.ts        # タスク試行API
│       └── tasks.ts               # タスク管理API
```

## 主要機能

### 1. サーバー初期化 (`main.ts`)

#### 責務
- Express サーバーの初期化と起動
- ミドルウェアの設定
- ルーティングの設定
- グレースフルシャットダウンの実装

#### 主要機能
- **ポート管理**: `BACKEND_PORT` または `PORT` 環境変数から取得（デフォルト: 3001）
- **セキュリティ**: Helmet.js による基本的なセキュリティヘッダー設定
- **CORS**: すべてのオリジンからのアクセスを許可
- **ロギング**: Morgan によるHTTPリクエストロギング
- **静的ファイル配信**: 本番環境でフロントエンドの静的ファイルを配信
- **ポートファイル**: 開発環境で起動ポートをファイルに書き込み

#### 起動シーケンス
1. 環境変数の読み込み
2. アセットディレクトリの作成
3. ミドルウェアの設定（Helmet, CORS, Morgan, JSON parser）
4. ルーティングの設定
5. エラーハンドラーの登録
6. サーバーの起動とポートファイルの書き込み

### 2. ルーティング (`routes/index.ts`)

#### エンドポイント構成

| ベースパス | 説明 | ルーター |
|-----------|------|---------|
| `/api/projects` | プロジェクト管理 | `projectRoutes` |
| `/api/profiles` | プロファイル管理 | `profilesRoutes` |
| `/api/tasks` | タスク管理 | `taskRoutes` |
| `/api/task-attempts` | タスク試行管理 | `taskAttemptsRoutes` |
| `/api/execution-processes` | 実行プロセス管理 | `executionProcessRoutes` |
| `/` | フロントエンド配信 | `frontendRoutes` |

#### 未定義ルートの処理
- `/api/*` に一致する未定義のルートは404エラーを返す
- 明示的なエラーレスポンス（パス、メソッドを含む）

### 3. プロジェクト管理API (`routes/projects.ts`)

#### GET `/api/projects`

**説明**: 指定されたプロファイルのプロジェクト一覧を取得

**クエリパラメータ**:
- `profile` (optional): プロファイルラベル（デフォルト: "claude-code"）

**レスポンス**:
```typescript
{
  success: boolean;
  data: Project[];
  error_data: null;
  message: null;
}
```

**処理フロー**:
1. プロファイルラベルをExecutor Typeに変換（例: "claude-code" → "CLAUDE_CODE"）
2. `LogSourceFactory` を使用してすべてのプロジェクトを取得
3. 指定されたExecutor Typeでフィルタリング
4. プロジェクトレスポンスに変換して返却

#### Executor Type マッピング

```typescript
{
  'claude-code': 'CLAUDE_CODE',
  'cursor': 'CURSOR',
  'gemini': 'GEMINI',
  'codex': 'CODEX',
  'opencode': 'OPENCODE'
}
```

### 4. タスク管理API (`routes/tasks.ts`)

#### GET `/api/tasks`

**説明**: 指定されたプロジェクトのタスク（セッション）一覧を取得

**クエリパラメータ**:
- `project_id` (required): プロジェクトID（形式: `{EXECUTOR_TYPE}:{PROJECT_ID}`）

**レスポンス**:
```typescript
{
  success: boolean;
  data: TaskWithAttemptStatus[];
  error_data: null;
  message: null;
}
```

**処理フロー**:
1. プロジェクトIDをパース（Executor TypeとActual Project IDに分割）
2. `LogSourceFactory.getSessionsForProject()` でセッション一覧を取得
3. セッション情報をタスク情報に変換
4. タスクステータスをセッションステータスから推論

#### セッションステータス → タスクステータス マッピング

```typescript
{
  'running': 'inprogress',
  'completed': 'done',
  'failed': 'inreview'
}
```

#### GET `/api/tasks/:id`

**説明**: 指定されたタスク（セッション）の詳細を取得

**パスパラメータ**:
- `id`: タスク（セッション）ID

**レスポンス**:
```typescript
{
  success: boolean;
  data: Task;
  error_data: null;
  message: null;
}
```

### 5. タスク試行API (`routes/taskAttempts.ts`)

#### POST `/api/task-attempts`

**説明**: 新しいタスク試行（エージェント実行）を開始

**リクエストボディ**:
```typescript
{
  projectId: string;      // "{EXECUTOR_TYPE}:{PROJECT_ID}" 形式
  prompt: string;         // ユーザープロンプト
  variantLabel?: string;  // プロファイルのバリアントラベル（optional）
}
```

**レスポンス** (202 Accepted):
```typescript
{
  success: boolean;
  data: {
    sessionId: string;
    processId: number | null;
    startedAt: Date;
    projectId: string;
    kind: 'new';
  };
  error_data: null;
  message: 'Execution started';
}
```

**処理フロー**:
1. リクエストの検証（projectId, promptの存在確認）
2. プロジェクトIDのデコード（Executor Type、Actual Project IDの抽出）
3. プロファイルラベルの解決
4. ワークスペースパスのデコード（base64url）
5. `ExecutionService.startNewChat()` で実行開始
6. 実行結果を返却（非同期、即座に202レスポンス）

#### POST `/api/task-attempts/:sessionId/follow-up`

**説明**: 既存のセッションにフォローアップメッセージを送信

**パスパラメータ**:
- `sessionId`: セッションID（形式: `{EXECUTOR_TYPE}:{PROJECT_ID}:{SESSION_UUID}`）

**リクエストボディ**:
```typescript
{
  message: string;        // フォローアップメッセージ
  variantLabel?: string;  // プロファイルのバリアントラベル（optional）
}
```

**レスポンス** (202 Accepted):
```typescript
{
  success: boolean;
  data: {
    sessionId: string;
    processId: number | null;
    startedAt: Date;
    projectId: string;
    kind: 'follow-up';
  };
  error_data: null;
  message: 'Follow-up started';
}
```

**処理フロー**:
1. リクエストの検証（sessionId, messageの存在確認）
2. セッションIDのデコード（Executor Type、Project IDの抽出）
3. プロファイルラベルの解決
4. `ExecutionService.sendFollowUp()` でフォローアップ送信
5. 実行結果を返却

#### POST `/api/task-attempts/:sessionId/stop`

**説明**: 実行中のセッションを停止

**パスパラメータ**:
- `sessionId`: 停止するセッションID

**レスポンス**:
```typescript
{
  success: boolean;
  data: { sessionId: string };
  error_data: null;
  message: 'Execution stop requested';
}
```

**エラーレスポンス** (404):
- セッションが見つからない、または既に完了している場合

### 6. 実行プロセスAPI (`routes/executionProcesses.ts`)

#### GET `/api/execution-processes/:id/normalized-logs`

**説明**: セッションの正規化されたログをServer-Sent Events (SSE)でストリーミング

**パスパラメータ**:
- `id`: セッションID

**レスポンス形式**: `text/event-stream`

**イベントタイプ**:
- `json_patch`: JSON Patch形式のログエントリ
- `finished`: ログストリームの終了
- `error`: エラー発生

**SSE イベント例**:
```
event: json_patch
data: [{"op":"add","path":"/entries/0","value":{"type":"NORMALIZED_ENTRY","content":{...}}}]

event: finished
data: {"message":"Log stream ended"}
```

**処理フロー**:
1. SSE レスポンスヘッダーの設定
2. `LogSourceFactory.getSessionStream()` でストリームを取得
3. ストリームからのデータをSSEフォーマットに変換
4. クライアントへ送信
5. エラーまたは終了時にストリームをクローズ

### 7. プロファイル管理API (`routes/profiles.ts`)

#### GET `/api/profiles`

**説明**: 利用可能なすべてのプロファイルとバリアントの一覧を取得

**レスポンス**:
```typescript
{
  success: boolean;
  data: {
    profiles: Array<{
      label: string;
      variants?: Array<{ label: string }>;
    }>;
  };
  error_data: null;
  message: null;
}
```

**利用可能なプロファイル**:
- `claude-code` (バリアント: `plan`)
- `gemini` (バリアント: `flash`)
- `codex`
- `opencode`
- `cursor`

## エラーハンドリング

### エラーハンドラーミドルウェア (`middleware/errorHandler.ts`)

#### 機能
- すべてのルートで発生した未処理のエラーをキャッチ
- 適切なHTTPステータスコードとエラーメッセージを返却
- エラーログの記録

#### エラーレスポンス形式
```typescript
{
  success: false,
  data: null,
  error_data: null,
  message: string  // エラーメッセージ
}
```

## レスポンスフォーマット

すべてのAPIレスポンスは以下の統一フォーマットを使用：

```typescript
interface ApiResponse<T, E = T> {
  success: boolean;      // リクエストの成功/失敗
  data: T | null;       // 成功時のデータ
  error_data: E | null; // エラー詳細（オプショナル）
  message: string | null; // メッセージ（オプショナル）
}
```

## セキュリティ機能

### Helmet.js 設定
- Content Security Policy: 無効（フロントエンド配信のため）
- その他のセキュリティヘッダーは有効

### CORS設定
- すべてのオリジンからのアクセスを許可
- 開発環境での柔軟な接続を優先

### JSON Parser 設定
- "null"文字列の適切な処理
- Strict mode: false（柔軟なJSON解析）

## ロギング

### Morgan設定
- フォーマット: `combined`（Apache Combined Log形式）
- 出力先: Winston logger経由でコンソール
- すべてのHTTPリクエストをログ記録

### Winston Logger
- ログレベル: 環境変数 `LOG_LEVEL` で設定可能（デフォルト: "info"）
- フォーマット: JSON形式（タイムスタンプ、スタックトレース付き）
- サービス名: "coding-agent-viewer"

## 環境変数

| 変数名 | 説明 | デフォルト値 |
|-------|------|------------|
| `NODE_ENV` | 実行環境 | - |
| `BACKEND_PORT` | バックエンドポート番号 | - |
| `PORT` | ポート番号（BACKEND_PORT優先） | 3001 |
| `HOST` | バインドホスト | 127.0.0.1 |
| `LOG_LEVEL` | ロギングレベル | info |

## 起動とシャットダウン

### 起動
```bash
npm run dev      # 開発モード（tsx watch）
npm run start    # 本番モード（tsx）
npm run build    # TypeScriptコンパイル
npm run start:compiled  # コンパイル済みファイルから起動
```

### グレースフルシャットダウン
- `SIGTERM` シグナル受信時
- `SIGINT` シグナル受信時（Ctrl+C）

シャットダウンシーケンス:
1. 新規リクエストの受付停止
2. 既存リクエストの完了待機
3. HTTPサーバーのクローズ
4. プロセス終了（exit code: 0）

## 技術スタック

- **フレームワーク**: Express.js 4.x
- **言語**: TypeScript 5.x
- **セキュリティ**: Helmet.js, CORS
- **ロギング**: Winston, Morgan
- **エラーハンドリング**: express-async-errors

## 依存関係

### 内部依存
- `../../utils/src/logger`: ロガーユーティリティ
- `../../utils/src/portFile`: ポートファイル管理
- `../../services/src/logs/logSourceFactory`: ログソースファクトリ
- `../../services/src/execution`: 実行サービス

### 外部依存
- `express`: Webフレームワーク
- `cors`: CORS ミドルウェア
- `helmet`: セキュリティヘッダー
- `morgan`: HTTPリクエストロガー
- `express-async-errors`: 非同期エラーハンドリング

## SDK利用時の考慮事項

### エクスポートすべき主要インターフェース
- `ApiResponse<T, E>`: 統一レスポンス型
- `setupRoutes(app: Express)`: ルーティング設定関数
- エラーハンドラーミドルウェア

### カスタマイズポイント
1. **ルーティング拡張**: 新しいルーターを `setupRoutes()` に追加
2. **ミドルウェア追加**: `main.ts` でミドルウェアスタックに挿入
3. **エラーハンドリング**: カスタムエラーハンドラーの実装
4. **認証/認可**: 必要に応じてミドルウェアを追加

### 使用例
```typescript
import express from 'express';
import { setupRoutes } from '@coding-agent-viewer/api-module';

const app = express();

// カスタムミドルウェアの追加
app.use(express.json());

// ルーティング設定
setupRoutes(app);

// サーバー起動
app.listen(3001);
```

## 今後の拡張性

### 認証・認可の追加
- JWTトークン認証の実装
- ロールベースのアクセス制御（RBAC）
- APIキー認証

### WebSocket対応
- リアルタイム双方向通信
- SSEの代替/補完

### GraphQL対応
- REST APIと並行してGraphQLエンドポイントを提供
- 柔軟なデータ取得の実現

### レート制限
- リクエストレート制限の実装
- DDoS対策

### API バージョニング
- `/api/v1`, `/api/v2` などのバージョン管理
- 後方互換性の維持
