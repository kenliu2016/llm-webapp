-- Migration 002: Create Conversations Table
-- Creates the conversations table for chat sessions

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    description TEXT,
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-3.5-turbo',
    system_prompt TEXT,
    settings JSONB DEFAULT '{}',
    is_archived BOOLEAN DEFAULT false,
    is_shared BOOLEAN DEFAULT false,
    share_token VARCHAR(255) UNIQUE,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for conversations table
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_share_token ON conversations(share_token);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_model ON conversations(model);
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(is_archived);
CREATE INDEX IF NOT EXISTS idx_conversations_shared ON conversations(is_shared);

-- Enable full-text search on title
CREATE INDEX IF NOT EXISTS idx_conversations_title_search ON conversations USING gin(title gin_trgm_ops);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_conversations_updated_at 
BEFORE UPDATE ON conversations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add constraints
ALTER TABLE conversations ADD CONSTRAINT conversations_title_not_empty CHECK (length(title) > 0);
ALTER TABLE conversations ADD CONSTRAINT conversations_model_not_empty CHECK (length(model) > 0);
ALTER TABLE conversations ADD CONSTRAINT conversations_message_count_positive CHECK (message_count >= 0);
ALTER TABLE conversations ADD CONSTRAINT conversations_total_tokens_positive CHECK (total_tokens >= 0);

-- Create function to generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
BEGIN
    RETURN 'share_' || encode(gen_random_bytes(16), 'hex');
END;
$$ language 'plpgsql';

-- Create function to validate conversation data
CREATE OR REPLACE FUNCTION validate_conversation_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure title is not empty
    IF length(trim(NEW.title)) = 0 THEN
        RAISE EXCEPTION 'Conversation title cannot be empty';
    END IF;
    
    -- Ensure model is valid
    IF NEW.model NOT IN ('gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-opus', 'gemini-pro') THEN
        RAISE EXCEPTION 'Invalid model: %. Supported models: gpt-4, gpt-4-turbo, gpt-3.5-turbo, claude-3-sonnet, claude-3-haiku, claude-3-opus, gemini-pro', NEW.model;
    END IF;
    
    -- Generate share token if sharing is enabled but token doesn't exist
    IF NEW.is_shared = true AND NEW.share_token IS NULL THEN
        NEW.share_token = generate_share_token();
    END IF;
    
    -- Clear share token if sharing is disabled
    IF NEW.is_shared = false THEN
        NEW.share_token = NULL;
    END IF;
    
    -- Trim and validate title
    NEW.title = trim(NEW.title);
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER validate_conversation_data_trigger 
BEFORE INSERT OR UPDATE ON conversations 
FOR EACH ROW EXECUTE FUNCTION validate_conversation_data();

-- Insert sample conversations for the admin user
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Get admin user ID
    SELECT id INTO admin_user_id FROM users WHERE username = 'admin' LIMIT 1;
    
    IF admin_user_id IS NOT NULL THEN
        -- Insert sample conversations
        INSERT INTO conversations (
            user_id,
            title,
            description,
            model,
            system_prompt,
            settings
        ) VALUES 
        (
            admin_user_id,
            'Welcome to LLM Chat',
            'Getting started with the LLM chat application',
            'gpt-3.5-turbo',
            'You are a helpful assistant for the LLM Chat application. Help users understand how to use the features effectively.',
            '{"temperature": 0.7, "max_tokens": 2048}'
        ),
        (
            admin_user_id,
            'Code Assistant',
            'Programming and development help',
            'gpt-4',
            'You are an expert software developer. Help with coding questions, debugging, and best practices.',
            '{"temperature": 0.3, "max_tokens": 4096}'
        ),
        (
            admin_user_id,
            'Creative Writing',
            'Story writing and creative content',
            'claude-3-sonnet',
            'You are a creative writing assistant. Help with storytelling, character development, and creative content.',
            '{"temperature": 0.9, "max_tokens": 3000}'
        );
    END IF;
END $$;

-- Create view for conversation summaries
CREATE VIEW conversation_summaries AS
SELECT 
    c.id,
    c.user_id,
    c.title,
    c.description,
    c.model,
    c.is_archived,
    c.is_shared,
    c.share_token,
    c.message_count,
    c.total_tokens,
    c.created_at,
    c.updated_at,
    c.last_message_at,
    u.username,
    u.email
FROM conversations c
JOIN users u ON c.user_id = u.id;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 002 completed: Conversations table created successfully';
END $$;
