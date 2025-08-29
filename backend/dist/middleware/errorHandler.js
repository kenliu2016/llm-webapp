import { logger } from '../utils/logger.js';
/**
 * Create an operational error
 */
export const createError = (message, statusCode = 500) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    error.isOperational = true;
    return error;
};
/**
 * Handle cast errors (invalid ObjectId, etc.)
 */
const handleCastError = (error) => {
    const message = `Invalid ${error.path}: ${error.value}`;
    return createError(message, 400);
};
/**
 * Handle duplicate field errors
 */
const handleDuplicateFieldsError = (error) => {
    const value = error.errmsg ? error.errmsg.match(/(["'])(\\?.)*?\1/)[0] : 'duplicate value';
    const message = `Duplicate field value: ${value}. Please use another value!`;
    return createError(message, 400);
};
/**
 * Handle validation errors
 */
const handleValidationError = (error) => {
    const errors = Object.values(error.errors).map((el) => el.message);
    const message = `Invalid input data. ${errors.join('. ')}`;
    return createError(message, 400);
};
/**
 * Handle JWT errors
 */
const handleJWTError = () => {
    return createError('Invalid token. Please log in again!', 401);
};
/**
 * Handle JWT expired errors
 */
const handleJWTExpiredError = () => {
    return createError('Your token has expired! Please log in again.', 401);
};
/**
 * Send error response in development
 */
const sendErrorDev = (err, res) => {
    res.status(err.statusCode || 500).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack,
    });
};
/**
 * Send error response in production
 */
const sendErrorProd = (err, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode || 500).json({
            status: err.status,
            message: err.message,
        });
    }
    else {
        // Programming or other unknown error: don't leak error details
        logger.error('ERROR 💥', err);
        res.status(500).json({
            status: 'error',
            message: 'Something went wrong!',
        });
    }
};
/**
 * Global error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
    // Log the error
    logger.error(`Error ${err.statusCode}: ${err.message}`, {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        stack: err.stack,
    });
    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, res);
    }
    else {
        let error = { ...err };
        error.message = err.message;
        // Handle specific error types
        if (error.name === 'CastError')
            error = handleCastError(error);
        if (error.code === 11000)
            error = handleDuplicateFieldsError(error);
        if (error.name === 'ValidationError')
            error = handleValidationError(error);
        if (error.name === 'JsonWebTokenError')
            error = handleJWTError();
        if (error.name === 'TokenExpiredError')
            error = handleJWTExpiredError();
        sendErrorProd(error, res);
    }
};
/**
 * Async error handler wrapper
 */
export const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};
/**
 * Handle unhandled routes
 */
export const handleNotFound = (req, res, next) => {
    const err = createError(`Can't find ${req.originalUrl} on this server!`, 404);
    next(err);
};
/**
 * Rate limit error handler
 */
export const handleRateLimitError = (req, res) => {
    const err = createError('Too many requests from this IP, please try again later.', 429);
    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        retryAfter: res.get('Retry-After') || '60',
    });
};
/**
 * Validation error formatter
 */
export const formatValidationErrors = (errors) => {
    return errors.map(error => {
        if (error.param && error.msg) {
            return `${error.param}: ${error.msg}`;
        }
        return error.msg || error.message || 'Invalid input';
    });
};
/**
 * Database error handler
 */
export const handleDatabaseError = (error) => {
    let message = 'Database operation failed';
    let statusCode = 500;
    // Handle specific database errors
    if (error.code === 'ECONNREFUSED') {
        message = 'Database connection refused';
        statusCode = 503;
    }
    else if (error.code === 'ETIMEDOUT') {
        message = 'Database operation timed out';
        statusCode = 504;
    }
    else if (error.code === '23505') { // PostgreSQL unique violation
        message = 'Resource already exists';
        statusCode = 409;
    }
    else if (error.code === '23503') { // PostgreSQL foreign key violation
        message = 'Referenced resource not found';
        statusCode = 400;
    }
    else if (error.code === '23502') { // PostgreSQL not null violation
        message = 'Required field is missing';
        statusCode = 400;
    }
    return createError(message, statusCode);
};
/**
 * API error handler for external service failures
 */
export const handleAPIError = (error, serviceName) => {
    let message = `${serviceName} service is currently unavailable`;
    let statusCode = 503;
    if (error.response) {
        // The request was made and the server responded with a status code
        statusCode = error.response.status;
        message = error.response.data?.message || error.response.data?.error || message;
    }
    else if (error.request) {
        // The request was made but no response was received
        message = `${serviceName} service is not responding`;
        statusCode = 504;
    }
    else {
        // Something happened in setting up the request
        message = `Failed to connect to ${serviceName} service`;
        statusCode = 503;
    }
    return createError(message, statusCode);
};
export default errorHandler;
//# sourceMappingURL=errorHandler.js.map