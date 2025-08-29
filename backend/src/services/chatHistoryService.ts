import { RedisService } from './redisService.js';
import { DatabaseService } from './databaseService.js';
import { logger } from '../utils/logger.js';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokensUsed?: number;
  timestamp: Date;
  metadata?: any;
}

export interface ChatSession {
  id: string;
  userId: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  lastMessage?: string;
}

export interface ChatHistoryResult {
  messages: ChatMessage[];
  total: number;
}

export interface SessionsResult {
  sessions: ChatSession[];
  total: number;
}

export class ChatHistoryService {
  private redis: RedisService;
  private db: DatabaseService;

  constructor() {
    this.redis = new RedisService();
    this.db = new DatabaseService();
  }

  /**
   * Save a message to chat history
   */
  async saveMessage(userId: string, sessionId: string, message: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    try {
      // Generate message ID
      const messageId = this.generateMessageId();
      const messageWithId: ChatMessage = {
        id: messageId,
        ...message
      };

      // Save to database for persistence
      await this.saveMessageToDatabase(userId, sessionId, messageWithId);

      // Cache recent messages in Redis for quick access
      await this.cacheRecentMessages(userId, sessionId);

      logger.debug(`Message saved: ${messageId} in session ${sessionId}`);
      return messageWithId;
    } catch (error) {
      logger.error('Error saving message:', error);
      throw error;
    }
  }

  /**
   * Get chat history for a user/session
   */
  async getChatHistory(userId: string, sessionId?: string, limit: number = 50, offset: number = 0): Promise<ChatHistoryResult> {
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
    } catch (error) {
      logger.error('Error retrieving chat history:', error);
      throw error;
    }
  }

  /**
   * Get context messages for LLM (last N messages)
   */
  async getContextMessages(userId: string, sessionId?: string, limit: number = 10): Promise<ChatMessage[]> {
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
    } catch (error) {
      logger.error('Error retrieving context messages:', error);
      return [];
    }
  }

  /**
   * Clear a chat session
   */
  async clearSession(userId: string, sessionId: string): Promise<boolean> {
    try {
      // Clear from database
      await this.clearSessionFromDatabase(userId, sessionId);

      // Clear from cache
      const cacheKey = `chat_history:${userId}:${sessionId}`;
      await this.redis.getTempData(cacheKey); // This will effectively delete it

      logger.info(`Session cleared: ${sessionId} for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error clearing session:', error);
      return false;
    }
  }

  /**
   * Get user's chat sessions
   */
  async getUserSessions(userId: string, limit: number = 20, offset: number = 0): Promise<SessionsResult> {
    try {
      return await this.getUserSessionsFromDatabase(userId, limit, offset);
    } catch (error) {
      logger.error('Error retrieving user sessions:', error);
      throw error;
    }
  }

  /**
   * Create a new chat session
   */
  async createSession(userId: string, title?: string): Promise<ChatSession> {
    try {
      const sessionId = this.generateSessionId(userId);
      const session: ChatSession = {
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
    } catch (error) {
      logger.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Update session title
   */
  async updateSessionTitle(userId: string, sessionId: string, title: string): Promise<boolean> {
    try {
      const updated = await this.updateSessionInDatabase(userId, sessionId, { title });
      
      if (updated) {
        logger.info(`Session title updated: ${sessionId}`);
      }
      
      return updated;
    } catch (error) {
      logger.error('Error updating session title:', error);
      return false;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId: string, sessionId: string): Promise<{
    messageCount: number;
    tokensUsed: number;
    duration: number;
  }> {
    try {
      return await this.getSessionStatsFromDatabase(userId, sessionId);
    } catch (error) {
      logger.error('Error retrieving session stats:', error);
      return { messageCount: 0, tokensUsed: 0, duration: 0 };
    }
  }

  // Private helper methods

  private async saveMessageToDatabase(userId: string, sessionId: string, message: ChatMessage): Promise<void> {
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
    } catch (error) {
      logger.error('Error saving message to database:', error);
      throw error;
    }
  }

  private async getChatHistoryFromDatabase(userId: string, sessionId?: string, limit: number = 50, offset: number = 0): Promise<ChatHistoryResult> {
    // This would normally query the database
    // For now, return empty results
    return {
      messages: [],
      total: 0
    };
  }

  private async clearSessionFromDatabase(userId: string, sessionId: string): Promise<void> {
    // This would normally delete from database
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private async getUserSessionsFromDatabase(userId: string, limit: number, offset: number): Promise<SessionsResult> {
    // This would normally query the database
    return {
      sessions: [],
      total: 0
    };
  }

  private async saveSessionToDatabase(session: ChatSession): Promise<void> {
    // This would normally save to database
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private async updateSessionInDatabase(userId: string, sessionId: string, updates: Partial<ChatSession>): Promise<boolean> {
    // This would normally update the database
    await new Promise(resolve => setTimeout(resolve, 10));
    return true;
  }

  private async getSessionStatsFromDatabase(userId: string, sessionId: string): Promise<{
    messageCount: number;
    tokensUsed: number;
    duration: number;
  }> {
    // This would normally query the database for stats
    return {
      messageCount: 0,
      tokensUsed: 0,
      duration: 0
    };
  }

  private async cacheRecentMessages(userId: string, sessionId: string): Promise<void> {
    try {
      // Get recent messages from database and cache them
      const recent = await this.getChatHistoryFromDatabase(userId, sessionId, 20, 0);
      await this.redis.setChatHistory(userId, sessionId, recent.messages, 3600); // Cache for 1 hour
    } catch (error) {
      logger.error('Error caching recent messages:', error);
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateSessionId(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${userId}_${timestamp}_${random}`;
  }

  /**
   * Clean up old chat history
   */
  async cleanupOldHistory(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // This would normally delete old records from database
      logger.info(`Chat history cleanup would remove messages older than ${cutoffDate.toISOString()}`);
      
      return 0; // Return number of deleted records
    } catch (error) {
      logger.error('Error cleaning up old history:', error);
      return 0;
    }
  }

  /**
   * Search chat history
   */
  async searchHistory(userId: string, query: string, limit: number = 20): Promise<ChatMessage[]> {
    try {
      // This would normally perform a full-text search in the database
      logger.info(`Search history for user ${userId}: "${query}"`);
      
      return []; // Return search results
    } catch (error) {
      logger.error('Error searching history:', error);
      return [];
    }
  }
}
