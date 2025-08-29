import { Pool } from 'pg';
import winston from 'winston';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'llm_chat_app',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum number of connections
  min: parseInt(process.env.DB_POOL_MIN || '5'),  // Minimum number of connections
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'), // 30 seconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'), // 5 seconds
  
  // SSL configuration for production
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  
  // Additional settings
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '60000'), // 60 seconds
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'), // 30 seconds
  application_name: 'llm-chat-app'
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool events
pool.on('connect', (client) => {
  logger.info('New database client connected', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('acquire', (client) => {
  logger.debug('Client acquired from pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('remove', (client) => {
  logger.info('Client removed from pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('error', (err, client) => {
  logger.error('Database pool error', {
    error: err.message,
    stack: err.stack,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    client.release();
    
    logger.info('Database connection successful', {
      currentTime: result.rows[0].current_time,
      version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database
    });
    
    return true;
  } catch (err) {
    logger.error('Database connection failed', {
      error: err.message,
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database
    });
    return false;
  }
};

// Query helper function with error handling and logging
const query = async (text, params = []) => {
  const start = Date.now();
  const client = await pool.connect();
  
  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Database query executed', {
      query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    
    logger.error('Database query failed', {
      query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      error: err.message,
      duration: `${duration}ms`,
      params: params.length > 0 ? 'present' : 'none'
    });
    
    throw err;
  } finally {
    client.release();
  }
};

// Transaction helper function
const transaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    
    logger.debug('Database transaction completed successfully');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    
    logger.error('Database transaction failed and rolled back', {
      error: err.message
    });
    
    throw err;
  } finally {
    client.release();
  }
};

// Batch insert helper function
const batchInsert = async (tableName, columns, values, chunkSize = 1000) => {
  if (!values || values.length === 0) {
    return { rowCount: 0 };
  }
  
  const columnList = columns.join(', ');
  let totalRowCount = 0;
  
  // Process in chunks to avoid parameter limits
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, rowIndex) => {
      const rowPlaceholders = columns.map((_, colIndex) => {
        return `$${rowIndex * columns.length + colIndex + 1}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    }).join(', ');
    
    const queryText = `INSERT INTO ${tableName} (${columnList}) VALUES ${placeholders}`;
    const flatValues = chunk.flat();
    
    const result = await query(queryText, flatValues);
    totalRowCount += result.rowCount;
  }
  
  logger.info('Batch insert completed', {
    table: tableName,
    totalRows: totalRowCount,
    chunks: Math.ceil(values.length / chunkSize)
  });
  
  return { rowCount: totalRowCount };
};

// Health check function
const healthCheck = async () => {
  try {
    const result = await query('SELECT 1 as healthy');
    return {
      status: 'healthy',
      database: 'connected',
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      },
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Graceful shutdown function
const gracefulShutdown = async () => {
  logger.info('Closing database connection pool...');
  
  try {
    await pool.end();
    logger.info('Database connection pool closed successfully');
  } catch (err) {
    logger.error('Error closing database connection pool', {
      error: err.message
    });
  }
};

// Handle process termination
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('exit', gracefulShutdown);

// Database utility functions
const dbUtils = {
  // Pagination helper
  paginate: (page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    return {
      limit: Math.min(limit, 100), // Max 100 items per page
      offset: Math.max(offset, 0)
    };
  },
  
  // Search helper for full-text search
  searchQuery: (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return { where: '1=1', params: [] };
    }
    
    const cleanTerm = searchTerm.trim().replace(/[^\w\s]/g, '');
    return {
      where: 'similarity(content, $1) > 0.1',
      params: [cleanTerm],
      orderBy: 'similarity(content, $1) DESC'
    };
  },
  
  // Date range helper
  dateRange: (startDate, endDate) => {
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    
    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }
    
    return {
      where: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
      params
    };
  }
};

export {
  pool,
  query,
  transaction,
  batchInsert,
  testConnection,
  healthCheck,
  gracefulShutdown,
  dbUtils,
  logger
};
