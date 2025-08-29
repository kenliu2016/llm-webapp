import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        username: string;
        email: string;
        role: string;
        preferences?: any;
    };
    session?: any;
}
export interface JWTPayload {
    userId: string;
    username: string;
    email: string;
    role: string;
    iat?: number;
    exp?: number;
}
export declare const authenticate: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const requireAdmin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const optionalAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const hashPassword: (password: string) => Promise<string>;
export declare const comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
export declare const generateTokens: (user: {
    id: string;
    username: string;
    email: string;
    role: string;
}) => {
    accessToken: string;
    refreshToken: string;
};
export declare const createUserSession: (userId: string, deviceInfo?: any) => Promise<any>;
export declare const invalidateUserSession: (sessionId: string) => Promise<void>;
export declare const getUserTierLimits: (role: string) => {
    requestsPerHour: number;
    tokensPerDay: number;
} | {
    requestsPerHour: number;
    tokensPerDay: number;
} | {
    requestsPerHour: number;
    tokensPerDay: number;
};
declare const _default: {
    authenticate: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
    requireAdmin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
    optionalAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
    hashPassword: (password: string) => Promise<string>;
    comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
    generateTokens: (user: {
        id: string;
        username: string;
        email: string;
        role: string;
    }) => {
        accessToken: string;
        refreshToken: string;
    };
    createUserSession: (userId: string, deviceInfo?: any) => Promise<any>;
    invalidateUserSession: (sessionId: string) => Promise<void>;
    getUserTierLimits: (role: string) => {
        requestsPerHour: number;
        tokensPerDay: number;
    } | {
        requestsPerHour: number;
        tokensPerDay: number;
    } | {
        requestsPerHour: number;
        tokensPerDay: number;
    };
};
export default _default;
