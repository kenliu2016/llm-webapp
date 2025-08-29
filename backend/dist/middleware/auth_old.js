import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import winston from 'winston';
// Mock database query function for now
const query = async (sql, params = []) => {
    // This should be replaced with actual database connection
    return { rows: [] };
};
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
;
session ?  : any;
// Authentication middleware
export const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Check if user still exists and is active
        const userResult = await query('SELECT id, username, email, role, is_active, preferences, created_at, last_login FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }
        const user = userResult.rows[0];
        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            preferences: user.preferences
        };
        // Update last seen
        await query('UPDATE users SET last_login = NOW() WHERE id = $1', [req.user.id]);
        next();
    }
    catch (error) {
        logger.error('Authentication failed', { error: error.message });
        return res.status(401).json({ error: 'Invalid token' });
    }
};
// Authorization middleware for admin routes
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userResult = await query('SELECT id, username, email, role, preferences FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
            if (userResult.rows.length > 0) {
                const user = userResult.rows[0];
                req.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    preferences: user.preferences
                };
            }
        }
    }
    catch (error) {
        // Silently ignore authentication errors for optional auth
        logger.debug('Optional auth failed', { error: error.message });
    }
    next();
};
// Password utilities
export const hashPassword = async (password) => {
    return bcrypt.hash(password, 12);
};
export const comparePassword = async (password, hashedPassword) => {
    return bcrypt.compare(password, hashedPassword);
};
// JWT utilities
export const generateTokens = (user) => {
    const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
    };
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
    const refreshSecret = process.env.REFRESH_TOKEN_SECRET || 'fallback-refresh-secret';
    const accessTokenOptions = {
        expiresIn: (process.env.JWT_EXPIRES_IN || '15m')
    };
    const refreshTokenOptions = {
        expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d')
    };
    const accessToken = jwt.sign(payload, jwtSecret, accessTokenOptions);
    const refreshToken = jwt.sign(payload, refreshSecret, refreshTokenOptions);
    return { accessToken, refreshToken };
};
// Session management
export const createUserSession = async (userId, deviceInfo) => {
    const sessionId = require('uuid').v4();
    const sessionData = {
        userId,
        deviceInfo,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
    };
    await sessionService.storeSession(sessionId, sessionData, 7 * 24 * 60 * 60); // 7 days
    return sessionId;
};
export const invalidateUserSession = async (sessionId) => {
    await sessionService.deleteSession(sessionId);
};
// Rate limiting by user tier
export const getUserTierLimits = (role) => {
    const limits = {
        free: { requestsPerHour: 10, tokensPerDay: 1000 },
        pro: { requestsPerHour: 100, tokensPerDay: 50000 },
        admin: { requestsPerHour: 1000, tokensPerDay: 1000000 }
    };
    return limits[role] || limits.free;
};
export default {
    authenticate,
    requireAdmin,
    optionalAuth,
    hashPassword,
    comparePassword,
    generateTokens,
    createUserSession,
    invalidateUserSession,
    getUserTierLimits
};
//# sourceMappingURL=auth_old.js.map