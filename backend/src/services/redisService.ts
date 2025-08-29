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
  private maxRetries = 3;
  private retryDelay = 2000; // 2 seconds
  private connectionOptions: any;

  constructor() {
    // Configure connection options with better defaults
    this.connectionOptions = {
      socket: {
        connectTimeout: 10000, // 10 seconds timeout
        keepAlive: 60,
      },
      password: process.env.REDIS_PASSWORD || undefined,
    };

    // Use REDIS_URL if available, otherwise use individual configs
    if (process.env.REDIS_URL) {
      this.connectionOptions.url = process.env.REDIS_URL;
    } else {
      this.connectionOptions.socket.host = process.env.REDIS_HOST || 'localhost';
      this.connectionOptions.socket.port = parseInt(process.env.REDIS_PORT || '6379');
    }

    this.client = createClient(this.connectionOptions);

    // Enhanced event listeners
    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      if (this.isConnected) {
        this.isConnected = false;
      }
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', (info) => {
      logger.info(`Redis reconnecting: attempt ${info.attempt} after ${info.delay}ms`);
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready for commands');
    });
  }

  /**
   * Connect to Redis with retry mechanism
   */
  async connect(): Promise<void> {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        if (this.isConnected) {
          logger.debug('Redis already connected');
          return;
        }

        // Log connection attempt details
        const host = process.env.REDIS_HOST || 'localhost';
        const port = process.env.REDIS_PORT || '6379';
        logger.info(`Attempting to connect to Redis at ${host}:${port}`);
        
        await this.client.connect();
        logger.info('Redis connection established successfully');
        this.isConnected = true;
        
        // Log Redis info after successful connection
        await this.logRedisInfo();
        
        return;
      } catch (error) {
        retries++;
        logger.error(`Redis connection attempt ${retries} failed:`, error);
        
        if (retries >= this.maxRetries) {
          logger.error('All Redis connection attempts failed');
          this.isConnected = false;
          throw error;
        }
        
        logger.info(`Retrying Redis connection in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  /**
   * Log Redis server information
   */
  private async logRedisInfo(): Promise<void> {
    try {
      if (this.isConnected) {
        const info = await this.client.info();
        // Extract and log version info
        const versionMatch = info.match(/redis_version:(\d+\.\d+\.\d+)/);
        if (versionMatch && versionMatch[1]) {
          logger.info(`Connected to Redis server version: ${versionMatch[1]}`);
        }
      }
    } catch (error) {
      logger.warn('Failed to get Redis info:', error);
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
