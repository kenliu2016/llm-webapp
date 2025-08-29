import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import passport from 'passport';
// Import routes
import chatRoutes from './routes/chat.js';
// Import middleware
import { authenticate } from './middleware/auth.js';
// Import new security and monitoring
import { securityHeaders, apiRateLimit, performanceMonitoring, errorTracking, logger } from './middleware/security.js';
// Import passport configuration
import './config/passport.js';
// Load environment variables
dotenv.config();
const app = express();
const server = createServer(app);
// Enhanced CORS configuration 
const corsOptions = {
    origin: [
        'https://chipfoundryservices.com',
        'https://www.chipfoundryservices.com',
        'http://localhost:3000',
        'http://localhost:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200
};
// Initialize Socket.IO
const io = new Server(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
});
// Enhanced Security middleware
app.use(securityHeaders);
// Performance monitoring
app.use(performanceMonitoring);
// Rate limiting with enhanced configuration
const limiter = apiRateLimit;
// Apply middleware
app.use(cors(corsOptions));
app.use(compression());
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Passport initialization
app.use(passport.initialize());
// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    });
    next();
});
// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
    });
});
// API Routes
app.use('/api/auth', authRoutes || chatRoutes); // Fallback to chatRoutes if authRoutes doesn't exist
app.use('/api/chat', authenticate, chatRoutes);
// Enhanced API documentation
app.get('/api', (_req, res) => {
    res.json({
        name: 'LLM Chat Web Application API - Phase 6 Advanced Features',
        version: '2.0.0',
        description: 'Production-ready API with authentication, OAuth, admin dashboard, and multi-modal chat',
        features: [
            'JWT Authentication & Refresh Tokens',
            'Google OAuth Integration',
            'Role-based Access Control (Free/Pro/Admin)',
            'Multi-modal Chat (Text, Images, Files)',
            'Admin Dashboard & Analytics',
            'Real-time Performance Monitoring',
            'Rate Limiting & Security Headers',
            'Input Sanitization & XSS Protection',
            'Error Tracking & Logging',
            'User Preferences & Dashboard'
        ],
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                logout: 'POST /api/auth/logout',
                refresh: 'POST /api/auth/refresh',
                profile: 'GET /api/auth/profile',
                preferences: 'PATCH /api/auth/preferences'
            },
            oauth: {
                google: 'GET /api/oauth/google',
                callback: 'GET /api/oauth/google/callback'
            },
            chat: {
                conversations: 'POST /api/chat/conversations',
                messages: 'POST /api/chat/messages',
                upload: 'POST /api/chat/upload',
                export: 'GET /api/chat/export/:conversationId',
                history: 'GET /api/chat/history'
            },
            user: {
                dashboard: 'GET /api/user/dashboard',
                usage: 'GET /api/user/usage',
                preferences: 'PATCH /api/user/preferences',
                export: 'GET /api/user/export',
                account: 'DELETE /api/user/account'
            },
            admin: {
                dashboard: 'GET /api/admin/dashboard',
                users: 'GET /api/admin/users',
                analytics: 'GET /api/admin/analytics',
                health: 'GET /api/admin/health'
            }
        },
        security: {
            headers: 'Helmet security headers',
            rateLimit: 'Request rate limiting',
            inputSanitization: 'XSS and SQL injection protection',
            authentication: 'JWT with refresh tokens',
            authorization: 'Role-based access control'
        },
        monitoring: {
            performance: 'Response time tracking',
            errors: 'Error logging and tracking',
            analytics: 'Usage analytics and metrics'
        }
    });
});
// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `The endpoint ${req.method} ${req.originalUrl} was not found`,
        availableEndpoints: '/api'
    });
});
// Enhanced error handling middleware
app.use(errorTracking);
// Graceful shutdown handling
const gracefulShutdown = async () => {
    logger.info('Graceful shutdown initiated...');
    try {
        // Close HTTP server
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        logger.info('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};
// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
// Start server on port 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info(`🚀 LLM Chat API Server (Phase 6) running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        features: 'Authentication, OAuth, Admin Dashboard, Multi-modal Chat, Monitoring',
        cors: corsOptions.origin,
        timestamp: new Date().toISOString()
    });
});
export { app, server, io };
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    });
    next();
});
// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
    });
});
// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/user', authMiddleware, userRoutes);
// Default route for API documentation
app.get('/api', (_req, res) => {
    res.json({
        name: 'LLM Chat Web Application API',
        version: '1.0.0',
        description: 'Production-ready API for LLM chat application',
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                logout: 'POST /api/auth/logout',
                refresh: 'POST /api/auth/refresh',
                'guest-login': 'POST /api/auth/guest-login',
                me: 'GET /api/auth/me'
            },
            chat: {
                message: 'POST /api/chat/message',
                history: 'GET /api/chat/history/:userId',
                'delete-session': 'DELETE /api/chat/session/:sessionId',
                models: 'GET /api/chat/models'
            },
            user: {
                profile: 'GET /api/user/profile',
                'update-profile': 'PUT /api/user/profile',
                'change-password': 'POST /api/user/change-password',
                preferences: 'GET /api/user/preferences',
                'update-preferences': 'PUT /api/user/preferences',
                'usage-stats': 'GET /api/user/usage-stats',
                'delete-account': 'DELETE /api/user/account'
            }
        },
        documentation: 'https://chipfoundryservices.com/api/docs'
    });
});
// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `The endpoint ${req.method} ${req.originalUrl} was not found`,
        availableEndpoints: '/api'
    });
});
// Error handling middleware (must be last)
app.use(errorHandler);
// Graceful shutdown handling
const gracefulShutdown = async () => {
    logger.info('Graceful shutdown initiated...');
    try {
        // Close HTTP server
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        // Close Redis connection
        await redisService.disconnect();
        logger.info('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};
// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
// Start server on port 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info(`🚀 LLM Chat API Server running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        cors: corsOptions.origin,
        timestamp: new Date().toISOString()
    });
});
export { app, server, io };
//# sourceMappingURL=index_old.js.map