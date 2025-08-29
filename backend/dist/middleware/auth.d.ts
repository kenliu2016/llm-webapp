import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        username: string;
        email: string;
        role: string;
        preferences?: any;
    };
}
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const requireAdmin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare const optionalAuth: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => Promise<void>;
export declare const generateTokens: (userId: string) => {
    accessToken: string;
    refreshToken: string;
};
export declare const hashPassword: (password: string) => Promise<string>;
export declare const comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
export declare const createSession: (userId: string, deviceInfo?: any) => Promise<string>;
export declare const destroySession: (sessionId: string) => Promise<void>;
export declare const getUserTierLimits: (role: string) => {
    requestsPerMinute: number;
    requestsPerHour: number;
    filesPerDay: number;
};
declare const _default: {
    authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    requireAdmin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
    optionalAuth: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => Promise<void>;
    generateTokens: (userId: string) => {
        accessToken: string;
        refreshToken: string;
    };
    hashPassword: (password: string) => Promise<string>;
    comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
    createSession: (userId: string, deviceInfo?: any) => Promise<string>;
    destroySession: (sessionId: string) => Promise<void>;
    getUserTierLimits: (role: string) => {
        requestsPerMinute: number;
        requestsPerHour: number;
        filesPerDay: number;
    };
};
export default _default;
