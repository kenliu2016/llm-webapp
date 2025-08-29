import { Router } from 'express';
import passport from '../config/passport.js';
import { generateTokens, createSession } from '../middleware/auth.js';
import winston from 'winston';
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
const router = Router();
// Google OAuth login
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
}));
// Google OAuth callback
router.get('/google/callback', passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login?error=oauth_failed`
}), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login?error=oauth_failed`);
        }
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user.id);
        // Create session
        const sessionId = await createSession(user.id, {
            userAgent: 'Google OAuth',
            provider: 'google'
        });
        logger.info('Google OAuth successful', { userId: user.id, email: user.email });
        // Redirect to frontend with tokens
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const queryParams = new URLSearchParams({
            access_token: accessToken,
            refresh_token: refreshToken,
            session_id: sessionId
        });
        res.redirect(`${frontendUrl}/auth/callback?${queryParams.toString()}`);
    }
    catch (error) {
        logger.error('Google OAuth callback error', { error: error.message });
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login?error=oauth_error`);
    }
});
// Link Google account to existing user
router.post('/google/link', passport.authenticate('jwt', { session: false }), passport.authenticate('google', { session: false }), async (req, res) => {
    try {
        // This would be called after user is already authenticated
        // and wants to link their Google account
        res.json({
            success: true,
            message: 'Google account linked successfully'
        });
    }
    catch (error) {
        logger.error('Google account linking error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to link Google account'
        });
    }
});
export default router;
//# sourceMappingURL=oauth.js.map