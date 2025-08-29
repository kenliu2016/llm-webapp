import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Security headers with Helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // For development, remove unsafe-eval in production
      connectSrc: ["'self'", "ws:", "wss:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Disable for API usage
  crossOriginResourcePolicy: { policy: "cross-origin" }
});

// Rate limiting configurations
export const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for admin users
      return (req as any).user?.role === 'admin';
    }
  });
};

// Different rate limits for different endpoints
export const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many authentication attempts, please try again later'
);

export const apiRateLimit = createRateLimit(
  60 * 1000, // 1 minute  
  60, // 60 requests
  'Too many requests, please try again later'
);

export const uploadRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  10, // 10 uploads
  'Too many file uploads, please try again later'
);

export const chatRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  30, // 30 messages
  'Too many chat messages, please slow down'
);

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    next();
  } catch (error) {
    logger.error('Input sanitization error', { error: error.message });
    res.status(400).json({
      success: false,
      message: 'Invalid input data'
    });
  }
};

// Recursively sanitize object properties
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    // Basic HTML/script sanitization without DOMPurify
    return obj
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, ''); // Remove event handlers
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Basic key sanitization
      const cleanKey = key.replace(/[<>'"]/g, '');
      sanitized[cleanKey] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

// XSS Protection middleware
export const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  // Additional XSS protection beyond DOMPurify
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi
  ];

  const checkForXSS = (value: string): boolean => {
    return suspiciousPatterns.some(pattern => pattern.test(value));
  };

  const scanObject = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return checkForXSS(obj);
    }
    if (Array.isArray(obj)) {
      return obj.some(scanObject);
    }
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(scanObject);
    }
    return false;
  };

  // Check request body and query parameters
  if ((req.body && scanObject(req.body)) || (req.query && scanObject(req.query))) {
    logger.warn('XSS attempt detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      body: req.body,
      query: req.query
    });

    return res.status(400).json({
      success: false,
      message: 'Potentially malicious content detected'
    });
  }

  next();
};

// SQL Injection prevention (additional to parameterized queries)
export const sqlInjectionProtection = (req: Request, res: Response, next: NextFunction) => {
  const sqlInjectionPatterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /(\'|\"|;|--|\*|\/\*|\*\/)/g,
    /(\b(or|and)\b\s+(\'|\"|\d+)\s*=\s*(\'|\"|\d+))/gi,
    /(1\s*=\s*1|1\s*=\s*\'1\')/gi
  ];

  const checkForSQLInjection = (value: string): boolean => {
    return sqlInjectionPatterns.some(pattern => pattern.test(value));
  };

  const scanObject = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return checkForSQLInjection(obj);
    }
    if (Array.isArray(obj)) {
      return obj.some(scanObject);
    }
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(scanObject);
    }
    return false;
  };

  if ((req.body && scanObject(req.body)) || (req.query && scanObject(req.query))) {
    logger.warn('SQL injection attempt detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      body: req.body,
      query: req.query
    });

    return res.status(400).json({
      success: false,
      message: 'Invalid request format'
    });
  }

  next();
};

// Content validation middleware
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.get('Content-Type');
    
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
        return res.status(415).json({
          success: false,
          message: 'Unsupported content type'
        });
      }
    }
    
    next();
  };
};

// Request size limiting
export const requestSizeLimit = (maxSize: number = 10 * 1024 * 1024) => { // 10MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        success: false,
        message: 'Request entity too large'
      });
    }
    
    next();
  };
};

// API key rotation tracking
export const trackApiKeyUsage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (apiKey) {
      // Update last used timestamp
      await query(
        'UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1',
        [hashApiKey(apiKey)]
      );
    }
    
    next();
  } catch (error) {
    logger.error('API key tracking error', { error: error.message });
    next(); // Continue even if tracking fails
  }
};

// CORS configuration
export const corsOptions = {
  origin: (origin: any, callback: any) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://your-frontend-domain.com'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS violation attempt', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Input validation helpers
export const commonValidations = {
  email: body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  password: body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
  username: body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'),
  uuid: (field: string) => body(field).isUUID().withMessage(`${field} must be a valid UUID`),
  text: (field: string, maxLength: number = 1000) => 
    body(field).trim().isLength({ max: maxLength }).withMessage(`${field} is too long`),
  number: (field: string, min: number = 0, max: number = Number.MAX_SAFE_INTEGER) =>
    body(field).isNumeric().isFloat({ min, max }).withMessage(`${field} must be a number between ${min} and ${max}`)
};

// Security event logging
export const logSecurityEvent = (event: string, details: any, req: Request) => {
  logger.warn('Security event', {
    event,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    method: req.method,
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Helper function to hash API keys (implement actual hashing)
function hashApiKey(apiKey: string): string {
  // Implement proper API key hashing
  return Buffer.from(apiKey).toString('base64');
}

// Add query function import (placeholder)
const query = async (sql: string, params: any[] = []) => {
  // This should be imported from your database connection
  // For now, it's a placeholder
  return { rows: [] };
};

export default {
  securityHeaders,
  createRateLimit,
  authRateLimit,
  apiRateLimit,
  uploadRateLimit,
  chatRateLimit,
  sanitizeInput,
  xssProtection,
  sqlInjectionProtection,
  validateContentType,
  requestSizeLimit,
  trackApiKeyUsage,
  corsOptions,
  commonValidations,
  logSecurityEvent
};
