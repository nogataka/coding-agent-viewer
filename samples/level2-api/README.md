# レベル2: バックエンドAPI

このサンプルは、APIサーバーを起動してHTTP経由でエージェント機能にアクセスする形態です。

## 概要

- **利用モジュール**: `api-module` (内部で `execution-module`, `log-module` を使用)
- **HTTP経由**: REST API + Server-Sent Events
- **用途**: カスタムフロントエンド開発、モバイルアプリ、マイクロサービス

## ディレクトリ構造

```
level2-api/
├── README.md
├── package.json
├── server.js               # APIサーバーエントリーポイント
├── config/
│   └── config.js          # サーバー設定
├── examples/
│   ├── test-api.js        # APIテストスクリプト
│   └── sse-client.js      # SSEクライアント例
└── docker/
    ├── Dockerfile
    └── docker-compose.yml
```

## 前提条件

バックエンドのビルドが必要です：

```bash
# プロジェクトルートで
cd /Users/nogataka/dev/coding-agent-viewer/backend
npm run build
```

## インストール

```bash
cd samples/level2-api
npm install
```

## 起動方法

### 開発モード

```bash
npm run dev
```

サーバーが起動します：
- **API**: `http://localhost:3001`
- **Health Check**: `http://localhost:3001/health`

### 本番モード

```bash
npm start
```

### Docker で起動

```bash
docker-compose up
```

## API エンドポイント

### プロジェクト管理

#### GET `/api/projects`

プロジェクト一覧を取得

**Query Parameters**:
- `profile` (optional): プロファイルでフィルタ（例: `claude-code`）

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "CLAUDE_CODE:L1VzZXJz...",
      "name": "/Users/user/project",
      "git_repo_path": "/Users/user/project",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**例**:
```bash
curl http://localhost:3001/api/projects
curl http://localhost:3001/api/projects?profile=claude-code
```

### タスク管理

#### GET `/api/tasks?project_id=<id>`

指定されたプロジェクトのタスク（セッション）一覧を取得

**Query Parameters**:
- `project_id` (required): プロジェクトID

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "CLAUDE_CODE:...:uuid",
      "project_id": "CLAUDE_CODE:...",
      "title": "Create a README file",
      "status": "done",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**例**:
```bash
curl "http://localhost:3001/api/tasks?project_id=CLAUDE_CODE:L1VzZXJz..."
```

#### GET `/api/tasks/:id`

指定されたタスクの詳細を取得

**例**:
```bash
curl http://localhost:3001/api/tasks/CLAUDE_CODE:...:uuid
```

### タスク実行

#### POST `/api/task-attempts`

新しいタスク実行を開始

**Request Body**:
```json
{
  "projectId": "CLAUDE_CODE:L1VzZXJz...",
  "prompt": "Create a new React component",
  "variantLabel": null
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "sessionId": "CLAUDE_CODE:...:uuid",
    "processId": 12345,
    "startedAt": "2024-01-01T00:00:00.000Z",
    "projectId": "CLAUDE_CODE:...",
    "kind": "new"
  }
}
```

**例**:
```bash
curl -X POST http://localhost:3001/api/task-attempts \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "CLAUDE_CODE:L1VzZXJz...",
    "prompt": "Create a README file"
  }'
```

#### POST `/api/task-attempts/:sessionId/follow-up`

既存のセッションにフォローアップメッセージを送信

**Request Body**:
```json
{
  "message": "Add more examples to the README",
  "variantLabel": null
}
```

**例**:
```bash
curl -X POST http://localhost:3001/api/task-attempts/CLAUDE_CODE:...:uuid/follow-up \
  -H "Content-Type: application/json" \
  -d '{"message": "Add more examples"}'
```

#### POST `/api/task-attempts/:sessionId/stop`

実行中のセッションを停止

**例**:
```bash
curl -X POST http://localhost:3001/api/task-attempts/CLAUDE_CODE:...:uuid/stop
```

### ログストリーミング

#### GET `/api/execution-processes/:id/normalized-logs`

セッションのログをSSE（Server-Sent Events）でストリーミング

**Response**: `text/event-stream`

**Event Types**:
- `json_patch`: ログエントリ（JSON Patch形式）
- `finished`: ストリーム終了
- `error`: エラー発生

**例**:
```bash
curl -N http://localhost:3001/api/execution-processes/CLAUDE_CODE:...:uuid/normalized-logs
```

**JavaScript クライアント例**:
```javascript
const eventSource = new EventSource(
  'http://localhost:3001/api/execution-processes/CLAUDE_CODE:...:uuid/normalized-logs'
);

eventSource.addEventListener('json_patch', (event) => {
  const patches = JSON.parse(event.data);
  console.log('Received patches:', patches);
});

eventSource.addEventListener('finished', () => {
  console.log('Stream finished');
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Stream error:', event);
});
```

### プロファイル管理

#### GET `/api/profiles`

利用可能なプロファイル一覧を取得

**Response**:
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "label": "claude-code",
        "variants": [{"label": "plan"}]
      },
      {
        "label": "gemini",
        "variants": [{"label": "flash"}]
      }
    ]
  }
}
```

## 設定

### 環境変数

`.env` ファイルを作成して設定：

```bash
# サーバー設定
PORT=3001
HOST=127.0.0.1
NODE_ENV=development

# ログレベル
LOG_LEVEL=info

# エージェントのAPIキー
ANTHROPIC_API_KEY=your_api_key
GOOGLE_AI_API_KEY=your_api_key
```

### CORS設定

デフォルトではすべてのオリジンを許可していますが、本番環境では制限することを推奨：

```javascript
// server.js
app.use(cors({
  origin: ['https://your-frontend.com'],
  credentials: true
}));
```

## テストスクリプト

### API動作確認

```bash
npm run test:api
```

または

```bash
node examples/test-api.js
```

このスクリプトは以下を実行します：
1. プロジェクト一覧の取得
2. セッション一覧の取得
3. 新しい実行の開始
4. ログのストリーミング

### SSEクライアント

```bash
node examples/sse-client.js <session-id>
```

## Docker デプロイ

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
```

### ビルドと実行

```bash
# ビルド
docker build -t coding-agent-api:latest .

# 実行
docker run -p 3001:3001 \
  -e ANTHROPIC_API_KEY=your_key \
  coding-agent-api:latest
```

### Docker Compose

```bash
docker-compose up -d
```

## カスタムフロントエンド開発

このAPIを使用してカスタムフロントエンドを開発できます。

### React 例

```jsx
import { useState, useEffect } from 'react';

function AgentExecutor() {
  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  
  // プロジェクト一覧を取得
  useEffect(() => {
    fetch('http://localhost:3001/api/projects')
      .then(res => res.json())
      .then(data => setProjects(data.data));
  }, []);
  
  // エージェントを実行
  const executeAgent = async (projectId, prompt) => {
    const response = await fetch('http://localhost:3001/api/task-attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, prompt })
    });
    const result = await response.json();
    return result.data.sessionId;
  };
  
  // ログをストリーミング
  const streamLogs = (sessionId) => {
    const eventSource = new EventSource(
      `http://localhost:3001/api/execution-processes/${sessionId}/normalized-logs`
    );
    
    eventSource.addEventListener('json_patch', (event) => {
      const patches = JSON.parse(event.data);
      // パッチを適用してUIを更新
    });
    
    return eventSource;
  };
  
  // ... UI実装
}
```

### Vue.js 例

```vue
<template>
  <div>
    <select v-model="selectedProject">
      <option v-for="p in projects" :key="p.id" :value="p.id">
        {{ p.name }}
      </option>
    </select>
    
    <textarea v-model="prompt"></textarea>
    <button @click="execute">Execute</button>
    
    <div v-for="entry in logEntries" :key="entry.id">
      {{ entry.content }}
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      projects: [],
      selectedProject: null,
      prompt: '',
      logEntries: []
    };
  },
  async mounted() {
    const res = await fetch('http://localhost:3001/api/projects');
    const data = await res.json();
    this.projects = data.data;
  },
  methods: {
    async execute() {
      const res = await fetch('http://localhost:3001/api/task-attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: this.selectedProject,
          prompt: this.prompt
        })
      });
      const result = await res.json();
      this.streamLogs(result.data.sessionId);
    },
    streamLogs(sessionId) {
      const eventSource = new EventSource(
        `http://localhost:3001/api/execution-processes/${sessionId}/normalized-logs`
      );
      
      eventSource.addEventListener('json_patch', (event) => {
        const patches = JSON.parse(event.data);
        // ログエントリを追加
      });
    }
  }
};
</script>
```

## トラブルシューティング

### ポートが使用中
```bash
# ポートを変更
PORT=3002 npm start
```

### CORS エラー
- フロントエンドのオリジンをCORS設定に追加
- または開発時は `cors()` をそのまま使用

### SSE接続が切れる
- ネットワークタイムアウトを確認
- プロキシ経由の場合、SSE対応を確認

## ユースケース

1. **カスタムWebアプリ**: React/Vue/AngularからこのAPIを使用
2. **モバイルアプリ**: React Native/Flutterのバックエンド
3. **マイクロサービス**: 他のサービスからHTTP経由で呼び出し
4. **API統合**: Zapier/Make.comなどとの連携
5. **サーバーレス**: Vercel/Netlify Functionsからの呼び出し
