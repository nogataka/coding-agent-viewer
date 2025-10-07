import { Router } from 'express';
import { logger } from '../../../utils/src/logger';
import { LogSourceFactory } from '../../../services/src/logs/logSourceFactory';
const router = Router();
const buildFactory = () => new LogSourceFactory();
const streamNormalizedLogs = async (req, res, sessionId) => {
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
        stream.on('data', (chunk) => {
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
            const readable = stream;
            if (typeof readable.destroy === 'function') {
                readable.destroy();
            }
        });
    }
    catch (error) {
        logger.error('Failed to stream logs:', error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to stream logs' })}\n\n`);
        res.end();
    }
};
// GET /api/execution-processes/:id/normalized-logs (SSE)
router.get('/:id/normalized-logs', async (req, res) => {
    await streamNormalizedLogs(req, res, req.params.id);
});
export const executionProcessRoutes = router;
//# sourceMappingURL=executionProcesses.js.map