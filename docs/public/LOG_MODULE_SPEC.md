# セッションログ管理モジュール仕様書

## 概要

セッションログ管理モジュールは、複数のAIコーディングエージェント（Claude Code, Cursor, Gemini, Codex, Opencode等）の実行ログをファイルシステムから収集し、正規化された形式でストリーミング配信するモジュールです。エージェント固有のログフォーマットを抽象化し、統一的なAPIを提供します。

## モジュール構成

### ディレクトリ構造

```
services/src/logs/
├── logSourceFactory.ts           # ログソースファクトリ
├── logSourceStrategy.ts          # ログソース戦略インターフェース
├── sources/                      # エージェント別ログソース実装
│   ├── index.ts                  # ソースのエクスポート
│   ├── baseExecutorLogSource.ts # 基底クラス
│   ├── claudeLogSource.ts       # Claude Code ログソース
│   ├── cursorLogSource.ts       # Cursor ログソース
│   ├── geminiLogSource.ts       # Gemini ログソース
│   ├── codexLogSource.ts        # Codex ログソース
│   └── opencodeLogSource.ts     # Opencode ログソース
└── executors/                    # ログ処理ユーティリティ
    ├── types.ts                  # 型定義
    ├── conversationPatch.ts     # JSON Patch生成
    ├── entryIndexProvider.ts    # エントリインデックス管理
    └── index.ts                  # エクスポート
```

## 設計思想

### ストラテジーパターン

各エージェントのログフォーマットは異なるため、ストラテジーパターンを採用：
- `ILogSourceStrategy`: 共通インターフェース
- エージェント別の具体的実装（`ClaudeLogSource`, `CursorLogSource` 等）
- `LogSourceFactory`: ファクトリクラスで実装を選択

### ファイルシステムベース

データベースを使用せず、各エージェントがファイルシステムに出力するログファイルを直接読み取り：
- リアルタイム性: `chokidar` によるファイル監視
- シンプルさ: 追加のインフラ不要
- スケーラビリティ: ファイルシステムの性能に依存

### 正規化

エージェント固有のログフォーマットを正規化：
- 統一された `NormalizedEntry` 型
- フロントエンドは単一のフォーマットのみ処理すればよい
- 新しいエージェントの追加が容易

## 主要コンポーネント

### 1. LogSourceFactory (`logSourceFactory.ts`)

エージェント別のログソースを管理し、統一的なAPIを提供するファクトリクラス。

#### 主要機能

##### `getAllProjects(executorFilter?: string): Promise<ProjectInfo[]>`

**説明**: すべてのエージェントからプロジェクト一覧を取得。`executorFilter` を渡すと対象 Executor のみを走査。

**戻り値**:
```typescript
interface ProjectInfo {
  id: string;              // "{EXECUTOR_TYPE}:{ACTUAL_PROJECT_ID}" 形式
  name: string;           // プロジェクト名（表示用）
  git_repo_path: string;  // Gitリポジトリパス
  created_at: Date;       // 作成日時
  updated_at: Date;       // 更新日時
}
```

**処理フロー**:
1. フィルタが指定された場合は対象 Executor を事前に絞り込み
2. 各ログソースから `getProjectList()` を呼び出し
3. プロジェクトIDにExecutor Typeプレフィックスを追加
4. すべてのプロジェクトをマージし、更新日時の降順でソート

##### `getSessionsForProject(projectId: string): Promise<SessionInfo[]>`

**説明**: 指定されたプロジェクトのセッション一覧を取得

**パラメータ**:
- `projectId`: プロジェクトID（形式: `{EXECUTOR_TYPE}:{ACTUAL_PROJECT_ID}`）

**戻り値**:
```typescript
interface SessionInfo {
  id: string;              // セッションID（複合形式）
  projectId: string;       // プロジェクトID
  filePath: string;        // ログファイルパス
  title: string;          // タイトル
  firstUserMessage?: string; // 最初のユーザーメッセージ
  workspacePath?: string | null; // ワークスペースパス
  status: 'running' | 'completed' | 'failed'; // ステータス
  createdAt: Date;        // 作成日時
  updatedAt: Date;        // 更新日時
  fileSize: number;       // ファイルサイズ
}
```

**処理フロー**:
1. プロジェクトIDをパース（Executor Type と Actual Project ID に分割）
2. 対応するログソースを取得
3. ログソースから `getSessionList()` を呼び出し
4. セッションIDにプレフィックスを追加
5. アクティブ実行レジストリで実行中かチェック
6. 実行中の場合、ステータスを "running" に更新

##### `getSessionStream(sessionId: string): Promise<Readable | null>`

**説明**: セッションログをストリーミングで取得

**パラメータ**:
- `sessionId`: セッションID（形式: `{EXECUTOR_TYPE}:{PROJECT_ID}:{SESSION_UUID}`）

**戻り値**:
- `Readable`: ログストリーム（SSEフォーマット）
- `null`: セッションが見つからない

**処理フロー**:
1. セッションIDをパース
2. `findSessionById()` でセッション情報を取得
3. 対応するログソースを取得
4. `BaseExecutorLogSource` の場合、`streamSessionInfo()` を呼び出し
5. それ以外の場合、`getSessionById()` を呼び出し

##### `findSessionById(sessionId: string)`

**説明**: セッションIDからセッション情報を取得

**戻り値**:
```typescript
{
  session: SessionInfo;
  executorType: string;
  projectCompositeId: string;
  actualProjectId: string;
  actualSessionId: string;
} | null
```

**処理フロー**:
1. セッションIDをパース
2. 対応するログソースを取得
3. プロジェクトのセッション一覧を取得
4. セッションIDで検索
5. アクティブ実行レジストリで実行中かチェック

#### ID形式の管理

##### プロジェクトID
```
{EXECUTOR_TYPE}:{ACTUAL_PROJECT_ID}
```
例: `CLAUDE_CODE:L1VzZXJzL25vZ2F0YWthL2Rldi9wcm9qZWN0`

##### セッションID
```
{EXECUTOR_TYPE}:{ACTUAL_PROJECT_ID}:{SESSION_UUID}
```
例: `CLAUDE_CODE:L1VzZXJzL25vZ2F0YWthL2Rldi9wcm9qZWN0:550e8400-e29b-41d4-a716-446655440000`

#### パースメソッド

##### `parseProjectId(projectId: string)`
```typescript
{ executorType: string; actualProjectId: string } | null
```

##### `parseSessionId(sessionId: string)`
```typescript
{ executorType: string; actualProjectId: string; actualSessionId: string } | null
```

#### Executor Type マッピング

```typescript
const executorSources = new Map<string, ILogSourceStrategy>([
  ['CLAUDE_CODE', new ClaudeLogSource()],
  ['CURSOR', new CursorLogSource()],
  ['GEMINI', new GeminiLogSource()],
  ['CODEX', new CodexLogSource()],
  ['OPENCODE', new OpencodeLogSource()]
]);
```

### 2. ILogSourceStrategy (`logSourceStrategy.ts`)

ログソースの共通インターフェース。

#### インターフェース定義

```typescript
interface ILogSourceStrategy {
  getName(): string;
  getProjectList(): Promise<ProjectInfo[]>;
  getSessionList(projectId: string): Promise<SessionInfo[]>;
  getSessionById(sessionId: string): Promise<Readable | null>;
}
```

#### メソッド説明

##### `getName(): string`
ログソースの名前を返す（例: "CLAUDE_CODE"）

##### `getProjectList(): Promise<ProjectInfo[]>`
プロジェクト一覧を取得

##### `getSessionList(projectId: string): Promise<SessionInfo[]>`
指定されたプロジェクトのセッション一覧を取得

##### `getSessionById(sessionId: string): Promise<Readable | null>`
セッションログをストリーミングで取得

### 3. BaseExecutorLogSource (`sources/baseExecutorLogSource.ts`)

エージェント固有のログソースの基底クラス。

#### 抽象メソッド

##### `getName(): string`
エージェント名を返す

##### `resolveSessionFilePath(executionId, sessionId, workingDir): Promise<string | null>`
セッションファイルパスを解決（各エージェントで実装）

##### `parseSessionLine(line: string): any`
JSONLファイルの1行をパース（各エージェントで実装）

##### `getProjectList(): Promise<ProjectInfo[]>`
プロジェクト一覧を取得（各エージェントで実装）

##### `getSessionList(projectId: string): Promise<SessionInfo[]>`
セッション一覧を取得（各エージェントで実装）

#### 実装済みメソッド

##### `streamSessionInfo(session: SessionInfo): Promise<Readable | null>`

**説明**: セッション情報からログストリームを生成

**処理フロー**:
1. セッションのステータスをチェック
2. 実行中の場合、`streamLiveSession()` を呼び出し
3. 完了済みの場合、`streamCompletedSession()` を呼び出し

##### `streamCompletedSession(filePath: string): Promise<Readable>`

**説明**: 完了済みセッションのログをストリーミング

**処理フロー**:
1. ファイル全体を読み込み
2. 各行を `parseSessionLine()` でパース
3. 正規化エントリに変換
4. JSON Patch形式でストリームに出力
5. 終了イベントを送信

##### `streamLiveSession(filePath: string): Promise<Readable>`

**説明**: 実行中セッションのログをリアルタイムストリーミング

**処理フロー**:
1. 既存の内容を読み込み
2. `chokidar` でファイル変更を監視
3. 新しい内容が追加されたら、差分を読み取り
4. 各行を `parseSessionLine()` でパース
5. 正規化エントリに変換
6. JSON Patch形式でストリームに出力
7. ストリームクローズ時、ウォッチャーを停止

#### ログ正規化

##### `toNormalizedEntry(entry: any): NormalizedEntry | null`

**説明**: エージェント固有のログエントリを正規化

**サポートするエントリタイプ**:

1. **User Message** (`user_message`)
   - `response_item` with `role: 'user'`
   - `event_msg` with `type: 'user_message'`

2. **Assistant Message** (`assistant_message`)
   - `response_item` with `role: 'assistant'`
   - `event_msg` with `type: 'agent_message'`

3. **Tool Use** (`tool_use`)
   - `response_item` with `type: 'function_call'`
   - `response_item` with `type: 'function_call_output'`
   - `event_msg` with `type: 'command_run'`

4. **System Message** (`system_message`)
   - その他のメッセージ

5. **Thinking** (`thinking`)
   - `response_item` with `type: 'reasoning'`

##### ActionType マッピング

ツール使用のアクションタイプ：

- `file_read`: ファイル読み取り
- `file_edit`: ファイル編集（write, edit, delete）
- `command_run`: コマンド実行
- `search`: 検索（glob, grep）
- `tool`: その他のツール

##### 正規化処理

1. **コンテンツ抽出**: テキストコンテンツを抽出
2. **サニタイズ**: `<user_instructions>`, `<environment_context>` タグを削除
3. **メタデータ保存**: 元のログエントリをメタデータとして保存

#### JSON Patch生成

##### `convertEntryToJsonPatch(entry, entryIndex): JsonPatchOperation | null`

**説明**: 正規化エントリをJSON Patchに変換

**JSON Patch形式**:
```typescript
{
  op: 'add',
  path: '/entries/{index}',
  value: {
    type: 'NORMALIZED_ENTRY',
    content: NormalizedEntry
  }
}
```

#### ファイル監視

##### chokidar設定
```typescript
{
  persistent: true,
  usePolling: false,
  useFsEvents: process.platform === 'darwin',
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50
  }
}
```

### 4. ClaudeLogSource (`sources/claudeLogSource.ts`)

Claude Code専用のログソース実装。

#### ディレクトリ構造

```
~/.claude/projects/
└── -{workspace-path}-/
    ├── {session-uuid}.jsonl
    └── {session-uuid}.jsonl
```

例: `~/.claude/projects/-Users-user-dev-project-/{uuid}.jsonl`

#### 主要機能

##### プロジェクト検出

**処理フロー**:
1. `~/.claude/projects/` ディレクトリを読み取り
2. `-` で始まるディレクトリをフィルタ
3. ディレクトリ名をワークスペースパスに変換
4. プロジェクト情報を生成

##### パス変換

**ワークスペースパス → Claudeディレクトリ名**:
```typescript
'/Users/user/project' → '-Users-user-project-'
```

**Claudeディレクトリ名 → ワークスペースパス**:
```typescript
'-Users-user-project-' → '/Users/user/project'
```

##### プロジェクトID

ワークスペースパスをbase64urlエンコード:
```typescript
Buffer.from(dirPath).toString('base64url')
```

##### セッション検出

**処理フロー**:
1. プロジェクトディレクトリ内の `.jsonl` ファイルを検索
2. 各ファイルのメタデータを取得
3. 最初のユーザーメッセージを抽出（タイトル用）
4. ワークスペースパスを抽出（ログから）
5. セッション情報を生成

##### ログパース

**Claude特有の処理**:
1. **モデル情報の報告**: 最初のアシスタントメッセージからモデル名を抽出
2. **ツールエントリのマッピング**: `tool_use_id` を使用してツール呼び出しと結果をマッチング
3. **ツール結果の更新**: `tool_result` ブロックを処理して結果を更新
4. **JSON Patch replace**: ツール結果が利用可能になったら既存のエントリを置換

##### ツールマッピング

| ツール名 | ActionType | 説明 |
|---------|-----------|------|
| `read`, `fileread` | `file_read` | ファイル読み取り |
| `write`, `filewrite` | `file_edit` (write) | ファイル書き込み |
| `edit`, `fileedit` | `file_edit` (edit) | ファイル編集（diff） |
| `delete` | `file_edit` (delete) | ファイル削除 |
| `bash`, `shell`, `command` | `command_run` | コマンド実行 |
| `glob` | `search` | ファイル検索 |
| `grep` | `search` | コンテンツ検索 |
| `todowrite`, `todo` | `todo_management` | TODO管理 |

#### 特殊処理

##### ツールエントリの更新

Claude の `tool_use` と `tool_result` は別々のイベントとして出力されるため、内部マップで管理：

```typescript
toolEntryMap: Map<string, { index: number; entry: NormalizedEntry }>
```

1. `tool_use` イベント時: エントリを作成してマップに保存
2. `tool_result` イベント時: マップからエントリを取得し、結果を追加
3. JSON Patch `replace` 操作でフロントエンドに送信

### 5. Gemini/Cursor/Codex/Opencode ログソース

他のエージェントも `BaseExecutorLogSource` を継承し、それぞれのログフォーマットに対応した実装を提供します。

#### 共通の実装パターン

1. **ディレクトリ構造の定義**: エージェント固有のログ保存先
2. **プロジェクト検出**: ログディレクトリからプロジェクト一覧を抽出
3. **セッション検出**: プロジェクト内のセッションファイルを検索
4. **ログパース**: エージェント固有のJSONLフォーマットをパース
5. **正規化**: 共通の `NormalizedEntry` 形式に変換

特に `OpencodeLogSource` では、最新バージョンから `session/`, `message/`, `part/` ディレクトリを同時に監視し、メタデータ＋パートファイルを統合して `json_patch` を生成するようになりました。初回読み込み時に既存ファイルを正規化したのち、`chokidar` で追加・更新を検知し、ツール実行結果・テキストレスポンスをリアルタイムで反映します。

## 型定義 (`executors/types.ts`)

### NormalizedEntry

```typescript
interface NormalizedEntry {
  timestamp: string | null;
  entry_type: NormalizedEntryType;
  content: string;
  metadata: unknown;
}
```

### NormalizedEntryType

```typescript
type NormalizedEntryType =
  | { type: 'user_message' }
  | { type: 'assistant_message' }
  | { type: 'tool_use'; tool_name: string; action_type: ActionType }
  | { type: 'system_message' }
  | { type: 'error_message' }
  | { type: 'thinking' };
```

### ActionType

```typescript
type ActionType =
  | { action: 'file_read'; path: string }
  | { action: 'file_edit'; path: string; changes: FileChange[] }
  | { action: 'command_run'; command: string; result?: CommandRunResult }
  | { action: 'search'; query: string }
  | { action: 'web_fetch'; url: string }
  | { action: 'tool'; tool_name: string; arguments?: unknown; result?: ToolResult }
  | { action: 'task_create'; description: string }
  | { action: 'plan_presentation'; plan: string }
  | { action: 'todo_management'; todos: TodoItem[]; operation: string }
  | { action: 'other'; description: string };
```

### FileChange

```typescript
type FileChange =
  | { action: 'write'; content: string }
  | { action: 'delete' }
  | { action: 'rename'; new_path: string }
  | { action: 'edit'; unified_diff: string; has_line_numbers: boolean };
```

### JsonPatchOperation

```typescript
interface JsonPatchOperation {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: JsonPatchValue;
}
```

## ConversationPatch (`executors/conversationPatch.ts`)

JSON Patch生成のヘルパークラス。

### 主要メソッド

#### `addNormalizedEntry(entryIndex: number, entry: NormalizedEntry)`
正規化エントリを追加するJSON Patchを生成

#### `addStdout(entryIndex: number, content: string)`
標準出力を追加するJSON Patchを生成

#### `addStderr(entryIndex: number, content: string)`
標準エラーを追加するJSON Patchを生成

#### `replace(entryIndex: number, entry: NormalizedEntry)`
既存エントリを置換するJSON Patchを生成

#### `escapeJsonPointerSegment(s: string)`
RFC 6901に従ってJSON Pointerのセグメントをエスケープ

## Server-Sent Events (SSE) フォーマット

### イベントタイプ

#### `json_patch`
ログエントリの追加/更新

```
event: json_patch
data: [{"op":"add","path":"/entries/0","value":{...}}]
```

#### `finished`
ログストリームの終了

```
event: finished
data: {"message":"Log stream ended"}
```

#### `error`
エラー発生

```
event: error
data: {"error":"Failed to read file"}
```

## エラーハンドリング

### ファイル読み取りエラー
- ファイルが存在しない場合、エラーイベントを送信
- ログに記録し、ストリームを終了

### パースエラー
- 不正なJSON行はスキップ
- ログに警告を出力
- 処理を続行

### セッション未検出
- `null` を返却
- ログに記録

## 技術スタック

- **言語**: TypeScript 5.x
- **ファイル監視**: chokidar 3.x
- **ストリーミング**: Node.js Streams (Readable)
- **ファイルシステム**: Node.js `fs/promises`

## 依存関係

### 内部依存
- `../../../utils/src/logger`: ロガーユーティリティ
- `../execution/activeExecutionRegistry`: アクティブ実行レジストリ

### 外部依存
- `chokidar`: ファイル監視
- `stream`: Node.js Streams

## SDK利用時の考慮事項

### エクスポートすべき主要インターフェース

```typescript
// ファクトリ
export { LogSourceFactory } from './logSourceFactory';

// インターフェース
export type {
  ILogSourceStrategy,
  ProjectInfo,
  SessionInfo
} from './logSourceStrategy';

// ログソース実装
export {
  BaseExecutorLogSource,
  ClaudeLogSource,
  CursorLogSource,
  GeminiLogSource,
  CodexLogSource,
  OpencodeLogSource
} from './sources';

// 型定義
export type {
  NormalizedEntry,
  NormalizedEntryType,
  ActionType,
  FileChange,
  JsonPatchOperation
} from './executors/types';

// ユーティリティ
export { ConversationPatch } from './executors/conversationPatch';
```

### 使用例

```typescript
import { LogSourceFactory } from '@coding-agent-viewer/log-module';

const factory = new LogSourceFactory();

// すべて or 指定 Executor のプロジェクトを取得
const projects = await factory.getAllProjects('CLAUDE_CODE');
// 引数を省略すると全 Executor 分が返る

// セッション一覧を取得
const sessions = await factory.getSessionsForProject('CLAUDE_CODE:...');

// ログストリームを取得
const stream = await factory.getSessionStream('CLAUDE_CODE:...:uuid');

stream.on('data', (chunk) => {
  console.log(chunk.toString());
});
```

### カスタマイズポイント

1. **新しいログソースの追加**:
   ```typescript
   import { BaseExecutorLogSource } from './sources/baseExecutorLogSource';
   
   class MyAgentLogSource extends BaseExecutorLogSource {
     getName(): string {
       return 'MY_AGENT';
     }
     
     async getProjectList(): Promise<ProjectInfo[]> {
       // カスタム実装
     }
     
     async getSessionList(projectId: string): Promise<SessionInfo[]> {
       // カスタム実装
     }
     
     protected parseSessionLine(line: string): any {
       // カスタム実装
     }
   }
   
   // LogSourceFactory に登録
   this.executorSources.set('MY_AGENT', new MyAgentLogSource());
   ```

2. **正規化ロジックのカスタマイズ**:
   ```typescript
   protected toNormalizedEntry(entry: any): NormalizedEntry | null {
     // カスタムロジック
     if (entry.type === 'my_custom_type') {
       return {
         timestamp: null,
         entry_type: { type: 'assistant_message' },
         content: entry.message,
         metadata: entry
       };
     }
     
     return super.toNormalizedEntry(entry);
   }
   ```

3. **SSEフォーマットのカスタマイズ**:
   ```typescript
   protected processLineAndEmit(
     line: string,
     stream: Readable,
     entryIndexRef: { value: number }
   ): void {
     // カスタム処理
     const patch = this.myCustomPatchGenerator(line);
     stream.push(`event: custom\ndata: ${JSON.stringify(patch)}\n\n`);
   }
   ```

## 今後の拡張性

### パフォーマンス最適化
- ログファイルのインデックス化
- キャッシング戦略の実装
- 大きなファイルの分割読み込み

### 検索機能
- ログ内容の全文検索
- フィルタリング機能

### アーカイブ機能
- 古いログの圧縮
- S3などへのアーカイブ

### リアルタイム性の向上
- WebSocketへの移行
- より低レイテンシのストリーミング

### 分散対応
- 複数サーバー間でのログ集約
- クラスタリング対応
