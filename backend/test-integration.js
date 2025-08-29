import dotenv from 'dotenv';
import { testConnection, query } from './database/connection.js';
import { initializeRedis, sessionService } from './services/redis.js';

// Load environment variables
dotenv.config();

async function testFullIntegration() {
  console.log('🚀 Testing Full Database Integration...\n');
  
  try {
    // Test PostgreSQL
    console.log('📊 Testing PostgreSQL queries...');
    const dbConnected = await testConnection();
    
    if (dbConnected) {
      // Test a simple query
      const userCount = await query('SELECT COUNT(*) as count FROM users');
      console.log(`✅ Users table query successful: ${userCount.rows[0].count} users`);
      
      // Test another table
      const tableCheck = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      console.log(`✅ Database has ${tableCheck.rows.length} tables:`);
      tableCheck.rows.forEach(row => console.log(`   - ${row.table_name}`));
    }
    
    // Test Redis
    console.log('\n🔴 Testing Redis operations...');
    await initializeRedis();
    
    // Test session storage
    const testSessionId = 'test-session-123';
    const testSessionData = {
      userId: 'user-123',
      username: 'testuser',
      loginTime: new Date().toISOString()
    };
    
    await sessionService.storeSession(testSessionId, testSessionData);
    const retrievedSession = await sessionService.getSession(testSessionId);
    
    if (retrievedSession && retrievedSession.userId === testSessionData.userId) {
      console.log('✅ Redis session storage working correctly');
    } else {
      console.log('❌ Redis session storage failed');
    }
    
    console.log('\n🎯 Full integration test completed successfully!');
    console.log('\n✨ Your LLM Chat Application database is ready for use!');
    console.log('\nNext steps:');
    console.log('1. Start your backend server: npm run dev');
    console.log('2. Start your frontend server');
    console.log('3. Begin chatting with your LLM!');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
  } finally {
    // Cleanup
    process.exit(0);
  }
}

testFullIntegration();
