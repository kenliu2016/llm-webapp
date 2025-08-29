import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import winston from 'winston';
// Mock database query function
const query = async (_sql, _params = []) => {
    return { rows: [] };
};
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
// Main authentication middleware
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                message: 'Access token required'
            });
            return;
        }
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, 'fallback_secret');
            // Get user details from database
            const userResult = await query('SELECT id, username, email, role FROM users WHERE id = $1', [decoded.userId]);
            const user = userResult.rows[0];
            if (!user) {
                res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            // Add user to request object
            req.user = {
                id: user.id || '',
                username: user.username || '',
                email: user.email || '',
                role: user.role || 'free',
                preferences: {}
            };
            next();
        }
        catch (jwtError) {
            logger.warn('Invalid JWT token', { error: jwtError.message });
            res.status(401).json({
                success: false,
                message: 'Invalid access token'
            });
            return;
        }
    }
    catch (error) {
        logger.error('Authentication middleware error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};
// Admin role requirement middleware
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
        return;
    }
    if (req.user.role !== 'admin') {
        res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
        return;
    }
    next();
};
// Optional authentication (doesn't block if no token)
export const optionalAuth = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next();
            return;
        }
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
            const userResult = await query('SELECT id, username, email, role, preferences FROM users WHERE id = $1', [decoded.userId]);
            if (userResult.rows.length > 0) {
                req.user = userResult.rows[0];
            }
        }
        catch (jwtError) {
            // Ignore JWT errors in optional auth
            logger.debug('Optional auth failed', { error: jwtError.message });
        }
        next();
    }
    catch (error) {
        logger.debug('Optional auth failed', { error: error.message });
        next();
    }
};
// JWT token generation
export const generateTokens = (userId) => {
    const accessToken = jwt.sign({ userId, type: 'access' }, process.env.JWT_SECRET || 'fallback-secret', {
        expiresIn: '15m',
        algorithm: 'HS256'
    });
    const refreshToken = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret', {
        expiresIn: '7d',
        algorithm: 'HS256'
    });
    return { accessToken, refreshToken };
};
// Password utilities
export const hashPassword = async (password) => {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');
    return bcrypt.hash(password, saltRounds);
};
export const comparePassword = async (password, hashedPassword) => {
    return bcrypt.compare(password, hashedPassword);
};
// Session management (simplified)
export const createSession = async (userId, deviceInfo = {}) => {
    const sessionId = `session_${userId}_${Date.now()}`;
    // Store session (would normally use Redis)
    logger.info('Session created', { sessionId, userId, deviceInfo });
    return sessionId;
};
export const destroySession = async (sessionId) => {
    // Delete session (would normally use Redis)
    logger.info('Session destroyed', { sessionId });
};
// User tier rate limits
export const getUserTierLimits = (role) => {
    switch (role) {
        case 'admin':
            return { requestsPerMinute: 1000, requestsPerHour: 10000, filesPerDay: 1000 };
        case 'pro':
            return { requestsPerMinute: 100, requestsPerHour: 1000, filesPerDay: 100 };
        case 'free':
        default:
            return { requestsPerMinute: 20, requestsPerHour: 100, filesPerDay: 10 };
    }
};
export default {
    authenticate,
    requireAdmin,
    optionalAuth,
    generateTokens,
    hashPassword,
    comparePassword,
    createSession,
    destroySession,
    getUserTierLimits
};
//# sourceMappingURL=auth.js.map