import { logger } from '../../../utils/src/logger';
export function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    logger.error({
        error: err,
        request: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body
        }
    });
    res.status(statusCode).json({
        error: {
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
}
//# sourceMappingURL=errorHandler.js.map