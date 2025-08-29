import redis from 'redis';
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Connection settings
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000'),
  lazyConnect: true,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  
  // Retry strategy
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  }
};

// Create Redis client
const redisClient = redis.createClient(redisConfig);

// Redis event handlers
redisClient.on('connect', () => {
  logger.info('Redis client connected', {
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db
  });
});

redisClient.on('ready', () => {
  logger.info('Redis client ready for commands');
});

redisClient.on('error', (err) => {
  logger.error('Redis client error', {
    error: err.message,
    host: redisConfig.host,
    port: redisConfig.port
  });
});

redisClient.on('end', () => {
  logger.info('Redis client connection ended');
});

redisClient.on('reconnecting', (attempt) => {
  logger.warn('Redis client reconnecting', { attempt });
});

// Initialize Redis connection
const initializeRedis = async () => {
  try {
    await redisClient.connect();
    logger.info('Redis connection established successfully');
    return true;
  } catch (err) {
    logger.error('Failed to connect to Redis', {
      error: err.message,
      host: redisConfig.host,
      port: redisConfig.port
    });
    return false;
  }
};

// Session Management Functions
const sessionService = {
  // Store user session
  async storeSession(sessionToken, sessionData, expirationTime = 3600) {
    try {
      const key = `session:${sessionToken}`;
      await redisClient.setEx(key, expirationTime, JSON.stringify(sessionData));
      
      logger.debug('Session stored', {
        sessionToken: sessionToken.substring(0, 10) + '...',
        expirationTime
      });
      
      return true;
    } catch (err) {
      logger.error('Failed to store session', {
        error: err.message,
        sessionToken: sessionToken.substring(0, 10) + '...'
      });
      throw err;
    }
  },

  // Retrieve user session
  async getSession(sessionToken) {
    try {
      const key = `session:${sessionToken}`;
      const sessionData = await redisClient.get(key);
      
      if (sessionData) {
        logger.debug('Session retrieved', {
          sessionToken: sessionToken.substring(0, 10) + '...'
        });
        return JSON.parse(sessionData);
      }
      
      return null;
    } catch (err) {
      logger.error('Failed to retrieve session', {
        error: err.message,
        sessionToken: sessionToken.substring(0, 10) + '...'
      });
      throw err;
    }
  },

  // Delete user session
  async deleteSession(sessionToken) {
    try {
      const key = `session:${sessionToken}`;
      const result = await redisClient.del(key);
      
      logger.debug('Session deleted', {
        sessionToken: sessionToken.substring(0, 10) + '...',
        deleted: result > 0
      });
      
      return result > 0;
    } catch (err) {
      logger.error('Failed to delete session', {
        error: err.message,
        sessionToken: sessionToken.substring(0, 10) + '...'
      });
      throw err;
    }
  },

  // Extend session expiration
  async extendSession(sessionToken, expirationTime = 3600) {
    try {
      const key = `session:${sessionToken}`;
      const result = await redisClient.expire(key, expirationTime);
      
      logger.debug('Session extended', {
        sessionToken: sessionToken.substring(0, 10) + '...',
        expirationTime,
        success: result
      });
      
      return result;
    } catch (err) {
      logger.error('Failed to extend session', {
        error: err.message,
        sessionToken: sessionToken.substring(0, 10) + '...'
      });
      throw err;
    }
  },

  // Get all user sessions
  async getUserSessions(userId) {
    try {
      const pattern = `session:*`;
      const keys = await redisClient.keys(pattern);
      const userSessions = [];
      
      for (const key of keys) {
        const sessionData = await redisClient.get(key);
        if (sessionData) {
          const parsed = JSON.parse(sessionData);
          if (parsed.userId === userId) {
            userSessions.push({
              sessionToken: key.replace('session:', ''),
              ...parsed
            });
          }
        }
      }
      
      return userSessions;
    } catch (err) {
      logger.error('Failed to get user sessions', {
        error: err.message,
        userId
      });
      throw err;
    }
  }
};

// Rate Limiting Functions
const rateLimitService = {
  // Check and update rate limit
  async checkRateLimit(identifier, limit = 100, windowSize = 3600) {
    try {
      const key = `ratelimit:${identifier}`;
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - (now % windowSize);
      
      // Use Redis transaction for atomic operations
      const multi = redisClient.multi();
      multi.zRemRangeByScore(key, 0, windowStart - windowSize);
      multi.zCard(key);
      multi.zAdd(key, now, `${now}-${Math.random()}`);
      multi.expire(key, windowSize * 2);
      
      const results = await multi.exec();
      const currentCount = results[1];
      
      const isAllowed = currentCount < limit;
      const remaining = Math.max(0, limit - currentCount - 1);
      const resetTime = windowStart + windowSize;
      
      logger.debug('Rate limit check', {
        identifier: identifier.substring(0, 20) + '...',
        currentCount,
        limit,
        isAllowed,
        remaining,
        resetTime
      });
      
      return {
        allowed: isAllowed,
        limit,
        remaining,
        resetTime,
        retryAfter: isAllowed ? null : resetTime - now
      };
    } catch (err) {
      logger.error('Rate limit check failed', {
        error: err.message,
        identifier: identifier.substring(0, 20) + '...'
      });
      // Allow request on Redis failure
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTime: Math.floor(Date.now() / 1000) + windowSize
      };
    }
  },

  // Reset rate limit for identifier
  async resetRateLimit(identifier) {
    try {
      const key = `ratelimit:${identifier}`;
      const result = await redisClient.del(key);
      
      logger.info('Rate limit reset', {
        identifier: identifier.substring(0, 20) + '...',
        deleted: result > 0
      });
      
      return result > 0;
    } catch (err) {
      logger.error('Failed to reset rate limit', {
        error: err.message,
        identifier: identifier.substring(0, 20) + '...'
      });
      throw err;
    }
  }
};

// Cache Management Functions
const cacheService = {
  // Set cache with optional TTL
  async set(key, value, ttl = 3600) {
    try {
      const serializedValue = JSON.stringify(value);
      
      if (ttl > 0) {
        await redisClient.setEx(key, ttl, serializedValue);
      } else {
        await redisClient.set(key, serializedValue);
      }
      
      logger.debug('Cache set', { key, ttl });
      return true;
    } catch (err) {
      logger.error('Cache set failed', {
        error: err.message,
        key
      });
      throw err;
    }
  },

  // Get cache value
  async get(key) {
    try {
      const value = await redisClient.get(key);
      
      if (value) {
        logger.debug('Cache hit', { key });
        return JSON.parse(value);
      }
      
      logger.debug('Cache miss', { key });
      return null;
    } catch (err) {
      logger.error('Cache get failed', {
        error: err.message,
        key
      });
      return null; // Return null on cache failure
    }
  },

  // Delete cache
  async del(key) {
    try {
      const result = await redisClient.del(key);
      logger.debug('Cache deleted', { key, deleted: result > 0 });
      return result > 0;
    } catch (err) {
      logger.error('Cache delete failed', {
        error: err.message,
        key
      });
      throw err;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      const result = await redisClient.exists(key);
      return result > 0;
    } catch (err) {
      logger.error('Cache exists check failed', {
        error: err.message,
        key
      });
      return false;
    }
  },

  // Set multiple keys
  async mset(keyValuePairs, ttl = 3600) {
    try {
      const multi = redisClient.multi();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serializedValue = JSON.stringify(value);
        if (ttl > 0) {
          multi.setEx(key, ttl, serializedValue);
        } else {
          multi.set(key, serializedValue);
        }
      }
      
      await multi.exec();
      logger.debug('Multiple cache set', { 
        keys: Object.keys(keyValuePairs),
        ttl 
      });
      
      return true;
    } catch (err) {
      logger.error('Multiple cache set failed', {
        error: err.message,
        keys: Object.keys(keyValuePairs)
      });
      throw err;
    }
  },

  // Get multiple keys
  async mget(keys) {
    try {
      const values = await redisClient.mGet(keys);
      const result = {};
      
      keys.forEach((key, index) => {
        if (values[index]) {
          try {
            result[key] = JSON.parse(values[index]);
          } catch (parseErr) {
            logger.warn('Failed to parse cached value', {
              key,
              error: parseErr.message
            });
            result[key] = null;
          }
        } else {
          result[key] = null;
        }
      });
      
      logger.debug('Multiple cache get', { 
        keys,
        hits: Object.values(result).filter(v => v !== null).length
      });
      
      return result;
    } catch (err) {
      logger.error('Multiple cache get failed', {
        error: err.message,
        keys
      });
      return keys.reduce((acc, key) => ({ ...acc, [key]: null }), {});
    }
  },

  // Clear all cache with pattern
  async clearPattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        const result = await redisClient.del(keys);
        logger.info('Cache pattern cleared', {
          pattern,
          keysDeleted: result
        });
        return result;
      }
      return 0;
    } catch (err) {
      logger.error('Cache pattern clear failed', {
        error: err.message,
        pattern
      });
      throw err;
    }
  }
};

// Health check function
const healthCheck = async () => {
  try {
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;
    
    return {
      status: 'healthy',
      redis: 'connected',
      latency: `${latency}ms`,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      redis: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Closing Redis connection...');
  
  try {
    await redisClient.quit();
    logger.info('Redis connection closed successfully');
  } catch (err) {
    logger.error('Error closing Redis connection', {
      error: err.message
    });
  }
};

// Handle process termination
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('exit', gracefulShutdown);

export {
  redisClient,
  initializeRedis,
  sessionService,
  rateLimitService,
  cacheService,
  healthCheck,
  gracefulShutdown,
  logger
};
