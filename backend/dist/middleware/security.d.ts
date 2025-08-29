import { Request, Response, NextFunction } from 'express';
export declare const securityHeaders: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
export declare const createRateLimit: (windowMs: number, max: number, message: string) => import("express-rate-limit").RateLimitRequestHandler;
export declare const authRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const apiRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const uploadRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const chatRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const sanitizeInput: (req: Request, res: Response, next: NextFunction) => void;
export declare const xssProtection: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const sqlInjectionProtection: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const validateContentType: (allowedTypes: string[]) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const requestSizeLimit: (maxSize?: number) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const trackApiKeyUsage: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const corsOptions: {
    origin: (origin: any, callback: any) => any;
    credentials: boolean;
    optionsSuccessStatus: number;
};
export declare const commonValidations: {
    email: import("express-validator").ValidationChain;
    password: import("express-validator").ValidationChain;
    username: import("express-validator").ValidationChain;
    uuid: (field: string) => import("express-validator").ValidationChain;
    text: (field: string, maxLength?: number) => import("express-validator").ValidationChain;
    number: (field: string, min?: number, max?: number) => import("express-validator").ValidationChain;
};
export declare const logSecurityEvent: (event: string, details: any, req: Request) => void;
declare const _default: {
    securityHeaders: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
    createRateLimit: (windowMs: number, max: number, message: string) => import("express-rate-limit").RateLimitRequestHandler;
    authRateLimit: import("express-rate-limit").RateLimitRequestHandler;
    apiRateLimit: import("express-rate-limit").RateLimitRequestHandler;
    uploadRateLimit: import("express-rate-limit").RateLimitRequestHandler;
    chatRateLimit: import("express-rate-limit").RateLimitRequestHandler;
    sanitizeInput: (req: Request, res: Response, next: NextFunction) => void;
    xssProtection: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
    sqlInjectionProtection: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
    validateContentType: (allowedTypes: string[]) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
    requestSizeLimit: (maxSize?: number) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
    trackApiKeyUsage: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    corsOptions: {
        origin: (origin: any, callback: any) => any;
        credentials: boolean;
        optionsSuccessStatus: number;
    };
    commonValidations: {
        email: import("express-validator").ValidationChain;
        password: import("express-validator").ValidationChain;
        username: import("express-validator").ValidationChain;
        uuid: (field: string) => import("express-validator").ValidationChain;
        text: (field: string, maxLength?: number) => import("express-validator").ValidationChain;
        number: (field: string, min?: number, max?: number) => import("express-validator").ValidationChain;
    };
    logSecurityEvent: (event: string, details: any, req: Request) => void;
};
export default _default;
