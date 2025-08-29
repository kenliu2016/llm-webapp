import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { hashPassword, comparePassword, generateTokens, authenticate } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
// Mock database functions for compilation
const query = async (sql, params) => {
    // This would normally execute against a real database
    logger.info('Mock query executed', { sql, params });
    return { rows: [] };
};
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
const router = Router();
// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false
});
// Registration validation
const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
    body('confirmPassword')
        .custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return true;
    })
];
// Login validation
const loginValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];
// User registration
router.post('/register', authLimiter, registerValidation, async (req, res) => {
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
        const existingUser = await query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User with this email or username already exists'
            });
        }
        // Hash password
        const hashedPassword = await hashPassword(password);
        // Create user
        const userId = uuidv4();
        const defaultPreferences = {
            theme: 'light',
            defaultModel: 'gpt-3.5-turbo',
            temperature: 0.7,
            maxTokens: 2048,
            language: 'en'
        };
        await query(`INSERT INTO users (id, username, email, password_hash, role, preferences, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, username, email, hashedPassword, 'free', JSON.stringify(defaultPreferences), true]);
        // Generate tokens
        const user = { id: userId, username, email, role: 'free' };
        const { accessToken, refreshToken } = generateTokens(user);
        // Create session
        const sessionId = await createUserSession(userId, {
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });
        logger.info('User registered successfully', { userId, username, email });
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: {
                id: userId,
                username,
                email,
                role: 'free',
                preferences: defaultPreferences
            },
            tokens: {
                accessToken,
                refreshToken
            },
            sessionId
        });
    }
    catch (error) {
        logger.error('Registration error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
// User login
router.post('/login', authLimiter, loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const { email, password } = req.body;
        // Find user
        const userResult = await query('SELECT id, username, email, password_hash, role, preferences, is_active FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        const user = userResult.rows[0];
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
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
        const { accessToken, refreshToken } = generateTokens({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        });
        // Create session
        const sessionId = await createUserSession(user.id, {
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });
        // Update last login
        await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        logger.info('User logged in successfully', { userId: user.id, email });
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                preferences: user.preferences
            },
            tokens: {
                accessToken,
                refreshToken
            },
            sessionId
        });
    }
    catch (error) {
        logger.error('Login error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token required'
            });
        }
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        // Check if user still exists
        const userResult = await query('SELECT id, username, email, role FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }
        const user = userResult.rows[0];
        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = generateTokens({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        });
        res.json({
            success: true,
            tokens: {
                accessToken,
                refreshToken: newRefreshToken
            }
        });
    }
    catch (error) {
        logger.error('Token refresh error', { error: error.message });
        res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
});
// Get current user profile
router.get('/profile', authenticate, async (req, res) => {
    try {
        const user = req.user;
        // Get additional user stats
        const stats = await query(`SELECT 
         COUNT(DISTINCT c.id) as conversation_count,
         COUNT(m.id) as message_count,
         DATE_TRUNC('day', u.created_at) as member_since
       FROM users u
       LEFT JOIN conversations c ON c.user_id = u.id
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE u.id = $1
       GROUP BY u.id, u.created_at`, [user.id]);
        const userStats = stats.rows[0] || {
            conversation_count: 0,
            message_count: 0,
            member_since: new Date()
        };
        res.json({
            success: true,
            user: {
                ...user,
                stats: {
                    conversationCount: parseInt(userStats.conversation_count) || 0,
                    messageCount: parseInt(userStats.message_count) || 0,
                    memberSince: userStats.member_since
                }
            }
        });
    }
    catch (error) {
        logger.error('Profile fetch error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
// Update user preferences
router.patch('/preferences', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { theme, defaultModel, temperature, maxTokens, language } = req.body;
        const updates = {};
        if (theme !== undefined)
            updates.theme = theme;
        if (defaultModel !== undefined)
            updates.defaultModel = defaultModel;
        if (temperature !== undefined)
            updates.temperature = temperature;
        if (maxTokens !== undefined)
            updates.maxTokens = maxTokens;
        if (language !== undefined)
            updates.language = language;
        // Get current preferences
        const currentUser = await query('SELECT preferences FROM users WHERE id = $1', [user.id]);
        const currentPreferences = currentUser.rows[0]?.preferences || {};
        const newPreferences = { ...currentPreferences, ...updates };
        // Update preferences
        await query('UPDATE users SET preferences = $1 WHERE id = $2', [JSON.stringify(newPreferences), user.id]);
        logger.info('User preferences updated', { userId: user.id, updates });
        res.json({
            success: true,
            message: 'Preferences updated successfully',
            preferences: newPreferences
        });
    }
    catch (error) {
        logger.error('Preferences update error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
// Logout (invalidate session)
router.post('/logout', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (sessionId) {
            await invalidateUserSession(sessionId);
        }
        logger.info('User logged out', { userId: req.user.id });
        res.json({
            success: true,
            message: 'Logout successful'
        });
    }
    catch (error) {
        logger.error('Logout error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
export default router;
//# sourceMappingURL=auth_broken.js.map