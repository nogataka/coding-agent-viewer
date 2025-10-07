import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import 'express-async-errors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/src/logger';
import { errorHandler } from './middleware/errorHandler';
import { setupRoutes } from './routes';

import { writePortFile } from '../../utils/src/portFile';

const app = express();

async function main() {
  try {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const port = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);
    const host = process.env.HOST || '127.0.0.1';

    const assetDir = path.join(process.cwd(), 'assets');
    await fs.mkdir(assetDir, { recursive: true });

    app.use(
      helmet({
        contentSecurityPolicy: false
      })
    );
    app.use(cors());
    app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

    // Configure JSON parser to handle "null" string
    app.use(
      express.json({
        reviver: (key, value) => value,
        strict: false
      })
    );
    app.use(express.urlencoded({ extended: true }));

    // Serve static files in production
    if (!isDevelopment) {
      const frontendPath = path.join(process.cwd(), '..', 'frontend', 'dist');
      app.use(express.static(frontendPath));
    }

    setupRoutes(app);

    app.use(errorHandler);

    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;

      logger.info(`Server running on http://${host}:${actualPort}`);

      if (isDevelopment) {
        writePortFile(actualPort).catch((err) => {
          logger.warn(`Failed to write port file: ${err}`);
        });
      }
    });

    const shutdown = async () => {
      logger.info('Shutdown signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', async () => {
      await shutdown();
    });

    process.on('SIGINT', async () => {
      await shutdown();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
