import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, comparePassword } from '../middleware/auth.js';
import { query } from '../database/connection.js';
import winston from 'winston';
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
const router = Router();
// Get user dashboard data
router.get('/dashboard', authenticate, async (req, res) => {
    try {
        const user = req.user;
        // Get user statistics
        const statsQuery = `
      SELECT 
        COUNT(DISTINCT c.id) as conversation_count,
        COUNT(m.id) as message_count,
        COALESCE(SUM(m.token_count), 0) as total_tokens,
        COUNT(CASE WHEN c.created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as conversations_this_week,
        COUNT(CASE WHEN m.created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as messages_today
      FROM users u
      LEFT JOIN conversations c ON c.user_id = u.id
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE u.id = $1
      GROUP BY u.id
    `;
        const statsResult = await query(statsQuery, [user.id]);
        const stats = statsResult.rows[0] || {};
        // Get recent conversations
        const recentConversationsQuery = `
      SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count,
        m.content as last_message
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN (
        SELECT conversation_id, MAX(created_at) as max_date
        FROM messages 
        GROUP BY conversation_id
      ) latest ON c.id = latest.conversation_id AND m.created_at = latest.max_date
      WHERE c.user_id = $1
      GROUP BY c.id, c.title, c.created_at, c.updated_at, m.content
      ORDER BY c.updated_at DESC
      LIMIT 10
    `;
        const recentConversations = await query(recentConversationsQuery, [user.id]);
        // Get usage by model
        const modelUsageQuery = `
      SELECT 
        m.model,
        COUNT(*) as message_count,
        COALESCE(SUM(m.token_count), 0) as total_tokens
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1 AND m.role = 'assistant'
      GROUP BY m.model
      ORDER BY message_count DESC
    `;
        const modelUsage = await query(modelUsageQuery, [user.id]);
        // Get daily usage for the last 30 days
        const dailyUsageQuery = `
      SELECT 
        DATE(m.created_at) as date,
        COUNT(*) as message_count,
        COALESCE(SUM(m.token_count), 0) as token_count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1 
        AND m.created_at >= NOW() - INTERVAL '30 days'
        AND m.role = 'user'
      GROUP BY DATE(m.created_at)
      ORDER BY date DESC
    `;
        const dailyUsage = await query(dailyUsageQuery, [user.id]);
        res.json({
            success: true,
            dashboard: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    preferences: user.preferences
                },
                stats: {
                    conversationCount: parseInt(stats.conversation_count) || 0,
                    messageCount: parseInt(stats.message_count) || 0,
                    totalTokens: parseInt(stats.total_tokens) || 0,
                    conversationsThisWeek: parseInt(stats.conversations_this_week) || 0,
                    messagesToday: parseInt(stats.messages_today) || 0
                },
                recentConversations: recentConversations.rows.map((conv) => ({
                    id: conv.id,
                    title: conv.title,
                    createdAt: conv.created_at,
                    updatedAt: conv.updated_at,
                    messageCount: parseInt(conv.message_count) || 0,
                    lastMessage: conv.last_message
                })),
                modelUsage: modelUsage.rows.map((usage) => ({
                    model: usage.model,
                    messageCount: parseInt(usage.message_count) || 0,
                    totalTokens: parseInt(usage.total_tokens) || 0
                })),
                dailyUsage: dailyUsage.rows.map((usage) => ({
                    date: usage.date,
                    messageCount: parseInt(usage.message_count) || 0,
                    tokenCount: parseInt(usage.token_count) || 0
                }))
            }
        });
    }
    catch (error) {
        logger.error('Dashboard data fetch error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data'
        });
    }
});
// Get user usage statistics
router.get('/usage', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { period = '30' } = req.query;
        const usageQuery = `
      SELECT 
        DATE(m.created_at) as date,
        m.model,
        COUNT(*) as message_count,
        COALESCE(SUM(m.token_count), 0) as token_count,
        COALESCE(AVG(m.token_count), 0) as avg_tokens_per_message
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1 
        AND m.created_at >= NOW() - INTERVAL '${period} days'
        AND m.role = 'assistant'
      GROUP BY DATE(m.created_at), m.model
      ORDER BY date DESC
    `;
        const usage = await query(usageQuery, [user.id]);
        // Get tier limits
        const tierLimits = {
            free: { dailyTokens: 1000, monthlyTokens: 10000 },
            pro: { dailyTokens: 50000, monthlyTokens: 500000 },
            admin: { dailyTokens: 1000000, monthlyTokens: 10000000 }
        };
        const userLimits = tierLimits[user.role] || tierLimits.free;
        res.json({
            success: true,
            usage: {
                period: parseInt(period),
                data: usage.rows.map((row) => ({
                    date: row.date,
                    model: row.model,
                    messageCount: parseInt(row.message_count) || 0,
                    tokenCount: parseInt(row.token_count) || 0,
                    avgTokensPerMessage: parseFloat(row.avg_tokens_per_message) || 0
                })),
                limits: userLimits
            }
        });
    }
    catch (error) {
        logger.error('Usage statistics fetch error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch usage statistics'
        });
    }
});
// Update user preferences with validation
const preferencesValidation = [
    body('theme').optional().isIn(['light', 'dark', 'auto']).withMessage('Invalid theme'),
    body('defaultModel').optional().isString().withMessage('Invalid model'),
    body('temperature').optional().isFloat({ min: 0, max: 2 }).withMessage('Temperature must be between 0 and 2'),
    body('maxTokens').optional().isInt({ min: 1, max: 4096 }).withMessage('Max tokens must be between 1 and 4096'),
    body('language').optional().isString().withMessage('Invalid language'),
    body('systemPrompt').optional().isString().withMessage('Invalid system prompt'),
    body('enableNotifications').optional().isBoolean().withMessage('Invalid notification setting'),
    body('autoSave').optional().isBoolean().withMessage('Invalid auto-save setting')
];
router.patch('/preferences', authenticate, preferencesValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const user = req.user;
        const updates = req.body;
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
        logger.error('Preferences update error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to update preferences'
        });
    }
});
// Export conversation data
router.get('/export', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { format = 'json', conversationId } = req.query;
        let conversations;
        if (conversationId) {
            // Export specific conversation
            conversations = await query(`SELECT c.*, array_agg(
          json_build_object(
            'id', m.id,
            'role', m.role,
            'content', m.content,
            'model', m.model,
            'token_count', m.token_count,
            'created_at', m.created_at
          ) ORDER BY m.created_at
        ) as messages
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.id = $1 AND c.user_id = $2
        GROUP BY c.id`, [conversationId, user.id]);
        }
        else {
            // Export all conversations
            conversations = await query(`SELECT c.*, array_agg(
          json_build_object(
            'id', m.id,
            'role', m.role,
            'content', m.content,
            'model', m.model,
            'token_count', m.token_count,
            'created_at', m.created_at
          ) ORDER BY m.created_at
        ) as messages
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.user_id = $1
        GROUP BY c.id
        ORDER BY c.created_at DESC`, [user.id]);
        }
        const exportData = {
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            exportedAt: new Date().toISOString(),
            conversations: conversations.rows
        };
        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="conversations-export-${Date.now()}.json"`);
            res.json(exportData);
        }
        else {
            res.status(400).json({
                success: false,
                message: 'Unsupported export format'
            });
        }
    }
    catch (error) {
        logger.error('Data export error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to export data'
        });
    }
});
// Delete user account
router.delete('/account', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { confirmPassword } = req.body;
        if (!confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Password confirmation required'
            });
        }
        // Get user with password hash to verify
        const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        const userRecord = userResult.rows[0];
        // For OAuth users (no password), allow deletion with any confirmation
        if (!userRecord.password_hash) {
            // Mark user as inactive instead of deleting
            await query('UPDATE users SET is_active = false, deleted_at = NOW() WHERE id = $1', [user.id]);
        }
        else {
            // Verify password for regular users
            const isValidPassword = await comparePassword(confirmPassword, userRecord.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid password'
                });
            }
            // Mark user as inactive
            await query('UPDATE users SET is_active = false, deleted_at = NOW() WHERE id = $1', [user.id]);
        }
        logger.info('User account deleted', { userId: user.id });
        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    }
    catch (error) {
        logger.error('Account deletion error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to delete account'
        });
    }
});
export default router;
//# sourceMappingURL=user_broken.js.map