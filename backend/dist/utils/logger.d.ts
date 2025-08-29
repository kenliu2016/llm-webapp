import winston from 'winston';
export declare const logger: winston.Logger;
export declare const loggerStream: {
    write: (message: string) => void;
};
export declare const logError: (error: Error, context?: any) => void;
export declare const logInfo: (message: string, metadata?: any) => void;
export declare const logWarn: (message: string, metadata?: any) => void;
export declare const logDebug: (message: string, metadata?: any) => void;
export declare const requestLogger: (req: any, res: any, next: any) => void;
export default logger;
