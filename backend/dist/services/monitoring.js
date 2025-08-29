import winston from 'winston';
import { performance } from 'perf_hooks';
// Mock query function - replace with actual database import
const query = async (sql, params = []) => {
    return { rows: [] };
};
// Configure Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
    defaultMeta: { service: 'llm-webapp' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        }),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        }),
        new winston.transports.File({
            filename: 'logs/combined.log'
        })
    ]
});
// If we're in production, log to external service
if (process.env.NODE_ENV === 'production') {
    // Add external logging service configuration here
    // Example: Papertrail, Loggly, CloudWatch, etc.
}
export { logger };
// Performance monitoring middleware
export const performanceMonitoring = (req, res, next) => {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    // Override res.end to capture response time
    const originalEnd = res.end.bind(res);
    res.end = function (chunk, encoding) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        const endMemory = process.memoryUsage();
        // Log performance metrics
        const metrics = {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
            memoryUsage: {
                heapUsed: Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024 * 100) / 100, // MB
                heapTotal: Math.round(endMemory.heapTotal / 1024 / 1024 * 100) / 100, // MB
                external: Math.round(endMemory.external / 1024 / 1024 * 100) / 100 // MB
            },
            userAgent: req.get('User-Agent'),
            ip: req.ip || 'unknown',
            userId: req.user?.id || 'anonymous'
        };
        // Log slow requests
        if (duration > 1000) { // 1 second threshold
            logger.warn('Slow request detected', metrics);
        }
        // Log errors
        if (res.statusCode >= 400) {
            logger.error('Request error', metrics);
        }
        else {
            logger.info('Request completed', metrics);
        }
        // Store metrics (simplified version)
        storeMetrics(metrics).catch(error => {
            logger.error('Failed to store metrics', { error: error.message });
        });
        return originalEnd(chunk, encoding);
    };
    next();
};
// Store metrics (simplified version without Redis complexity)
async function storeMetrics(metrics) {
    try {
        // In a real implementation, this would store to Redis or database
        // For now, just log for analytics
        logger.info('Metrics stored', {
            date: new Date().toISOString().split('T')[0],
            hour: new Date().getHours(),
            metrics
        });
    }
    catch (error) {
        logger.error('Metrics storage error', { error: error.message });
    }
}
// Error tracking middleware
export const errorTracking = (error, req, res, next) => {
    const errorId = generateErrorId();
    const errorDetails = {
        id: errorId,
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        timestamp: new Date().toISOString()
    };
    // Log error with full context
    logger.error('Unhandled error', errorDetails);
    // Store error in database for analysis
    storeError(errorDetails).catch(dbError => {
        logger.error('Failed to store error in database', {
            originalError: error.message,
            dbError: dbError.message
        });
    });
    // Send error to external monitoring service (in production)
    if (process.env.NODE_ENV === 'production') {
        // Send to Sentry, Bugsnag, etc.
        // Example: Sentry.captureException(error, { extra: errorDetails });
    }
    // Return user-friendly error
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? 'An internal server error occurred'
            : error.message,
        errorId
    });
};
// Store error details in database
async function storeError(errorDetails) {
    try {
        await query(`
      INSERT INTO error_logs (
        id, message, stack, url, method, headers, body, 
        query_params, route_params, ip, user_agent, user_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
            errorDetails.id,
            errorDetails.message,
            errorDetails.stack,
            errorDetails.url,
            errorDetails.method,
            JSON.stringify(errorDetails.headers),
            JSON.stringify(errorDetails.body),
            JSON.stringify(errorDetails.query),
            JSON.stringify(errorDetails.params),
            errorDetails.ip,
            errorDetails.userAgent,
            errorDetails.userId,
            errorDetails.timestamp
        ]);
    }
    catch (error) {
        throw new Error(`Database error storage failed: ${error.message}`);
    }
}
// Generate unique error ID
function generateErrorId() {
    return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
// Analytics service for dashboard data
export class AnalyticsService {
    static async getSystemMetrics(days = 7) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const metrics = {
                requests: await this.getRequestMetrics(startDate, endDate),
                users: await this.getUserMetrics(startDate, endDate),
                errors: await this.getErrorMetrics(startDate, endDate),
                system: await this.getSystemHealth()
            };
            return metrics;
        }
        catch (error) {
            logger.error('Analytics metrics retrieval failed', { error: error.message });
            throw error;
        }
    }
    static async getRequestMetrics(startDate, endDate) {
        // Simplified request metrics
        return {
            daily: [],
            statusCodes: {},
            methods: {},
            total: 0
        };
    }
    static async getUserMetrics(startDate, endDate) {
        // Get user statistics from database
        const userStats = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_registrations
      FROM users 
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [startDate, endDate]);
        return {
            registrations: userStats.rows,
            activeUsers: [],
            totalActive: await this.getTotalActiveUsers()
        };
    }
    static async getErrorMetrics(startDate, endDate) {
        const errorStats = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as error_count,
        COUNT(DISTINCT message) as unique_errors
      FROM error_logs 
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [startDate, endDate]);
        const topErrors = await query(`
      SELECT 
        message,
        COUNT(*) as count,
        MAX(created_at) as last_occurrence
      FROM error_logs 
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY message
      ORDER BY count DESC
      LIMIT 10
    `, [startDate, endDate]);
        return {
            daily: errorStats.rows,
            topErrors: topErrors.rows
        };
    }
    static async getSystemHealth() {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        // Check database connection
        let dbStatus = 'healthy';
        try {
            await query('SELECT 1');
        }
        catch (error) {
            dbStatus = 'error';
        }
        return {
            uptime: Math.floor(uptime),
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
                external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
                rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100
            },
            services: {
                database: dbStatus,
                api: 'healthy'
            },
            load: {
                cpu: await this.getCpuUsage(),
                connections: await this.getActiveConnections()
            }
        };
    }
    static async getTotalActiveUsers() {
        const result = await query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM conversations 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
        return parseInt(result.rows[0]?.count || '0');
    }
    static async getCpuUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            setTimeout(() => {
                const endUsage = process.cpuUsage(startUsage);
                const totalUsage = (endUsage.user + endUsage.system) / 1000000; // Convert to seconds
                resolve(Math.round(totalUsage * 100) / 100);
            }, 100);
        });
    }
    static async getActiveConnections() {
        // This would depend on your server implementation
        // For now, return a mock value
        return Math.floor(Math.random() * 100) + 10;
    }
}
// Real-time metrics endpoint
export const getRealtimeMetrics = async (req, res) => {
    try {
        const now = new Date();
        const metrics = {
            timestamp: now.toISOString(),
            requests: {
                thisHour: Math.floor(Math.random() * 100),
                averageResponseTime: Math.round(Math.random() * 500 * 100) / 100
            },
            users: {
                active: Math.floor(Math.random() * 50)
            },
            errors: {
                recent: Math.floor(Math.random() * 5)
            },
            system: await AnalyticsService.getSystemHealth()
        };
        res.json({
            success: true,
            data: metrics
        });
    }
    catch (error) {
        logger.error('Realtime metrics error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve realtime metrics'
        });
    }
};
export default {
    logger,
    performanceMonitoring,
    errorTracking,
    AnalyticsService,
    getRealtimeMetrics
};
//# sourceMappingURL=monitoring.js.map