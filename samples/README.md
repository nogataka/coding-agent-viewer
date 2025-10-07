# サンプルアプリケーション

このディレクトリには、Coding Agent Viewerの3つの利用レベルに対応したサンプルアプリケーションが含まれています。

## 📚 サンプル一覧

### [Level 1: ライブラリとして直接利用](./level1-library/)

**対象**: CLIツール、バッチ処理、既存アプリへの組み込み

**特徴**:
- ✅ HTTP不要、軽量
- ✅ Node.jsから直接呼び出し
- ✅ フルコントロール

**使用モジュール**:
```javascript
import { ExecutionService } from '@nogataka/coding-agent-viewer-sdk/services/execution';
import { LogSourceFactory } from '@nogataka/coding-agent-viewer-sdk/services/logs';
```

**起動方法**:
```bash
cd level1-library
npm install
node cli.js --help
```

**ユースケース**:
- CLIツール開発
- CI/CDパイプライン
- Electron/Tauriアプリ
- Next.js Server Actionsでの利用

---

### [Level 2: バックエンドAPI](./level2-api/)

**対象**: カスタムフロントエンド開発、モバイルアプリ、マイクロサービス

**特徴**:
- ✅ REST API + Server-Sent Events
- ✅ フロントエンド非依存
- ✅ Docker対応

**使用モジュール**:
```javascript
import { setupRoutes } from '@nogataka/coding-agent-viewer-sdk/server/routes';
import { errorHandler } from '@nogataka/coding-agent-viewer-sdk/server/middleware/errorHandler.js';
```
内部で `services/execution` と `services/logs` を使用

**起動方法**:
```bash
cd level2-api
npm install
npm run dev
```

**アクセス**: `http://localhost:3001`

**ユースケース**:
- React/Vue/Angularフロントエンドの開発
- モバイルアプリ（React Native/Flutter）
- APIゲートウェイ経由のアクセス
- マイクロサービスアーキテクチャ

---

### [Level 3: フルスタック](./level3-fullstack/)

**対象**: エンドユーザー、デモ、評価版

**特徴**:
- ✅ フロントエンド + バックエンド
- ✅ ワンコマンドで起動
- ✅ ブラウザ自動起動
- ✅ 完全なWebアプリ

**使用モジュール**:
- React製フロントエンド
- APIサーバー（`server/routes`）
- 内部で `services/execution` と `services/logs` を使用

**起動方法**:
```bash
cd level3-fullstack
npm install
npm start
```

**アクセス**:
- Frontend: `http://localhost:3000`
- API: `http://localhost:3001`

**ユースケース**:
- 5分でデモ実行
- 社内向けツール
- プロトタイプ開発
- エンドユーザー向けアプリ

---

## 🎯 どのレベルを選ぶべきか？

### Level 1を選ぶべき場合

- ✅ 既存のNode.jsアプリに組み込みたい
- ✅ CLIツールを作りたい
- ✅ CI/CDで使いたい
- ✅ 完全なコントロールが必要
- ✅ HTTPオーバーヘッドを避けたい

**例**:
```javascript
import { ExecutionService } from '@coding-agent-viewer/execution-module';
const executor = new ExecutionService();
await executor.startNewChat({...});
```

---

### Level 2を選ぶべき場合

- ✅ カスタムフロントエンドを作りたい
- ✅ モバイルアプリのバックエンドとして使いたい
- ✅ 複数のクライアントからアクセスしたい
- ✅ マイクロサービスの一部として使いたい

**例**:
```javascript
// フロントエンドから
const response = await fetch('http://localhost:3001/api/task-attempts', {
  method: 'POST',
  body: JSON.stringify({ projectId, prompt })
});
```

---

### Level 3を選ぶべき場合

- ✅ すぐに使える完全なアプリが欲しい
- ✅ デモや評価をしたい
- ✅ エンドユーザー向けにデプロイしたい
- ✅ カスタマイズのベースが欲しい

**例**:
```bash
npm start
# → ブラウザが開いてすぐに使える！
```

---

## 📊 比較表

| 項目 | Level 1 | Level 2 | Level 3 |
|-----|---------|---------|---------|
| **起動の簡単さ** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **カスタマイズ性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **リソース消費** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **エンドユーザー向き** | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **開発者向き** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **HTTP不要** | ✅ | ❌ | ❌ |
| **UI付き** | ❌ | ❌ | ✅ |
| **Docker対応** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🚀 クイックスタート

### 全サンプルを試す

```bash
# Level 1（ライブラリとして直接利用）
cd /Users/nogataka/dev/coding-agent-viewer/samples/level1-library
npm install
npm run ink  # または npm run simple

# Level 2（APIサーバー）
cd /Users/nogataka/dev/coding-agent-viewer/samples/level2-api
npm install
npm run dev
# 別ターミナルで
npm run test:api

# Level 3（フルスタック）
cd /Users/nogataka/dev/coding-agent-viewer/samples/level3-fullstack
npm install
npm start
# → ブラウザが開く
```

---

## 📦 各サンプルの構成

### Level 1 (ライブラリ)

```
level1-library/
├── README.md
├── package.json
├── cli.js                    # CLI エントリーポイント
└── src/
    ├── execute-agent.js     # エージェント実行
    ├── list-projects.js     # プロジェクト一覧
    ├── list-sessions.js     # セッション一覧
    └── stream-logs.js       # ログストリーミング
```

### Level 2 (API)

```
level2-api/
├── README.md
├── package.json
├── server.js                 # APIサーバー
├── examples/
│   ├── test-api.js          # APIテスト
│   └── sse-client.js        # SSEクライアント
└── docker/
    ├── Dockerfile
    └── docker-compose.yml
```

### Level 3 (フルスタック)

```
level3-fullstack/
├── README.md
├── package.json
├── start.js                  # フルスタック起動
└── docker/
    └── docker-compose.yml
```

---

## 🔧 セットアップ

### 前提条件

- Node.js 18+
- npm または yarn
- Git

### 環境変数

各サンプルで `.env` ファイルを作成：

```bash
# エージェントのAPIキー
ANTHROPIC_API_KEY=your_api_key
GOOGLE_AI_API_KEY=your_api_key

# ポート設定（Level 2, 3）
BACKEND_PORT=3001
FRONTEND_PORT=3000
```

### npmパッケージの使用

Level 1とLevel 2のサンプルは公開されたnpmパッケージ `@nogataka/coding-agent-viewer-sdk@latest` を使用します。

**バックエンドのビルドは不要**です。各サンプルディレクトリで `npm install` するだけで動作します。

> **Note**: Level 3 (Full-stack) のみ、親ディレクトリの `backend/` と `frontend/` を直接起動するため、それらの依存関係インストールが必要です：
> ```bash
> cd /Users/nogataka/dev/coding-agent-viewer
> npm run install:all
> ```

---

## 💡 学習パス

### 初心者向け

1. **Level 3から始める**: 完全なアプリを起動して動作を確認
2. **Level 2を試す**: APIエンドポイントを理解
3. **Level 1で応用**: 自分のアプリに組み込む

### 開発者向け

1. **Level 1から始める**: コアAPIを理解
2. **Level 2で拡張**: HTTP層を追加
3. **Level 3で統合**: 完全なアプリを構築

---

## 📚 参考資料

- [モジュール化戦略](../docs/MODULARIZATION_STRATEGY.md)
- [APIモジュール仕様](../backend/docs/API_MODULE_SPEC.md)
- [実行管理モジュール仕様](../backend/docs/EXECUTION_MODULE_SPEC.md)
- [ログ管理モジュール仕様](../backend/docs/LOG_MODULE_SPEC.md)

---

## 🤝 コントリビューション

新しいサンプルを追加したい場合：

1. 対応するレベルのディレクトリを作成
2. README.mdを含める
3. 実行可能な状態にする
4. Pull Requestを作成

---

## ❓ よくある質問

### Q: どのサンプルが最も人気？
A: Level 3（フルスタック）が最も人気です。すぐに動作を確認できるため。

### Q: 本番環境で使える？
A: はい。Level 2またはLevel 3をDockerでデプロイすることを推奨します。

### Q: カスタマイズしたい
A: Level 1から始めて、必要に応じてLevel 2, 3を参考にしてください。

### Q: ライセンスは？
A: MITライセンスです。自由に使用、改変、配布できます。

---

**Happy Coding!** 🎉
