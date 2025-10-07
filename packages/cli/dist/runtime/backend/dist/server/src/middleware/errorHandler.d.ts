import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}
export declare function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=errorHandler.d.ts.map