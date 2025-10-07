#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import 'express-async-errors';
import dotenv from 'dotenv';
import { setupRoutes } from '../../backend/server/src/routes/index.js';
import { errorHandler } from '../../backend/server/src/middleware/errorHandler.js';
import { logger } from '../../backend/utils/src/logger.js';

// 環境変数を読み込み
dotenv.config();

const app = express();

async function main() {
  try {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '127.0.0.1';

    // セキュリティヘッダー
    app.use(
      helmet({
        contentSecurityPolicy: false
      })
    );

    // CORS設定
    app.use(cors());

    // HTTPリクエストログ
    app.use(
      morgan('combined', { 
        stream: { 
          write: (message) => logger.info(message.trim()) 
        } 
      })
    );

    // JSONパーサー
    app.use(
      express.json({
        reviver: (key, value) => value,
        strict: false
      })
    );
    app.use(express.urlencoded({ extended: true }));

    // ヘルスチェックエンドポイント
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
      });
    });

    // ルート設定
    setupRoutes(app);

    // エラーハンドラー
    app.use(errorHandler);

    // サーバー起動
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;

      console.log('');
      console.log('🚀 Coding Agent Viewer API Server');
      console.log('');
      console.log(`   Server running on: http://${host}:${actualPort}`);
      console.log(`   Health check:      http://${host}:${actualPort}/health`);
      console.log(`   Environment:       ${isDevelopment ? 'development' : 'production'}`);
      console.log('');
      console.log('📚 API Endpoints:');
      console.log(`   GET  /api/projects`);
      console.log(`   GET  /api/tasks?project_id=<id>`);
      console.log(`   POST /api/task-attempts`);
      console.log(`   GET  /api/execution-processes/:id/normalized-logs (SSE)`);
      console.log(`   GET  /api/profiles`);
      console.log('');
      console.log('💡 Press Ctrl+C to stop');
      console.log('');

      logger.info(`Server started on http://${host}:${actualPort}`);
    });

    // グレースフルシャットダウン
    const shutdown = async () => {
      console.log('');
      logger.info('Shutdown signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
