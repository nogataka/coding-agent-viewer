import winston from 'winston';
const logLevel = process.env.LOG_LEVEL || 'info';
export const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
    defaultMeta: { service: 'coding-agent-viewer' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        })
    ]
});
//# sourceMappingURL=logger.js.map