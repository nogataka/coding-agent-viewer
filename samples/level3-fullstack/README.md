# レベル3: フルスタック

このサンプルは、フロントエンド + バックエンドAPIの完全なアプリケーションです。

## 概要

- **利用モジュール**: `frontend` + `api-module` (内部で `execution-module`, `log-module` を使用)
- **完全なWebアプリ**: ブラウザからすぐに使える
- **用途**: エンドユーザー向けアプリケーション、デモ、評価版

## ディレクトリ構造

```
level3-fullstack/
├── README.md
├── package.json
├── start.js                # フルスタック起動スクリプト
├── config/
│   └── config.js          # 統合設定
└── docker/
    ├── Dockerfile
    └── docker-compose.yml
```

## インストール

```bash
cd samples/level3-fullstack
npm install
```

## 起動方法

### ワンコマンド起動（推奨）

```bash
npm start
```

これで以下が起動します：
- **バックエンドAPI**: `http://localhost:3001`
- **フロントエンド**: `http://localhost:3000`

ブラウザが自動的に開きます。

### 個別起動

```bash
# バックエンドのみ
npm run start:backend

# フロントエンドのみ（別ターミナルで）
npm run start:frontend
```

### 開発モード

```bash
# バックエンド + フロントエンド（ホットリロード）
npm run dev
```

### 本番ビルド

```bash
# ビルド
npm run build

# 本番モードで起動
npm run start:prod
```

### Docker で起動

```bash
# ビルドと起動
docker-compose up --build

# バックグラウンドで起動
docker-compose up -d
```

アクセス:
- フロントエンド: `http://localhost:3000`
- API: `http://localhost:3001`

## 使用方法

### 1. ブラウザを開く

```
http://localhost:3000
```

### 2. プロジェクトを選択

- 左サイドバーからプロジェクトを選択
- プロジェクトがない場合は、自動的にワークスペースから検出

### 3. エージェントを実行

1. プロファイルを選択（Claude Code, Cursor, Gemini等）
2. プロンプトを入力
3. 「Execute」ボタンをクリック

### 4. ログをリアルタイム表示

- 実行中のログがリアルタイムで表示されます
- ユーザーメッセージ、アシスタントメッセージ、ツール実行が色分けされます

### 5. セッション履歴

- 過去の実行履歴を確認
- クリックして詳細ログを表示

## 機能

### プロジェクト管理
- ✅ プロジェクト一覧表示
- ✅ プロジェクトの自動検出
- ✅ プロファイルごとのフィルタ

### タスク実行
- ✅ 新規タスクの実行
- ✅ フォローアップメッセージの送信
- ✅ 実行中のタスクの停止
- ✅ プロファイルとバリアントの選択

### ログ表示
- ✅ リアルタイムログストリーミング
- ✅ ログエントリの種類ごとの色分け
- ✅ タイムスタンプ表示
- ✅ ツール実行の詳細表示

### UI/UX
- ✅ レスポンシブデザイン
- ✅ ダークモード対応
- ✅ キーボードショートカット
- ✅ ローディングインジケーター

## 設定

### 環境変数

`.env` ファイルを作成：

```bash
# バックエンドAPI
BACKEND_PORT=3001
BACKEND_HOST=127.0.0.1

# フロントエンド
FRONTEND_PORT=3000
FRONTEND_HOST=127.0.0.1

# エージェントのAPIキー
ANTHROPIC_API_KEY=your_api_key
GOOGLE_AI_API_KEY=your_api_key

# ログレベル
LOG_LEVEL=info
```

### フロントエンドのAPI URL設定

開発時は自動的に `http://localhost:3001` を使用しますが、
本番環境では環境変数で指定できます：

```bash
VITE_API_URL=https://api.your-domain.com npm run build
```

## カスタマイズ

### テーマのカスタマイズ

フロントエンドの `src/styles/theme.css` を編集：

```css
:root {
  --primary-color: #your-color;
  --background-color: #your-bg;
  /* ... */
}
```

### プロファイルの追加

バックエンドの `backend/services/src/execution/profiles/` に新しいプロファイルを追加。

### UIコンポーネントの追加

フロントエンドの `src/components/` に新しいコンポーネントを追加。

## デプロイ

### Vercel + Railway

#### Railway (バックエンド)

```bash
# Railwayにデプロイ
railway init
railway up

# 環境変数を設定
railway variables set ANTHROPIC_API_KEY=your_key
```

#### Vercel (フロントエンド)

```bash
# Vercelにデプロイ
vercel

# 環境変数を設定
vercel env add VITE_API_URL
# → https://your-railway-app.railway.app を入力
```

### Docker + Nginx

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  frontend:
    build:
      context: ../../frontend
      dockerfile: Dockerfile
    environment:
      - VITE_API_URL=http://api:3001

  api:
    build:
      context: ../../backend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - frontend
      - api
```

### Kubernetes

Helm チャートまたはKubernetesマニフェストを使用：

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coding-agent-viewer
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: frontend
        image: coding-agent-viewer/frontend:latest
        ports:
        - containerPort: 3000
      - name: api
        image: coding-agent-viewer/api:latest
        ports:
        - containerPort: 3001
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: agent-secrets
              key: anthropic-api-key
```

## パフォーマンス最適化

### フロントエンド

```bash
# ビルド最適化
npm run build -- --mode production

# バンドルサイズの分析
npm run build -- --analyze
```

### バックエンド

```bash
# Node.jsクラスタリング
NODE_ENV=production pm2 start server.js -i max

# キャッシング
# Redis等を使用してプロジェクト一覧をキャッシュ
```

## モニタリング

### ログ

```bash
# バックエンドログ
tail -f logs/backend.log

# フロントエンドログ（ブラウザコンソール）
# DevToolsで確認
```

### メトリクス

Prometheus + Grafana を使用：

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'coding-agent-api'
    static_configs:
      - targets: ['localhost:3001']
```

### エラートラッキング

Sentry等を統合：

```javascript
// frontend/src/main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: process.env.NODE_ENV
});
```

## トラブルシューティング

### フロントエンドがバックエンドに接続できない

1. バックエンドが起動しているか確認：
   ```bash
   curl http://localhost:3001/health
   ```

2. CORS設定を確認

3. API URLを確認：
   ```javascript
   console.log(import.meta.env.VITE_API_URL);
   ```

### ビルドエラー

```bash
# 依存関係を再インストール
rm -rf node_modules package-lock.json
npm install
```

### ポートが使用中

```bash
# ポートを変更
FRONTEND_PORT=3001 BACKEND_PORT=3002 npm start
```

## ユースケース

1. **デモ・評価**: 5分で完全なアプリを起動してデモ
2. **社内ツール**: 開発チーム向けのAIアシスタント
3. **プロトタイプ**: 新機能のプロトタイプ開発
4. **学習**: コードを読んでアーキテクチャを学ぶ
5. **カスタマイズのベース**: 自社向けにカスタマイズ

## 次のステップ

1. **認証の追加**: Auth0やFirebase Authを統合
2. **データベース**: セッション履歴をDBに保存
3. **マルチユーザー**: ユーザーごとにワークスペースを分離
4. **チーム機能**: チームでプロジェクトを共有
5. **通知機能**: 実行完了時にSlack/Email通知

## サポート

問題が発生した場合：

1. ログを確認
2. GitHubでIssueを作成
3. Discordコミュニティで質問

---

**楽しいコーディングを！** 🚀
