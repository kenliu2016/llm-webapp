import winston from 'winston';
// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};
// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};
// Tell winston that we want to link the colors
winston.addColors(colors);
// Define format for logs
const format = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }), winston.format.colorize({ all: true }), winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`));
// Define which logs to print based on environment
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'warn';
};
// Define transports
const transports = [
    // Console transport
    new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // File transport for errors
    new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
    // File transport for all logs
    new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
];
// Create the logger
export const logger = winston.createLogger({
    level: level(),
    levels,
    format,
    transports,
    // Do not exit on handled exceptions
    exitOnError: false,
});
// Create a stream object for HTTP request logging
export const loggerStream = {
    write: (message) => {
        logger.http(message.trim());
    },
};
// Enhanced logging methods
export const logError = (error, context) => {
    logger.error(`${error.message}`, {
        stack: error.stack,
        context,
    });
};
export const logInfo = (message, metadata) => {
    logger.info(message, metadata);
};
export const logWarn = (message, metadata) => {
    logger.warn(message, metadata);
};
export const logDebug = (message, metadata) => {
    logger.debug(message, metadata);
};
// Request logging middleware
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const { method, url, ip } = req;
        const { statusCode } = res;
        logger.http(`${method} ${url} ${statusCode} ${duration}ms`, {
            method,
            url,
            statusCode,
            duration,
            ip,
            userAgent: req.get('User-Agent'),
        });
    });
    next();
};
export default logger;
//# sourceMappingURL=logger.js.map