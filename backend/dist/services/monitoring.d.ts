import winston from 'winston';
import { Request, Response, NextFunction } from 'express';
declare const logger: winston.Logger;
export { logger };
export declare const performanceMonitoring: (req: Request, res: Response, next: NextFunction) => void;
export declare const errorTracking: (error: Error, req: Request, res: Response, next: NextFunction) => void;
export declare class AnalyticsService {
    static getSystemMetrics(days?: number): Promise<{
        requests: {
            daily: any[];
            statusCodes: {};
            methods: {};
            total: number;
        };
        users: {
            registrations: any[];
            activeUsers: any[];
            totalActive: number;
        };
        errors: {
            daily: any[];
            topErrors: any[];
        };
        system: {
            uptime: number;
            memory: {
                heapUsed: number;
                heapTotal: number;
                external: number;
                rss: number;
            };
            services: {
                database: string;
                api: string;
            };
            load: {
                cpu: number;
                connections: number;
            };
        };
    }>;
    private static getRequestMetrics;
    private static getUserMetrics;
    private static getErrorMetrics;
    static getSystemHealth(): Promise<{
        uptime: number;
        memory: {
            heapUsed: number;
            heapTotal: number;
            external: number;
            rss: number;
        };
        services: {
            database: string;
            api: string;
        };
        load: {
            cpu: number;
            connections: number;
        };
    }>;
    private static getTotalActiveUsers;
    private static getCpuUsage;
    private static getActiveConnections;
}
export declare const getRealtimeMetrics: (req: Request, res: Response) => Promise<void>;
declare const _default: {
    logger: winston.Logger;
    performanceMonitoring: (req: Request, res: Response, next: NextFunction) => void;
    errorTracking: (error: Error, req: Request, res: Response, next: NextFunction) => void;
    AnalyticsService: typeof AnalyticsService;
    getRealtimeMetrics: (req: Request, res: Response) => Promise<void>;
};
export default _default;
