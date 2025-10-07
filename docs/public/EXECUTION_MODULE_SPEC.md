# エージェント実行管理モジュール仕様書

## 概要

エージェント実行管理モジュールは、複数のAIコーディングエージェント（Claude Code, Cursor, Gemini, Codex, Opencode等）の実行を統一的に管理するためのモジュールです。プロファイルベースの設定管理、プロセスのライフサイクル管理、セッションID解決、アクティブプロセスの追跡などの機能を提供します。

## モジュール構成

### ディレクトリ構造

```
services/src/execution/
├── index.ts                      # モジュールエクスポート
├── executionService.ts           # 実行サービスのメインクラス
├── activeExecutionRegistry.ts    # アクティブプロセスレジストリ
├── profileRegistry.ts            # プロファイル設定レジストリ
├── types.ts                      # 型定義
└── profiles/                     # エージェント別プロファイル定義
    ├── index.ts                  # プロファイルのエクスポート
    ├── claudeCode.ts            # Claude Code プロファイル
    ├── cursor.ts                # Cursor プロファイル
    ├── gemini.ts                # Gemini プロファイル
    ├── codex.ts                 # Codex プロファイル
    └── opencode.ts              # Opencode プロファイル
```

## 主要コンポーネント

### 1. ExecutionService (`executionService.ts`)

エージェント実行のメインサービスクラス。新規チャットの開始、フォローアップメッセージの送信、実行の停止などを管理します。

#### 主要機能

##### `startNewChat(request: NewChatRequest): Promise<ExecutionResult>`

**説明**: 新しいチャットセッションを開始

**パラメータ**:
```typescript
interface NewChatRequest extends ExecutionContext {
  prompt: string;  // 初回プロンプト
}

interface ExecutionContext {
  profileLabel: string;      // プロファイルラベル（例: "claude-code"）
  variantLabel?: string;     // バリアントラベル（例: "plan"）
  executorType: string;      // Executor Type（例: "CLAUDE_CODE"）
  projectId: string;         // プロジェクトID（複合形式）
  actualProjectId: string;   // 実際のプロジェクトID
  workspacePath: string;     // ワークスペースのパス
}
```

**戻り値**:
```typescript
interface ExecutionResult {
  sessionId: string;         // セッションID（最終的に解決されたもの）
  processId: number | null;  // プロセスID
  startedAt: Date;          // 開始日時
  projectId: string;        // プロジェクトID
  kind: 'new' | 'follow-up'; // 実行種別
}
```

**処理フロー**:
1. セッションIDの生成（UUID）
2. ワークスペースの存在確認
3. プロファイルとコマンドの取得
4. プロセスパラメータの構築
5. 環境変数の設定
6. 子プロセスのスポーン
7. セッションID解決の待機（必要に応じて）
8. 実行結果の返却

##### `sendFollowUp(request: FollowUpRequest): Promise<ExecutionResult>`

**説明**: 既存のセッションにフォローアップメッセージを送信

**パラメータ**:
```typescript
interface FollowUpRequest extends ExecutionContext {
  sessionId: string;  // 既存のセッションID
  message: string;    // フォローアップメッセージ
}
```

**処理フロー**: `startNewChat` と同様だが、既存のセッションIDを使用

##### `stopExecution(sessionId: string): boolean`

**説明**: 実行中のセッションを停止

**パラメータ**:
- `sessionId`: 停止するセッションID

**戻り値**:
- `true`: 停止成功
- `false`: セッションが見つからない

**処理フロー**:
1. アクティブプロセスマップからプロセスを取得
2. プロセスに `SIGTERM` シグナルを送信
3. プロセスをマップとレジストリから削除

#### セッションID管理

##### セッションID形式
```
{EXECUTOR_TYPE}:{ACTUAL_PROJECT_ID}:{SESSION_UUID}
```

例: `CLAUDE_CODE:L1VzZXJzL25vZ2F0YWthL2Rldi9wcm9qZWN0:550e8400-e29b-41d4-a716-446655440000`

##### セッションID解決

一部のエージェント（Geminiなど）は、実行開始後にセッションIDが確定します。`ExecutionService` は以下の方法でセッションIDを解決します：

1. **Stdout からの抽出**: `SessionIdResolver` を使用
2. **ファイルシステムの監視**: `resolveSessionId` 関数を使用（プロファイル固有）
3. **タイムアウト**: 30秒後にミントされたIDをそのまま使用

**セッションID解決のタイムアウト**: 30秒（`SESSION_ID_RESOLUTION_TIMEOUT_MS`）

##### セッションIDの更新

セッションIDが解決されると、以下が更新されます：
1. アクティブプロセスマップのキー
2. アクティブ実行レジストリのエントリ
3. 内部の `currentSessionId` 変数

#### プロセスパラメータ構築

##### デフォルト実装
```typescript
{
  args: [...command.args],
  stdinPayload?: string  // プロンプトまたはメッセージ
}
```

##### カスタム実装
プロファイル定義で `buildProcessParameters` 関数を提供することで、カスタムパラメータ構築が可能：

```typescript
buildProcessParameters?: (
  command: CommandConfig,
  request: LaunchRequest
) => ProcessParameters;
```

#### 環境変数の設定

すべての実行プロセスに以下の環境変数が設定されます：

| 変数名 | 説明 | 例 |
|-------|------|---|
| `NORMALIZED_EXECUTION_KIND` | 実行種別 | "new" または "follow-up" |
| `NORMALIZED_EXECUTION_PROFILE` | プロファイルラベル | "claude-code" |
| `NORMALIZED_EXECUTION_PROJECT_ID` | プロジェクトID | "CLAUDE_CODE:..." |
| `NORMALIZED_EXECUTION_ACTUAL_PROJECT_ID` | 実際のプロジェクトID | "..." |
| `NORMALIZED_EXECUTION_WORKSPACE` | ワークスペースパス | "/path/to/workspace" |
| `NORMALIZED_EXECUTION_SESSION_ID` | セッションID | "CLAUDE_CODE:...:uuid" |
| `NORMALIZED_EXECUTION_VARIANT` | バリアントラベル | "plan"（設定時のみ） |

プロファイル固有の環境変数も `command.env` から追加されます。

#### ログ出力

実行中のプロセスの標準出力/標準エラーは、プレフィックス付きで親プロセスに出力されます：

```
[execution:{sessionId}] {output}
```

### 2. ActiveExecutionRegistry (`activeExecutionRegistry.ts`)

アクティブな実行セッションを追跡するレジストリ。

#### 主要機能

##### `register(sessionId: string): void`
セッションIDをアクティブセッションとして登録

##### `unregister(sessionId: string): void`
セッションIDをアクティブセッションから削除

##### `updateSessionId(oldSessionId: string, newSessionId: string): void`
セッションIDの更新（セッションID解決時に使用）

##### `isActive(sessionId: string): boolean`
セッションがアクティブかどうかを確認

#### 実装

内部で `Set<string>` を使用してアクティブセッションを管理。

#### 使用例
```typescript
import { activeExecutionRegistry } from './activeExecutionRegistry';

// セッション開始時
activeExecutionRegistry.register(sessionId);

// セッション終了時
activeExecutionRegistry.unregister(sessionId);

// 状態確認
if (activeExecutionRegistry.isActive(sessionId)) {
  // セッションはまだ実行中
}
```

#### グローバルインスタンス
```typescript
export const activeExecutionRegistry = new ActiveExecutionRegistry();
```

### 3. ProfileRegistry (`profileRegistry.ts`)

プロファイル設定を管理するレジストリ。

#### 主要機能

##### `getProfile(label: string): ProfileConfig | undefined`
プロファイルラベルからプロファイル設定を取得

##### `getVariant(label: string, variantLabel?: string): ProfileVariantConfig | null`
プロファイルとバリアントラベルからバリアント設定を取得

##### `getCommand(label: string, variantLabel?: string): CommandConfig | null`
プロファイルとバリアントラベルからコマンド設定を取得

**処理フロー**:
1. バリアントラベルが指定されている場合、バリアントのコマンドを取得
2. バリアントが見つからない場合、プロファイルのデフォルトコマンドを取得

#### 初期化

レジストリは遅延初期化されます（最初のアクセス時）：
1. `profileDefinitions` からすべてのプロファイルを読み込み
2. コマンド設定を正規化
3. バリアント設定を正規化
4. 内部マップに格納

#### コマンド正規化

コマンド設定の正規化処理：
- `binary` フィールドの検証（空でない文字列）
- `args` 配列のフィルタリング（文字列のみ）
- `env` オブジェクトのコピー

### 4. プロファイル定義 (`profiles/`)

各エージェントのプロファイル定義。

#### ProfileDefinition 型

```typescript
interface ProfileDefinition {
  label: string;                    // プロファイルラベル
  command: CommandConfig;           // デフォルトコマンド
  variants?: ProfileVariantConfig[]; // バリアント設定
  buildProcessParameters?: ProcessParameterBuilder; // カスタムパラメータ構築
}
```

#### CommandConfig 型

```typescript
interface CommandConfig {
  binary: string;           // 実行バイナリ
  args: string[];          // コマンドライン引数
  env?: Record<string, string>; // 環境変数
}
```

#### Claude Code プロファイル (`claudeCode.ts`)

```typescript
{
  label: 'claude-code',
  command: {
    binary: 'npx',
    args: [
      '-y',
      '@anthropic-ai/claude-code@latest',
      '-p',
      '--dangerously-skip-permissions',
      '--verbose',
      '--output-format=stream-json'
    ]
  },
  variants: [
    {
      label: 'plan',
      command: {
        binary: 'npx',
        args: [
          '-y',
          '@anthropic-ai/claude-code@latest',
          '-p',
          '--permission-mode=plan',
          '--verbose',
          '--output-format=stream-json'
        ]
      }
    }
  ]
}
```

#### Cursor プロファイル (`cursor.ts`)

```typescript
{
  label: 'cursor',
  command: {
    binary: 'cursor-agent',
    args: ['-p', '--output-format=stream-json', '--force']
  }
}
```

#### Gemini プロファイル (`gemini.ts`)

**特徴**: カスタムセッションID解決ロジックを実装

```typescript
{
  label: 'gemini',
  command: {
    binary: 'npx',
    args: ['-y', '@google/gemini-cli@latest', '--yolo']
  },
  variants: [
    {
      label: 'flash',
      command: {
        binary: 'npx',
        args: ['-y', '@google/gemini-cli@latest', '--yolo', '--model', 'gemini-2.5-flash']
      }
    }
  ],
  buildProcessParameters: buildGeminiParameters
}
```

##### Gemini セッションID解決

Geminiは実行開始後、`~/.gemini/tmp/{projectId}/chats/` ディレクトリにセッションファイルを作成します。

**解決ロジック**:
1. 定期的にディレクトリをスキャン（500msごと）
2. `session-*.json` ファイルを検索
3. ファイルの更新日時が実行開始時刻以降のものをフィルタ
4. 最新のファイルのセッションIDを抽出
5. タイムアウト（30秒）まで繰り返し

**許容時間差**: 5秒（`SESSION_STALENESS_ALLOWANCE_MS`）

#### Codex プロファイル (`codex.ts`)

```typescript
{
  label: 'codex',
  command: {
    binary: 'npx',
    args: ['-y', '@codex/cli@latest']
  }
}
```

#### Opencode プロファイル (`opencode.ts`)

```typescript
{
  label: 'opencode',
  command: {
    binary: 'npx',
    args: ['-y', 'opencode@latest']
  }
}
```

## 型定義 (`types.ts`)

### ExecutionKind
```typescript
type ExecutionKind = 'new' | 'follow-up';
```

### ExecutionContext
```typescript
interface ExecutionContext {
  profileLabel: string;
  variantLabel?: string | null;
  executorType: string;
  projectId: string;
  actualProjectId: string;
  workspacePath: string;
}
```

### NewChatRequest
```typescript
interface NewChatRequest extends ExecutionContext {
  prompt: string;
}
```

### FollowUpRequest
```typescript
interface FollowUpRequest extends ExecutionContext {
  sessionId: string;
  message: string;
}
```

### ExecutionResult
```typescript
interface ExecutionResult {
  sessionId: string;
  processId: number | null;
  startedAt: Date;
  projectId: string;
  kind: ExecutionKind;
}
```

### SessionIdResolver
```typescript
interface SessionIdResolver {
  handleChunk: (chunk: string) => string | null;
}
```

### ProcessParameters
```typescript
interface ProcessParameters {
  args: string[];
  stdinPayload?: string;
  createSessionIdResolver?: () => SessionIdResolver;
  resolveSessionId?: (context: SessionResolutionContext) => Promise<string | null>;
}
```

## エラーハンドリング

### ワークスペース検証
- ワークスペースパスが存在しない場合、エラーをスロー
- エラーメッセージ: `Workspace path does not exist: {path}`

### プロファイル検証
- プロファイルが見つからない場合、エラーをスロー
- エラーメッセージ: `Profile config not found for {label}`

### コマンド検証
- コマンドが見つからない場合、エラーをスロー
- エラーメッセージ: `Profile command not found for {label}`

### プロセス起動エラー
- 子プロセスの起動に失敗した場合、`error` イベントをログ出力
- アクティブ実行レジストリから登録解除

## 技術スタック

- **言語**: TypeScript 5.x
- **プロセス管理**: Node.js `child_process.spawn`
- **ファイルシステム**: Node.js `fs/promises`
- **UUID生成**: Node.js `crypto.randomUUID`

## 依存関係

### 内部依存
- `./profileRegistry`: プロファイルレジストリ
- `./activeExecutionRegistry`: アクティブ実行レジストリ
- `./profiles`: プロファイル定義

### 外部依存
- `child_process`: 子プロセス管理
- `crypto`: UUID生成
- `fs/promises`: ファイルシステムアクセス

## SDK利用時の考慮事項

### エクスポートすべき主要インターフェース

```typescript
// メインサービス
export { ExecutionService } from './executionService';

// レジストリ
export { ProfileRegistry } from './profileRegistry';
export { activeExecutionRegistry } from './activeExecutionRegistry';

// 型定義
export type {
  ExecutionKind,
  ExecutionContext,
  NewChatRequest,
  FollowUpRequest,
  ExecutionResult,
  CommandConfig,
  ProfileConfig,
  ProfileDefinition,
  ProcessParameters
} from './types';

// プロファイル定義
export { profileDefinitions } from './profiles';
```

### 使用例

```typescript
import { ExecutionService, NewChatRequest } from '@coding-agent-viewer/execution-module';

const executionService = new ExecutionService();

const request: NewChatRequest = {
  profileLabel: 'claude-code',
  variantLabel: 'plan',
  executorType: 'CLAUDE_CODE',
  projectId: 'CLAUDE_CODE:base64encodedpath',
  actualProjectId: 'base64encodedpath',
  workspacePath: '/path/to/workspace',
  prompt: 'Create a new React component'
};

const result = await executionService.startNewChat(request);
console.log(`Session started: ${result.sessionId}`);
```

### カスタマイズポイント

1. **新しいプロファイルの追加**:
   ```typescript
   // profiles/myAgent.ts
   export const myAgentProfile: ProfileDefinition = {
     label: 'my-agent',
     command: {
       binary: 'my-agent-cli',
       args: ['--mode', 'code']
     }
   };
   
   // profiles/index.ts
   export const profileDefinitions = [
     // ... existing profiles
     myAgentProfile
   ];
   ```

2. **カスタムセッションID解決**:
   ```typescript
   buildProcessParameters: (command, request) => ({
     args: [...command.args],
     stdinPayload: request.kind === 'new' ? request.prompt : request.message,
     resolveSessionId: async (context) => {
       // カスタムロジック
       return await myCustomResolver(context);
     }
   })
   ```

3. **環境変数の追加**:
   ```typescript
   command: {
     binary: 'my-cli',
     args: [],
     env: {
       MY_API_KEY: process.env.MY_API_KEY,
       MY_MODEL: 'my-model-v1'
     }
   }
   ```

## 今後の拡張性

### プロセス監視の強化
- プロセスのヘルスチェック
- 自動再起動機能
- リソース使用量の監視

### プロファイル設定の永続化
- データベースまたはファイルへの保存
- 実行時のプロファイル更新

### 実行履歴の管理
- 実行ログの永続化
- 実行統計の収集

### プロセス間通信の拡張
- WebSocketによる双方向通信
- より高度な制御コマンド

### セキュリティの強化
- プロファイルごとの権限管理
- サンドボックス実行環境
