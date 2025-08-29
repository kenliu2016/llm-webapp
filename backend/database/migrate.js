import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import winston from 'winston';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection pool
const pool = new Pool(dbConfig);

// Migration tracking table
const createMigrationsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(255)
    );
  `;
  
  try {
    await pool.query(query);
    logger.info('Migrations table created or already exists');
  } catch (err) {
    logger.error('Failed to create migrations table', { error: err.message });
    throw err;
  }
};

// Calculate file checksum
const calculateChecksum = (content) => {
  return createHash('md5').update(content).digest('hex');
};

// Get applied migrations
const getAppliedMigrations = async () => {
  try {
    const result = await pool.query('SELECT filename, checksum FROM migrations ORDER BY id');
    return result.rows;
  } catch (err) {
    logger.error('Failed to get applied migrations', { error: err.message });
    throw err;
  }
};

// Apply migration
const applyMigration = async (filename, content) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Execute migration
    await client.query(content);
    
    // Record migration
    const checksum = calculateChecksum(content);
    await client.query(
      'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
      [filename, checksum]
    );
    
    await client.query('COMMIT');
    
    logger.info('Migration applied successfully', { filename });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration failed', { filename, error: err.message });
    throw err;
  } finally {
    client.release();
  }
};

// Get migration files
const getMigrationFiles = () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    logger.warn('Migrations directory not found', { path: migrationsDir });
    return [];
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
    
  return files.map(filename => {
    const filepath = path.join(migrationsDir, filename);
    const content = fs.readFileSync(filepath, 'utf8');
    return { filename, content };
  });
};

// Run migrations
const runMigrations = async () => {
  try {
    logger.info('Starting database migrations...');
    
    // Test database connection
    await pool.query('SELECT NOW()');
    logger.info('Database connection successful');
    
    // Create migrations table
    await createMigrationsTable();
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    const appliedFilenames = new Set(appliedMigrations.map(m => m.filename));
    
    // Get migration files
    const migrationFiles = getMigrationFiles();
    
    if (migrationFiles.length === 0) {
      logger.info('No migration files found');
      return;
    }
    
    logger.info('Found migration files', { 
      total: migrationFiles.length,
      applied: appliedMigrations.length 
    });
    
    // Check for checksum mismatches
    for (const migration of appliedMigrations) {
      const file = migrationFiles.find(f => f.filename === migration.filename);
      if (file) {
        const currentChecksum = calculateChecksum(file.content);
        if (currentChecksum !== migration.checksum) {
          logger.warn('Migration checksum mismatch', {
            filename: migration.filename,
            expectedChecksum: migration.checksum,
            currentChecksum
          });
        }
      }
    }
    
    // Apply pending migrations
    let appliedCount = 0;
    for (const migration of migrationFiles) {
      if (!appliedFilenames.has(migration.filename)) {
        logger.info('Applying migration', { filename: migration.filename });
        await applyMigration(migration.filename, migration.content);
        appliedCount++;
      } else {
        logger.debug('Migration already applied', { filename: migration.filename });
      }
    }
    
    if (appliedCount > 0) {
      logger.info('Migrations completed', { 
        appliedCount,
        totalMigrations: migrationFiles.length 
      });
    } else {
      logger.info('No new migrations to apply');
    }
    
  } catch (err) {
    logger.error('Migration process failed', { error: err.message });
    throw err;
  }
};

// Rollback last migration (for development)
const rollbackLastMigration = async () => {
  try {
    const result = await pool.query(
      'SELECT filename FROM migrations ORDER BY id DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }
    
    const filename = result.rows[0].filename;
    
    // Remove from migrations table
    await pool.query('DELETE FROM migrations WHERE filename = $1', [filename]);
    
    logger.warn('Migration rolled back (schema changes not reverted)', { filename });
    logger.warn('Manual schema cleanup may be required');
    
  } catch (err) {
    logger.error('Rollback failed', { error: err.message });
    throw err;
  }
};

// Reset database (for development)
const resetDatabase = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database reset is not allowed in production');
  }
  
  try {
    logger.warn('Resetting database - this will drop all tables!');
    
    // Drop all tables
    const dropTablesQuery = `
      DROP TABLE IF EXISTS migrations CASCADE;
      DROP TABLE IF EXISTS shared_conversations CASCADE;
      DROP TABLE IF EXISTS file_uploads CASCADE;
      DROP TABLE IF EXISTS rate_limits CASCADE;
      DROP TABLE IF EXISTS user_sessions CASCADE;
      DROP TABLE IF EXISTS api_keys CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      
      -- Drop views
      DROP VIEW IF EXISTS conversation_summaries CASCADE;
      DROP VIEW IF EXISTS message_summaries CASCADE;
      DROP VIEW IF EXISTS database_statistics CASCADE;
      DROP VIEW IF EXISTS user_statistics CASCADE;
      
      -- Drop functions
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
      DROP FUNCTION IF EXISTS update_conversation_stats() CASCADE;
      DROP FUNCTION IF EXISTS validate_user_data() CASCADE;
      DROP FUNCTION IF EXISTS validate_conversation_data() CASCADE;
      DROP FUNCTION IF EXISTS validate_message_data() CASCADE;
      DROP FUNCTION IF EXISTS validate_api_key_data() CASCADE;
      DROP FUNCTION IF EXISTS generate_share_token() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_old_rate_limits() CASCADE;
      DROP FUNCTION IF EXISTS update_api_key_usage() CASCADE;
      DROP FUNCTION IF EXISTS search_messages(TEXT, UUID, INTEGER, INTEGER) CASCADE;
      DROP FUNCTION IF EXISTS get_user_activity_summary(UUID) CASCADE;
    `;
    
    await pool.query(dropTablesQuery);
    logger.info('Database reset completed');
    
  } catch (err) {
    logger.error('Database reset failed', { error: err.message });
    throw err;
  }
};

// CLI interface
const main = async () => {
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'up':
      case 'migrate':
        await runMigrations();
        break;
        
      case 'rollback':
        await rollbackLastMigration();
        break;
        
      case 'reset':
        await resetDatabase();
        await runMigrations();
        break;
        
      case 'status':
        const appliedMigrations = await getAppliedMigrations();
        const migrationFiles = getMigrationFiles();
        
        console.log('\nMigration Status:');
        console.log('================');
        console.log(`Total migration files: ${migrationFiles.length}`);
        console.log(`Applied migrations: ${appliedMigrations.length}`);
        console.log(`Pending migrations: ${migrationFiles.length - appliedMigrations.length}`);
        
        if (appliedMigrations.length > 0) {
          console.log('\nApplied migrations:');
          appliedMigrations.forEach(m => {
            console.log(`  ✓ ${m.filename} (${m.applied_at})`);
          });
        }
        
        const appliedFilenames = new Set(appliedMigrations.map(m => m.filename));
        const pendingMigrations = migrationFiles.filter(f => !appliedFilenames.has(f.filename));
        
        if (pendingMigrations.length > 0) {
          console.log('\nPending migrations:');
          pendingMigrations.forEach(m => {
            console.log(`  ○ ${m.filename}`);
          });
        }
        
        break;
        
      default:
        console.log(`
Usage: node migrate.js <command>

Commands:
  up, migrate    Apply pending migrations
  rollback      Remove last migration from tracking (manual cleanup required)
  reset         Drop all tables and re-run migrations (development only)
  status        Show migration status

Examples:
  node migrate.js migrate
  node migrate.js status
  node migrate.js reset
        `);
        process.exit(1);
    }
    
    await pool.end();
    logger.info('Migration script completed');
    
  } catch (err) {
    logger.error('Migration script failed', { error: err.message });
    await pool.end();
    process.exit(1);
  }
};

// Export functions for use in other modules
export {
  runMigrations,
  rollbackLastMigration,
  resetDatabase,
  getAppliedMigrations,
  getMigrationFiles
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
