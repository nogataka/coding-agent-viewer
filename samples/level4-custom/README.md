# Level4 Custom Web Chat Sample

Coding Agent Viewer の **タスク実行 API** (`/api/task-attempts`) と **正規化ログ SSE** (`/api/execution-processes/:id/normalized-logs`) を組み合わせたフロントエンドサンプルです。ブラウザだけでプロンプトを送信し、エージェントの進捗を Server-Sent Events でリアルタイムに確認できます。

## 前提条件

1. Coding Agent Viewer 本体がローカルで起動していること（例: `http://localhost:3001`）。
2. ルートで依存解決が済んでいること（`pnpm install` など）。
3. 実行したいプロファイルに対応するプロジェクト（ワークスペース）が既に存在すること。

## セットアップ

```bash
cd samples/level4-custom
pnpm install
# または
pnpm install --filter ./samples/level4-custom
```

依存は Vite のみなので、ワークスペース経由でインストール済みであればこの手順は省略できます。

## 開発サーバーの起動

```bash
pnpm dev
```

ブラウザで <http://localhost:5174> を開き、以下を入力します。

- **Profile**: `/api/profiles` の結果からロードされるプロファイルラベル。
- **Project**: 選択したプロファイルの既存プロジェクト。`/api/projects?profile=...` で取得しています。
- **Workspace Path (任意)**: 既存ディレクトリを指定するとプロジェクト選択を上書きし、そのパスで実行します。
- **Prompt**: 実行したい指示内容。

送信すると `/api/task-attempts` に `projectId` と `prompt` を POST し、戻り値の `sessionId` を使って `/api/execution-processes/:id/normalized-logs` へ SSE 接続を開始します。ログは正規化された JSON Patch を解釈し、アシスタント応答・ツール出力・システムメッセージを逐次表示します。

## API エンドポイントの切り替え

既定では `http://localhost:3001` を使用します。別ポート/ホストでサーバーを起動している場合は、Vite の環境変数 `VITE_CAV_API` でベース URL を変更できます。

```bash
VITE_CAV_API=http://localhost:4000 pnpm dev
```

`.env.local` などに設定しても構いません。

## ビルドとプレビュー

```bash
pnpm build
pnpm preview
```

`pnpm preview` はビルド済みアセットを Vite のプレビューサーバーで配信します。

## 仕組みの概要

1. 起動時に `/api/profiles` からプロファイル一覧を取得し、ドロップダウンに反映します。
2. プロファイル選択時に `/api/projects?profile=...` で既存プロジェクトを取得し、選択肢を更新します。
3. フォーム送信で `/api/task-attempts` に `projectId` と `prompt` を送信し、新しいセッションを開始します。
4. 戻り値の `sessionId` に対して `/api/execution-processes/:id/normalized-logs` へ SSE 接続し、`json_patch` イベントを解析して画面に反映します。
5. `finished` イベントでストリームを終了し、UI を再び入力可能な状態に戻します。

このサンプルをベースに、任意の UI から Coding Agent Viewer のタスク実行 API を利用するアプリケーションを構築できます。
