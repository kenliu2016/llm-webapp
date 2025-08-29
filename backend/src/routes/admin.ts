import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { query } from '../database/connection.js';
import { healthCheck as redisHealthCheck } from '../services/redis.js';
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

const router = Router();

// Apply admin authentication to all routes
router.use(authenticate as any);
router.use(requireAdmin as any);

// Get admin dashboard overview
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // Get system statistics
    const systemStats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_week,
        (SELECT COUNT(*) FROM conversations) as total_conversations,
        (SELECT COUNT(*) FROM messages) as total_messages,
        (SELECT COALESCE(SUM(token_count), 0) FROM messages WHERE role = 'assistant') as total_tokens,
        (SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - INTERVAL '24 hours') as messages_today
    `);

    // Get user growth by day (last 30 days)
    const userGrowth = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Get usage by model
    const modelUsage = await query(`
      SELECT 
        model,
        COUNT(*) as message_count,
        COALESCE(SUM(token_count), 0) as total_tokens,
        COUNT(DISTINCT conversation_id) as conversation_count
      FROM messages 
      WHERE role = 'assistant' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY model
      ORDER BY message_count DESC
    `);

    // Get top users by activity
    const topUsers = await query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        COUNT(DISTINCT c.id) as conversation_count,
        COUNT(m.id) as message_count,
        COALESCE(SUM(m.token_count), 0) as total_tokens
      FROM users u
      LEFT JOIN conversations c ON c.user_id = u.id
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE u.is_active = true
      GROUP BY u.id, u.username, u.email, u.role, u.created_at
      ORDER BY message_count DESC
      LIMIT 10
    `);

    // Get system health
    const dbHealth = await query('SELECT NOW() as timestamp');
    const redisHealth = await redisHealthCheck();

    const stats = systemStats.rows[0] as any;

    res.json({
      success: true,
      dashboard: {
        stats: {
          activeUsers: parseInt(stats.active_users) || 0,
          newUsersThisWeek: parseInt(stats.new_users_week) || 0,
          totalConversations: parseInt(stats.total_conversations) || 0,
          totalMessages: parseInt(stats.total_messages) || 0,
          totalTokens: parseInt(stats.total_tokens) || 0,
          messagesToday: parseInt(stats.messages_today) || 0
        },
        userGrowth: userGrowth.rows.map((row: any) => ({
          date: row.date,
          newUsers: parseInt(row.new_users) || 0
        })),
        modelUsage: modelUsage.rows.map((row: any) => ({
          model: row.model,
          messageCount: parseInt(row.message_count) || 0,
          totalTokens: parseInt(row.total_tokens) || 0,
          conversationCount: parseInt(row.conversation_count) || 0
        })),
        topUsers: topUsers.rows.map((row: any) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          createdAt: row.created_at,
          conversationCount: parseInt(row.conversation_count) || 0,
          messageCount: parseInt(row.message_count) || 0,
          totalTokens: parseInt(row.total_tokens) || 0
        })),
        systemHealth: {
          database: dbHealth.rows.length > 0 ? 'healthy' : 'unhealthy',
          redis: redisHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error: any) {
    logger.error('Admin dashboard error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
});

// Get all users with pagination
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || '';
    const role = req.query.role as string || '';
    const status = req.query.status as string || '';

    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (status === 'active') {
      whereClause += ` AND is_active = true`;
    } else if (status === 'inactive') {
      whereClause += ` AND is_active = false`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM users WHERE ${whereClause}`;
    const countResult = await query(countQuery, params);
    const totalUsers = parseInt((countResult.rows[0] as any).count);

    // Get users with statistics
    const usersQuery = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.is_active,
        u.created_at,
        u.last_login,
        u.avatar_url,
        u.preferences,
        COUNT(DISTINCT c.id) as conversation_count,
        COUNT(m.id) as message_count,
        COALESCE(SUM(m.token_count), 0) as total_tokens
      FROM users u
      LEFT JOIN conversations c ON c.user_id = u.id
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE ${whereClause}
      GROUP BY u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.last_login, u.avatar_url, u.preferences
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const usersResult = await query(usersQuery, params);

    res.json({
      success: true,
      users: usersResult.rows.map((user: any) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        avatarUrl: user.avatar_url,
        preferences: user.preferences,
        stats: {
          conversationCount: parseInt(user.conversation_count) || 0,
          messageCount: parseInt(user.message_count) || 0,
          totalTokens: parseInt(user.total_tokens) || 0
        }
      })),
      pagination: {
        page,
        limit,
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit)
      }
    });

  } catch (error: any) {
    logger.error('Admin users fetch error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Update user role or status
const updateUserValidation = [
  body('role').optional().isIn(['free', 'pro', 'admin']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('Invalid status')
];

router.patch('/users/:userId', updateUserValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { role, isActive } = req.body;
    const adminUser = (req as AuthenticatedRequest).user!;

    // Prevent admin from deactivating themselves
    if (userId === adminUser.id && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (role !== undefined) {
      updates.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    updates.push(`updated_at = NOW()`);
    params.push(userId);

    const updateQuery = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, email, role, is_active
    `;

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updatedUser = result.rows[0] as any;

    logger.info('User updated by admin', {
      adminId: adminUser.id,
      userId,
      updates: { role, isActive }
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        isActive: updatedUser.is_active
      }
    });

  } catch (error: any) {
    logger.error('Admin user update error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Get system analytics
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;

    // Usage analytics
    const usageAnalytics = await query(`
      SELECT 
        DATE(m.created_at) as date,
        COUNT(*) as message_count,
        COUNT(DISTINCT m.conversation_id) as conversation_count,
        COUNT(DISTINCT c.user_id) as active_users,
        COALESCE(SUM(m.token_count), 0) as total_tokens
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.created_at >= NOW() - INTERVAL '${period} days'
        AND m.role = 'user'
      GROUP BY DATE(m.created_at)
      ORDER BY date DESC
    `);

    // Model performance
    const modelPerformance = await query(`
      SELECT 
        m.model,
        COUNT(*) as usage_count,
        AVG(m.token_count) as avg_tokens,
        COUNT(DISTINCT m.conversation_id) as conversation_count,
        COUNT(DISTINCT c.user_id) as user_count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.created_at >= NOW() - INTERVAL '${period} days'
        AND m.role = 'assistant'
      GROUP BY m.model
      ORDER BY usage_count DESC
    `);

    // Error rates (would need error tracking implementation)
    const errorRates = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as error_count
      FROM system_logs 
      WHERE created_at >= NOW() - INTERVAL '${period} days'
        AND level = 'error'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      success: true,
      analytics: {
        period: parseInt(period as string),
        usage: usageAnalytics.rows.map((row: any) => ({
          date: row.date,
          messageCount: parseInt(row.message_count) || 0,
          conversationCount: parseInt(row.conversation_count) || 0,
          activeUsers: parseInt(row.active_users) || 0,
          totalTokens: parseInt(row.total_tokens) || 0
        })),
        modelPerformance: modelPerformance.rows.map((row: any) => ({
          model: row.model,
          usageCount: parseInt(row.usage_count) || 0,
          avgTokens: parseFloat(row.avg_tokens) || 0,
          conversationCount: parseInt(row.conversation_count) || 0,
          userCount: parseInt(row.user_count) || 0
        })),
        errorRates: errorRates.rows.map((row: any) => ({
          date: row.date,
          errorCount: parseInt(row.error_count) || 0
        }))
      }
    });

  } catch (error: any) {
    logger.error('Admin analytics error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

// Get system health and monitoring
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Database health
    const dbStart = Date.now();
    const dbResult = await query('SELECT 1');
    const dbLatency = Date.now() - dbStart;

    // Redis health
    const redisHealth = await redisHealthCheck();

    // System resources (basic)
    const systemInfo = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      platform: process.platform
    };

    // Database statistics
    const dbStats = await query(`
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    `);

    res.json({
      success: true,
      health: {
        database: {
          status: dbResult.rows.length > 0 ? 'healthy' : 'unhealthy',
          latency: `${dbLatency}ms`,
          stats: dbStats.rows
        },
        redis: redisHealth,
        system: systemInfo,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    logger.error('Admin health check error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health status',
      health: {
        database: { status: 'unhealthy' },
        redis: { status: 'unhealthy' },
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Get API key management
router.get('/api-keys', async (req: Request, res: Response) => {
  try {
    const apiKeys = await query(`
      SELECT 
        ak.id,
        ak.name,
        ak.key_preview,
        ak.is_active,
        ak.created_at,
        ak.last_used_at,
        u.username as created_by
      FROM api_keys ak
      JOIN users u ON u.id = ak.user_id
      ORDER BY ak.created_at DESC
    `);

    res.json({
      success: true,
      apiKeys: apiKeys.rows.map((key: any) => ({
        id: key.id,
        name: key.name,
        keyPreview: key.key_preview,
        isActive: key.is_active,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        createdBy: key.created_by
      }))
    });

  } catch (error: any) {
    logger.error('Admin API keys fetch error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch API keys'
    });
  }
});

// Deactivate API key
router.patch('/api-keys/:keyId/deactivate', async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;

    const result = await query(
      'UPDATE api_keys SET is_active = false WHERE id = $1 RETURNING id, name',
      [keyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    logger.info('API key deactivated by admin', {
      adminId: (req as AuthenticatedRequest).user!.id,
      keyId
    });

    res.json({
      success: true,
      message: 'API key deactivated successfully'
    });

  } catch (error: any) {
    logger.error('Admin API key deactivation error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate API key'
    });
  }
});

export default router;
