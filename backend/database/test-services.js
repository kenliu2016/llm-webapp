import dotenv from 'dotenv';
import { testConnection } from './connection.js';
import { initializeRedis, healthCheck as redisHealthCheck } from '../services/redis.js';

// Load environment variables
dotenv.config();

async function testDatabaseServices() {
  console.log('🔧 Testing Database and Redis Services...\n');
  
  // Test PostgreSQL connection
  console.log('📊 Testing PostgreSQL connection...');
  const dbConnected = await testConnection();
  
  if (dbConnected) {
    console.log('✅ PostgreSQL connection successful');
  } else {
    console.log('❌ PostgreSQL connection failed');
  }
  
  // Test Redis connection
  console.log('\n🔴 Testing Redis connection...');
  try {
    const redisConnected = await initializeRedis();
    
    if (redisConnected) {
      console.log('✅ Redis connection successful');
      
      // Test Redis health check
      const redisHealth = await redisHealthCheck();
      console.log('🏥 Redis health check:', redisHealth);
    } else {
      console.log('❌ Redis connection failed');
    }
  } catch (err) {
    console.log('❌ Redis connection error:', err.message);
  }
  
  console.log('\n🎯 Service test completed!');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testDatabaseServices().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

export { testDatabaseServices };
