import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { 
  hashPassword, 
  comparePassword, 
  generateTokens, 
  createSession,
  authenticate,
  AuthenticatedRequest 
} from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

// Mock database functions for compilation
const query = async (sql: string, params?: any[]): Promise<any> => {
  // This would normally execute against a real database
  logger.info('Mock query executed', { sql, params });
  return { rows: [] };
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'auth.log' })
  ]
});

const router = Router();

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, and underscores'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
];

const loginValidation = [
  body('username')
    .notEmpty()
    .withMessage('Username is required'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Routes
router.post('/register', authLimiter, registerValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const userId = uuidv4();
    await query(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [userId, username, email, hashedPassword, 'free']
    );

    // Generate tokens
    const user = {
      id: userId,
      username,
      email,
      role: 'free'
    };
    
    const { accessToken, refreshToken } = generateTokens(userId);

    // Create session
    const sessionId = await createSession(userId, {
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logger.info('User registered successfully', { 
      userId, 
      username, 
      email,
      sessionId 
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        accessToken
      }
    });

  } catch (error: any) {
    logger.error('Registration error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.post('/login', authLimiter, loginValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { username, password } = req.body;

    // Find user
    const userResult = await query(
      'SELECT id, username, email, password_hash, role FROM users WHERE username = $1',
      [username]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Create session
    const sessionId = await createSession(user.id, {
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logger.info('User logged in successfully', { 
      userId: user.id, 
      username: user.username,
      sessionId 
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        accessToken
      }
    });

  } catch (error: any) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided'
      });
    }

    const decoded = jwt.verify(refreshToken, 'fallback_secret') as any;
    const userId = decoded.userId;

    // Find user
    const userResult = await query(
      'SELECT id, username, email, role FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id);

    // Update refresh token cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      data: {
        accessToken
      }
    });

  } catch (error: any) {
    logger.error('Token refresh error', { error: error.message });
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
});

router.get('/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const userResult = await query(
      'SELECT id, username, email, role, preferences, created_at FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user statistics
    const statsResult = await query(
      `SELECT 
         COUNT(*) as total_conversations,
         SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) as conversations_this_month
       FROM conversations WHERE user_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0] || { total_conversations: 0, conversations_this_month: 0 };

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          preferences: user.preferences || {},
          createdAt: user.created_at
        },
        stats: {
          totalConversations: parseInt(stats.total_conversations),
          conversationsThisMonth: parseInt(stats.conversations_this_month)
        }
      }
    });

  } catch (error: any) {
    logger.error('Profile fetch error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.patch('/preferences', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { preferences } = req.body;

    // Validate preferences structure
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid preferences format'
      });
    }

    // Update user preferences
    await query(
      'UPDATE users SET preferences = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(preferences), userId]
    );

    logger.info('User preferences updated', { userId, preferences });

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences
      }
    });

  } catch (error: any) {
    logger.error('Preferences update error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    
    if (sessionId) {
      // Invalidate session (simplified for mock)
      logger.info('Session invalidated', { sessionId });
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    logger.info('User logged out', { userId: req.user!.id });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error: any) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
