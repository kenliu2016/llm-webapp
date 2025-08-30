import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import passport from 'passport';
import { DatabaseService } from './services/databaseService.js';
import { RedisService } from './services/redisService.js';

// Import routes - using fallbacks for missing routes
import chatRoutes from './routes/chat.js';

// Import middleware
import { authenticate } from './middleware/auth.js';

// Import monitoring
import { performanceMonitoring, errorTracking, logger } from './services/monitoring.js';

// Import passport configuration
import './config/passport.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Initialize database and Redis services
const dbService = new DatabaseService();
const redisService = new RedisService();

// CORS configuration
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

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

// Performance monitoring
app.use(performanceMonitoring);

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: express.Request, res: express.Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: 60
    });
  }
});

// Apply middleware
app.use(cors(corsOptions));
app.use(compression());

// 根据环境变量决定是否启用速率限制
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_RATE_LIMIT === 'true') {
  logger.info('Enabling rate limiting middleware');
  app.use(limiter);
} else {
  logger.info('Rate limiting disabled in development environment');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Passport initialization
app.use(passport.initialize());

// Request logging middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
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
app.get('/health', async (_req: express.Request, res: express.Response) => {
  try {
    // Check database health
    const dbHealth = await dbService.healthCheck();
    
    // Check Redis health
    const redisHealth = await redisService.healthCheck();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '2.0.0',
      services: {
        database: {
          status: dbHealth ? 'connected' : 'disconnected',
          type: 'PostgreSQL',
          host: process.env.DB_HOST || 'localhost'
        },
        redis: {
          status: redisHealth ? 'connected' : 'disconnected',
          host: process.env.REDIS_HOST || 'localhost'
        },
        api: 'available',
        socket: 'available'
      },
      environment: process.env.NODE_ENV || 'development',
      memoryUsage: process.memoryUsage()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        database: 'error',
        redis: 'error',
        api: 'partially available'
      }
    });
  }
});

// API Routes - Basic setup (enhanced routes to be added)
app.use('/api', chatRoutes);

// Try to import enhanced routes if they exist
try {
  const authRoutes = require('./routes/auth.js').default;
  app.use('/api/auth', authRoutes);
} catch (error) {
  logger.info('Auth routes not available, using basic chat routes');
}

try {
  const userRoutes = require('./routes/user.js').default;
  app.use('/api/user', authenticate as any, userRoutes);
} catch (error) {
  logger.info('User routes not available');
}

try {
  const adminRoutes = require('./routes/admin.js').default;
  app.use('/api/admin', authenticate as any, adminRoutes);
} catch (error) {
  logger.info('Admin routes not available');
}

try {
  const oauthRoutes = require('./routes/oauth.js').default;
  app.use('/api/oauth', oauthRoutes);
} catch (error) {
  logger.info('OAuth routes not available');
}

// Enhanced API documentation
app.get('/api', (_req: express.Request, res: express.Response) => {
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
app.use('/api/*', (req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.originalUrl} was not found`,
    availableEndpoints: '/api'
  });
});

// Enhanced error handling middleware
app.use(errorTracking);

// Graceful shutdown handling
const gracefulShutdown = async (signal?: string) => {
  logger.info(`Received ${signal || 'shutdown signal'}, shutting down gracefully...`);
  
  try {
    // Disconnect from Redis
    if (redisService) {
      await redisService.disconnect();
      logger.info('Redis connection closed');
    }
    
    // Disconnect from database
    if (dbService && typeof dbService.isReady === 'function' && dbService.isReady()) {
      await dbService.disconnect();
      logger.info('Database connection closed');
    }
    
    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
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

// Initialize and start the server with database and Redis connections
async function startServer() {
  try {
    // Connect to database
    logger.info('Connecting to database...');
    await dbService.connect();
    logger.info('Database connected successfully');

    // Connect to Redis
    logger.info('Connecting to Redis...');
    await redisService.connect();
    logger.info('Redis connected successfully');

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
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export { app, server, io };
