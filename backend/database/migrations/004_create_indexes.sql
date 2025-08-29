-- Migration 004: Create Additional Tables and Indexes
-- Creates remaining tables and optimizes indexes for performance

-- Create API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    permissions JSONB DEFAULT '["chat"]',
    usage_count INTEGER DEFAULT 0,
    usage_limit INTEGER,
    last_used TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create User Sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    refresh_token VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Rate Limits table
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(identifier, endpoint, window_start)
);

-- Create File Uploads table
CREATE TABLE IF NOT EXISTS file_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_hash VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_processed BOOLEAN DEFAULT false,
    processing_status VARCHAR(50) DEFAULT 'pending',
    processing_result JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Shared Conversations table
CREATE TABLE IF NOT EXISTS shared_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    share_token VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255),
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    view_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for API Keys table
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used ON api_keys(last_used);

-- Create indexes for User Sessions table
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_ip_address ON user_sessions(ip_address);

-- Create indexes for Rate Limits table
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_endpoint ON rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_endpoint ON rate_limits(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at ON rate_limits(created_at);

-- Create indexes for File Uploads table
CREATE INDEX IF NOT EXISTS idx_file_uploads_user_id ON file_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_conversation_id ON file_uploads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_file_hash ON file_uploads(file_hash);
CREATE INDEX IF NOT EXISTS idx_file_uploads_created_at ON file_uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_file_uploads_mime_type ON file_uploads(mime_type);
CREATE INDEX IF NOT EXISTS idx_file_uploads_processing_status ON file_uploads(processing_status);
CREATE INDEX IF NOT EXISTS idx_file_uploads_is_processed ON file_uploads(is_processed);

-- Create indexes for Shared Conversations table
CREATE INDEX IF NOT EXISTS idx_shared_conversations_share_token ON shared_conversations(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_conversations_conversation_id ON shared_conversations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_shared_conversations_public ON shared_conversations(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_shared_conversations_created_at ON shared_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_conversations_view_count ON shared_conversations(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_shared_conversations_expires_at ON shared_conversations(expires_at);

-- Create additional performance indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_model ON conversations(user_id, model);
CREATE INDEX IF NOT EXISTS idx_conversations_user_archived ON conversations(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_role ON messages(conversation_id, role);
CREATE INDEX IF NOT EXISTS idx_messages_tokens_desc ON messages(tokens DESC);
CREATE INDEX IF NOT EXISTS idx_users_active_verified ON users(is_active, is_verified);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated_archived ON conversations(user_id, updated_at DESC, is_archived);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_role ON messages(conversation_id, created_at DESC, role);

-- Create partial indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_shared_active ON conversations(share_token, is_shared) WHERE is_shared = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_active_user ON api_keys(user_id, key_prefix) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user ON user_sessions(user_id, expires_at) WHERE is_active = true;

-- Create triggers for timestamp updates
CREATE TRIGGER update_api_keys_updated_at 
BEFORE UPDATE ON api_keys 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at 
BEFORE UPDATE ON user_sessions 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limits_updated_at 
BEFORE UPDATE ON rate_limits 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_file_uploads_updated_at 
BEFORE UPDATE ON file_uploads 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_conversations_updated_at 
BEFORE UPDATE ON shared_conversations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Create function to clean up old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rate_limits 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Create function to update API key usage
CREATE OR REPLACE FUNCTION update_api_key_usage()
RETURNS TRIGGER AS $$
BEGIN
    NEW.usage_count = COALESCE(NEW.usage_count, 0) + 1;
    NEW.last_used = CURRENT_TIMESTAMP;
    
    -- Check usage limit
    IF NEW.usage_limit IS NOT NULL AND NEW.usage_count > NEW.usage_limit THEN
        NEW.is_active = false;
    END IF;
    
    -- Check expiration
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at < CURRENT_TIMESTAMP THEN
        NEW.is_active = false;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to validate API key data
CREATE OR REPLACE FUNCTION validate_api_key_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure name is not empty
    IF length(trim(NEW.name)) = 0 THEN
        RAISE EXCEPTION 'API key name cannot be empty';
    END IF;
    
    -- Ensure key_hash is not empty
    IF length(NEW.key_hash) = 0 THEN
        RAISE EXCEPTION 'API key hash cannot be empty';
    END IF;
    
    -- Ensure key_prefix is valid
    IF length(NEW.key_prefix) < 4 OR length(NEW.key_prefix) > 20 THEN
        RAISE EXCEPTION 'API key prefix must be between 4 and 20 characters';
    END IF;
    
    -- Ensure usage_count is not negative
    IF NEW.usage_count < 0 THEN
        NEW.usage_count = 0;
    END IF;
    
    -- Trim name
    NEW.name = trim(NEW.name);
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER validate_api_key_data_trigger 
BEFORE INSERT OR UPDATE ON api_keys 
FOR EACH ROW EXECUTE FUNCTION validate_api_key_data();

-- Create comprehensive statistics view
CREATE VIEW database_statistics AS
SELECT 
    'users' as table_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_active = true) as active_count,
    COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '30 days') as recent_count
FROM users
UNION ALL
SELECT 
    'conversations' as table_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_archived = false) as active_count,
    COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '30 days') as recent_count
FROM conversations
UNION ALL
SELECT 
    'messages' as table_name,
    COUNT(*) as total_count,
    COUNT(*) as active_count,
    COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '30 days') as recent_count
FROM messages
UNION ALL
SELECT 
    'api_keys' as table_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_active = true) as active_count,
    COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '30 days') as recent_count
FROM api_keys
UNION ALL
SELECT 
    'user_sessions' as table_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP) as active_count,
    COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '30 days') as recent_count
FROM user_sessions;

-- Create function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(user_id_param UUID)
RETURNS TABLE (
    total_conversations INTEGER,
    total_messages INTEGER,
    total_tokens INTEGER,
    active_sessions INTEGER,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT c.id)::INTEGER as total_conversations,
        COUNT(DISTINCT m.id)::INTEGER as total_messages,
        COALESCE(SUM(m.tokens), 0)::INTEGER as total_tokens,
        COUNT(DISTINCT s.id)::INTEGER as active_sessions,
        MAX(GREATEST(c.updated_at, m.created_at, s.updated_at)) as last_activity
    FROM users u
    LEFT JOIN conversations c ON u.id = c.user_id
    LEFT JOIN messages m ON c.id = m.conversation_id
    LEFT JOIN user_sessions s ON u.id = s.user_id AND s.is_active = true AND s.expires_at > CURRENT_TIMESTAMP
    WHERE u.id = user_id_param
    GROUP BY u.id;
END;
$$ language 'plpgsql';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 004 completed: Additional tables and indexes created successfully';
    RAISE NOTICE 'Database schema setup complete!';
    RAISE NOTICE 'Tables created: users, conversations, messages, api_keys, user_sessions, rate_limits, file_uploads, shared_conversations';
    RAISE NOTICE 'Views created: conversation_summaries, message_summaries, database_statistics';
    RAISE NOTICE 'Functions created: cleanup utilities, validation functions, search functions, statistics functions';
END $$;
