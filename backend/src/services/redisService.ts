import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

export interface SessionData {
  userId: string;
  email?: string;
  role?: string;
  isGuest?: boolean;
  createdAt: string;
  lastActivity: string;
  [key: string]: any;
}

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis client disconnected');
      this.isConnected = false;
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        logger.info('Redis connection established');
      }
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client.isReady;
  }

  /**
   * Set session data
   */
  async setSession(sessionId: string, data: SessionData, expirationSeconds: number = 3600): Promise<void> {
    try {
      const key = `session:${sessionId}`;
      const serializedData = JSON.stringify(data);
      
      await this.client.setEx(key, expirationSeconds, serializedData);
      logger.debug(`Session stored: ${sessionId}`);
    } catch (error) {
      logger.error('Error storing session:', error);
      throw error;
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const key = `session:${sessionId}`;
      const data = await this.client.get(key);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data) as SessionData;
    } catch (error) {
      logger.error('Error retrieving session:', error);
      return null;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const key = `session:${sessionId}`;
      const result = await this.client.del(key);
      
      logger.debug(`Session deleted: ${sessionId}`);
      return result === 1;
    } catch (error) {
      logger.error('Error deleting session:', error);
      return false;
    }
  }

  /**
   * Extend session expiration
   */
  async extendSession(sessionId: string, expirationSeconds: number = 3600): Promise<boolean> {
    try {
      const key = `session:${sessionId}`;
      const result = await this.client.expire(key, expirationSeconds);
      
      if (result) {
        logger.debug(`Session extended: ${sessionId}`);
      }
      
      return result;
    } catch (error) {
      logger.error('Error extending session:', error);
      return false;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<string[]> {
    try {
      const pattern = `session:*`;
      const keys = await this.client.keys(pattern);
      const userSessions: string[] = [];

      for (const key of keys) {
        const sessionData = await this.client.get(key);
        if (sessionData) {
          const data = JSON.parse(sessionData) as SessionData;
          if (data.userId === userId) {
            userSessions.push(key.replace('session:', ''));
          }
        }
      }

      return userSessions;
    } catch (error) {
      logger.error('Error retrieving user sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const pattern = `session:*`;
      const keys = await this.client.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -1) { // No expiration set
          await this.client.expire(key, 3600); // Set default 1 hour expiration
        } else if (ttl === -2) { // Key doesn't exist or expired
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired sessions`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  /**
   * Store rate limiting data
   */
  async setRateLimit(key: string, value: number, windowSeconds: number): Promise<void> {
    try {
      const rateLimitKey = `rate_limit:${key}`;
      await this.client.setEx(rateLimitKey, windowSeconds, value.toString());
    } catch (error) {
      logger.error('Error storing rate limit data:', error);
      throw error;
    }
  }

  /**
   * Get rate limiting data
   */
  async getRateLimit(key: string): Promise<number | null> {
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const value = await this.client.get(rateLimitKey);
      return value ? parseInt(value, 10) : null;
    } catch (error) {
      logger.error('Error retrieving rate limit data:', error);
      return null;
    }
  }

  /**
   * Increment rate limiting counter
   */
  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const current = await this.client.incr(rateLimitKey);
      
      if (current === 1) {
        // First request in the window, set expiration
        await this.client.expire(rateLimitKey, windowSeconds);
      }
      
      return current;
    } catch (error) {
      logger.error('Error incrementing rate limit:', error);
      return 0;
    }
  }

  /**
   * Cache chat history
   */
  async setChatHistory(userId: string, sessionId: string, messages: any[], expirationSeconds: number = 86400): Promise<void> {
    try {
      const key = `chat_history:${userId}:${sessionId}`;
      const serializedMessages = JSON.stringify(messages);
      
      await this.client.setEx(key, expirationSeconds, serializedMessages);
      logger.debug(`Chat history cached: ${userId}:${sessionId}`);
    } catch (error) {
      logger.error('Error caching chat history:', error);
      throw error;
    }
  }

  /**
   * Get cached chat history
   */
  async getChatHistory(userId: string, sessionId: string): Promise<any[] | null> {
    try {
      const key = `chat_history:${userId}:${sessionId}`;
      const data = await this.client.get(key);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error retrieving cached chat history:', error);
      return null;
    }
  }

  /**
   * Store temporary data
   */
  async setTempData(key: string, data: any, expirationSeconds: number = 300): Promise<void> {
    try {
      const tempKey = `temp:${key}`;
      const serializedData = JSON.stringify(data);
      
      await this.client.setEx(tempKey, expirationSeconds, serializedData);
    } catch (error) {
      logger.error('Error storing temporary data:', error);
      throw error;
    }
  }

  /**
   * Get temporary data
   */
  async getTempData(key: string): Promise<any | null> {
    try {
      const tempKey = `temp:${key}`;
      const data = await this.client.get(tempKey);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error retrieving temporary data:', error);
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }
}
