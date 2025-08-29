import { RedisService } from './redisService.js';
import { DatabaseService } from './databaseService.js';
import { logger } from '../utils/logger.js';
export class ChatHistoryService {
    constructor() {
        this.redis = new RedisService();
        this.db = new DatabaseService();
    }
    /**
     * Save a message to chat history
     */
    async saveMessage(userId, sessionId, message) {
        try {
            // Generate message ID
            const messageId = this.generateMessageId();
            const messageWithId = {
                id: messageId,
                ...message
            };
            // Save to database for persistence
            await this.saveMessageToDatabase(userId, sessionId, messageWithId);
            // Cache recent messages in Redis for quick access
            await this.cacheRecentMessages(userId, sessionId);
            logger.debug(`Message saved: ${messageId} in session ${sessionId}`);
            return messageWithId;
        }
        catch (error) {
            logger.error('Error saving message:', error);
            throw error;
        }
    }
    /**
     * Get chat history for a user/session
     */
    async getChatHistory(userId, sessionId, limit = 50, offset = 0) {
        try {
            // Try to get from cache first for recent messages
            if (sessionId && offset === 0 && limit <= 20) {
                const cachedMessages = await this.redis.getChatHistory(userId, sessionId);
                if (cachedMessages) {
                    return {
                        messages: cachedMessages.slice(0, limit),
                        total: cachedMessages.length
                    };
                }
            }
            // Fallback to database
            return await this.getChatHistoryFromDatabase(userId, sessionId, limit, offset);
        }
        catch (error) {
            logger.error('Error retrieving chat history:', error);
            throw error;
        }
    }
    /**
     * Get context messages for LLM (last N messages)
     */
    async getContextMessages(userId, sessionId, limit = 10) {
        try {
            if (!sessionId) {
                return [];
            }
            // Try cache first
            const cachedMessages = await this.redis.getChatHistory(userId, sessionId);
            if (cachedMessages && cachedMessages.length > 0) {
                return cachedMessages.slice(-limit);
            }
            // Fallback to database
            const history = await this.getChatHistoryFromDatabase(userId, sessionId, limit, 0);
            return history.messages.slice(-limit);
        }
        catch (error) {
            logger.error('Error retrieving context messages:', error);
            return [];
        }
    }
    /**
     * Clear a chat session
     */
    async clearSession(userId, sessionId) {
        try {
            // Clear from database
            await this.clearSessionFromDatabase(userId, sessionId);
            // Clear from cache
            const cacheKey = `chat_history:${userId}:${sessionId}`;
            await this.redis.getTempData(cacheKey); // This will effectively delete it
            logger.info(`Session cleared: ${sessionId} for user ${userId}`);
            return true;
        }
        catch (error) {
            logger.error('Error clearing session:', error);
            return false;
        }
    }
    /**
     * Get user's chat sessions
     */
    async getUserSessions(userId, limit = 20, offset = 0) {
        try {
            return await this.getUserSessionsFromDatabase(userId, limit, offset);
        }
        catch (error) {
            logger.error('Error retrieving user sessions:', error);
            throw error;
        }
    }
    /**
     * Create a new chat session
     */
    async createSession(userId, title) {
        try {
            const sessionId = this.generateSessionId(userId);
            const session = {
                id: sessionId,
                userId,
                title: title || `Chat ${new Date().toLocaleDateString()}`,
                createdAt: new Date(),
                updatedAt: new Date(),
                messageCount: 0
            };
            await this.saveSessionToDatabase(session);
            logger.info(`New chat session created: ${sessionId} for user ${userId}`);
            return session;
        }
        catch (error) {
            logger.error('Error creating session:', error);
            throw error;
        }
    }
    /**
     * Update session title
     */
    async updateSessionTitle(userId, sessionId, title) {
        try {
            const updated = await this.updateSessionInDatabase(userId, sessionId, { title });
            if (updated) {
                logger.info(`Session title updated: ${sessionId}`);
            }
            return updated;
        }
        catch (error) {
            logger.error('Error updating session title:', error);
            return false;
        }
    }
    /**
     * Get session statistics
     */
    async getSessionStats(userId, sessionId) {
        try {
            return await this.getSessionStatsFromDatabase(userId, sessionId);
        }
        catch (error) {
            logger.error('Error retrieving session stats:', error);
            return { messageCount: 0, tokensUsed: 0, duration: 0 };
        }
    }
    // Private helper methods
    async saveMessageToDatabase(userId, sessionId, message) {
        // This would normally use a database ORM like Prisma
        // For now, we'll use a simple in-memory approach or file-based storage
        // In production, this should be replaced with actual database operations
        try {
            // Simulate database save
            await new Promise(resolve => setTimeout(resolve, 10));
            // Update session's last activity
            await this.updateSessionInDatabase(userId, sessionId, {
                updatedAt: new Date(),
                lastMessage: message.content.substring(0, 100)
            });
        }
        catch (error) {
            logger.error('Error saving message to database:', error);
            throw error;
        }
    }
    async getChatHistoryFromDatabase(userId, sessionId, limit = 50, offset = 0) {
        // This would normally query the database
        // For now, return empty results
        return {
            messages: [],
            total: 0
        };
    }
    async clearSessionFromDatabase(userId, sessionId) {
        // This would normally delete from database
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    async getUserSessionsFromDatabase(userId, limit, offset) {
        // This would normally query the database
        return {
            sessions: [],
            total: 0
        };
    }
    async saveSessionToDatabase(session) {
        // This would normally save to database
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    async updateSessionInDatabase(userId, sessionId, updates) {
        // This would normally update the database
        await new Promise(resolve => setTimeout(resolve, 10));
        return true;
    }
    async getSessionStatsFromDatabase(userId, sessionId) {
        // This would normally query the database for stats
        return {
            messageCount: 0,
            tokensUsed: 0,
            duration: 0
        };
    }
    async cacheRecentMessages(userId, sessionId) {
        try {
            // Get recent messages from database and cache them
            const recent = await this.getChatHistoryFromDatabase(userId, sessionId, 20, 0);
            await this.redis.setChatHistory(userId, sessionId, recent.messages, 3600); // Cache for 1 hour
        }
        catch (error) {
            logger.error('Error caching recent messages:', error);
        }
    }
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    generateSessionId(userId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `${userId}_${timestamp}_${random}`;
    }
    /**
     * Clean up old chat history
     */
    async cleanupOldHistory(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            // This would normally delete old records from database
            logger.info(`Chat history cleanup would remove messages older than ${cutoffDate.toISOString()}`);
            return 0; // Return number of deleted records
        }
        catch (error) {
            logger.error('Error cleaning up old history:', error);
            return 0;
        }
    }
    /**
     * Search chat history
     */
    async searchHistory(userId, query, limit = 20) {
        try {
            // This would normally perform a full-text search in the database
            logger.info(`Search history for user ${userId}: "${query}"`);
            return []; // Return search results
        }
        catch (error) {
            logger.error('Error searching history:', error);
            return [];
        }
    }
}
//# sourceMappingURL=chatHistoryService.js.map