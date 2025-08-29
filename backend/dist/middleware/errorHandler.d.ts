import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    status?: string;
    isOperational?: boolean;
}
/**
 * Create an operational error
 */
export declare const createError: (message: string, statusCode?: number) => AppError;
/**
 * Global error handling middleware
 */
export declare const errorHandler: (err: AppError, req: Request, res: Response, next: NextFunction) => void;
/**
 * Async error handler wrapper
 */
export declare const catchAsync: (fn: Function) => (req: Request, res: Response, next: NextFunction) => void;
/**
 * Handle unhandled routes
 */
export declare const handleNotFound: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Rate limit error handler
 */
export declare const handleRateLimitError: (req: Request, res: Response) => void;
/**
 * Validation error formatter
 */
export declare const formatValidationErrors: (errors: any[]) => string[];
/**
 * Database error handler
 */
export declare const handleDatabaseError: (error: any) => AppError;
/**
 * API error handler for external service failures
 */
export declare const handleAPIError: (error: any, serviceName: string) => AppError;
export default errorHandler;
