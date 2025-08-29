import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, comparePassword } from '../middleware/auth';
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
        MAX(c.updated_at) as last_conversation_date
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = $1
      GROUP BY c.user_id
    `;
        const statsResult = await query(statsQuery, [user.id]);
        const stats = statsResult.rows[0] || {
            conversation_count: 0,
            message_count: 0,
            total_tokens: 0,
            last_conversation_date: null
        };
        // Get recent conversations
        const conversationsQuery = `
      SELECT 
        c.id,
        c.title,
        c.updated_at,
        c.model_name,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = $1
      GROUP BY c.id, c.title, c.updated_at, c.model_name
      ORDER BY c.updated_at DESC
      LIMIT 10
    `;
        const conversationsResult = await query(conversationsQuery, [user.id]);
        const conversations = conversationsResult.rows;
        // Get usage analytics for current month
        const usageQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as messages,
        COALESCE(SUM(token_count), 0) as tokens
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = $1 
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
        const usageResult = await query(usageQuery, [user.id]);
        const usage = usageResult.rows;
        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                stats: {
                    conversationCount: parseInt(stats.conversation_count),
                    messageCount: parseInt(stats.message_count),
                    totalTokens: parseInt(stats.total_tokens),
                    lastConversationDate: stats.last_conversation_date
                },
                recentConversations: conversations.map((conv) => ({
                    id: conv.id,
                    title: conv.title,
                    updatedAt: conv.updated_at,
                    modelName: conv.model_name,
                    messageCount: parseInt(conv.message_count)
                })),
                usage: usage.map((day) => ({
                    date: day.date,
                    messages: parseInt(day.messages),
                    tokens: parseInt(day.tokens)
                }))
            }
        });
    }
    catch (error) {
        logger.error('Dashboard data fetch error', {
            error: error.message,
            userId: req.user?.id
        });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data'
        });
    }
});
// Get user conversations with pagination
router.get('/conversations', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        // Get total count
        const countResult = await query('SELECT COUNT(*) as total FROM conversations WHERE user_id = $1', [user.id]);
        const total = parseInt(countResult.rows[0]?.total || '0');
        // Get conversations
        const conversationsQuery = `
      SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        c.model_name,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = $1
      GROUP BY c.id, c.title, c.created_at, c.updated_at, c.model_name
      ORDER BY c.updated_at DESC
      LIMIT $2 OFFSET $3
    `;
        const conversationsResult = await query(conversationsQuery, [user.id, limit, offset]);
        const conversations = conversationsResult.rows;
        res.json({
            success: true,
            data: {
                conversations: conversations.map((conv) => ({
                    id: conv.id,
                    title: conv.title,
                    createdAt: conv.created_at,
                    updatedAt: conv.updated_at,
                    modelName: conv.model_name,
                    messageCount: parseInt(conv.message_count),
                    lastMessageAt: conv.last_message_at
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    }
    catch (error) {
        logger.error('Conversations fetch error', {
            error: error.message,
            userId: req.user?.id
        });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations'
        });
    }
});
// Delete a conversation
router.delete('/conversations/:conversationId', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { conversationId } = req.params;
        // Verify conversation belongs to user
        const conversationResult = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, user.id]);
        if (conversationResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        // Delete messages first (cascade)
        await query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);
        // Delete conversation
        await query('DELETE FROM conversations WHERE id = $1', [conversationId]);
        logger.info('Conversation deleted', {
            conversationId,
            userId: user.id
        });
        res.json({
            success: true,
            message: 'Conversation deleted successfully'
        });
    }
    catch (error) {
        logger.error('Conversation deletion error', {
            error: error.message,
            conversationId: req.params.conversationId,
            userId: req.user?.id
        });
        res.status(500).json({
            success: false,
            message: 'Failed to delete conversation'
        });
    }
});
// Update user profile
router.put('/profile', authenticate, [
    body('email').optional().isEmail().normalizeEmail(),
    body('preferences').optional().isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const user = req.user;
        const { email, preferences } = req.body;
        const updates = [];
        const values = [];
        let paramCount = 1;
        if (email && email !== user.email) {
            // Check if email is already taken
            const existingUser = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, user.id]);
            if (existingUser.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Email address is already in use'
                });
            }
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        if (preferences) {
            updates.push(`preferences = $${paramCount++}`);
            values.push(JSON.stringify(preferences));
        }
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid updates provided'
            });
        }
        updates.push(`updated_at = NOW()`);
        values.push(user.id);
        const updateQuery = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, username, email, role, preferences
    `;
        const result = await query(updateQuery, values);
        const updatedUser = result.rows[0];
        logger.info('User profile updated', {
            userId: user.id,
            updates: Object.keys(req.body)
        });
        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: updatedUser.id,
                    username: updatedUser.username,
                    email: updatedUser.email,
                    role: updatedUser.role,
                    preferences: updatedUser.preferences || {}
                }
            }
        });
    }
    catch (error) {
        logger.error('Profile update error', {
            error: error.message,
            userId: req.user?.id
        });
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});
// Change password
router.put('/password', authenticate, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('New password must be at least 8 characters with uppercase, lowercase, number, and special character')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const user = req.user;
        const { currentPassword, newPassword } = req.body;
        // Get current password hash
        const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
        const userData = userResult.rows[0];
        if (!userData) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Verify current password
        const isCurrentPasswordValid = await comparePassword(currentPassword, userData.password_hash);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }
        // Hash new password
        const bcrypt = require('bcryptjs');
        const newPasswordHash = await bcrypt.hash(newPassword, 12);
        // Update password
        await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newPasswordHash, user.id]);
        logger.info('Password changed', { userId: user.id });
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    }
    catch (error) {
        logger.error('Password change error', {
            error: error.message,
            userId: req.user?.id
        });
        res.status(500).json({
            success: false,
            message: 'Failed to change password'
        });
    }
});
// Export conversations
router.get('/export', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const format = req.query.format || 'json';
        // Get all conversations with messages
        const exportQuery = `
      SELECT 
        c.id as conversation_id,
        c.title,
        c.created_at as conversation_created_at,
        c.model_name,
        m.id as message_id,
        m.role,
        m.content,
        m.created_at as message_created_at
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC, m.created_at ASC
    `;
        const result = await query(exportQuery, [user.id]);
        const rows = result.rows;
        // Group messages by conversation
        const conversations = {};
        rows.forEach((row) => {
            if (!conversations[row.conversation_id]) {
                conversations[row.conversation_id] = {
                    id: row.conversation_id,
                    title: row.title,
                    createdAt: row.conversation_created_at,
                    modelName: row.model_name,
                    messages: []
                };
            }
            if (row.message_id) {
                conversations[row.conversation_id].messages.push({
                    id: row.message_id,
                    role: row.role,
                    content: row.content,
                    createdAt: row.message_created_at
                });
            }
        });
        const exportData = {
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            exportedAt: new Date().toISOString(),
            conversations: Object.values(conversations)
        };
        if (format === 'csv') {
            // Convert to CSV format
            let csv = 'Conversation ID,Title,Model,Message Role,Content,Created At\\n';
            Object.values(conversations).forEach((conv) => {
                conv.messages.forEach((msg) => {
                    csv += `"${conv.id}","${conv.title}","${conv.modelName}","${msg.role}","${msg.content.replace(/"/g, '""')}","${msg.createdAt}"\\n`;
                });
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="conversations.csv"');
            res.send(csv);
        }
        else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="conversations.json"');
            res.json(exportData);
        }
        logger.info('Data exported', {
            userId: user.id,
            format,
            conversationCount: Object.keys(conversations).length
        });
    }
    catch (error) {
        logger.error('Data export error', {
            error: error.message,
            userId: req.user?.id
        });
        res.status(500).json({
            success: false,
            message: 'Failed to export data'
        });
    }
});
export default router;
//# sourceMappingURL=user.js.map