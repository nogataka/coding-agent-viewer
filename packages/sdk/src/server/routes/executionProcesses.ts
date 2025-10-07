import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';
import { Readable } from 'stream';
import { LogSourceFactory } from '../../services/logs/index.js';

const router = Router();
const buildFactory = (): LogSourceFactory => new LogSourceFactory();
const streamNormalizedLogs = async (req: Request, res: Response, sessionId: string) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  try {
    const factory = buildFactory();
    const stream = await factory.getSessionStream(sessionId);

    if (!stream) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Session not found' })}\n\n`);
      res.end();
      return;
    }

    stream.on('data', (chunk: Buffer | string) => {
      res.write(typeof chunk === 'string' ? chunk : chunk.toString());
    });

    stream.on('end', () => {
      res.end();
    });

    stream.on('error', (error) => {
      logger.error(`[logs] Error streaming filesystem logs for ${sessionId}:`, error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    });

    req.on('close', () => {
      const readable = stream as Readable;
      if (typeof readable.destroy === 'function') {
        readable.destroy();
      }
    });
  } catch (error) {
    logger.error('Failed to stream logs:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to stream logs' })}\n\n`);
    res.end();
  }
};

// GET /api/execution-processes/:id/normalized-logs (SSE)
router.get('/:id/normalized-logs', async (req: Request, res: Response) => {
  await streamNormalizedLogs(req, res, req.params.id);
});

export const executionProcessRoutes = router;
