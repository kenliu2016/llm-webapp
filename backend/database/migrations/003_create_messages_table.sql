-- Migration 003: Create Messages Table
-- Creates the messages table for individual chat messages

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text',
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    tokens INTEGER DEFAULT 0,
    model VARCHAR(100),
    finish_reason VARCHAR(50),
    is_edited BOOLEAN DEFAULT false,
    edit_history JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for messages table
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
CREATE INDEX IF NOT EXISTS idx_messages_content_type ON messages(content_type);
CREATE INDEX IF NOT EXISTS idx_messages_tokens ON messages(tokens);

-- Full-text search index on content
CREATE INDEX IF NOT EXISTS idx_messages_content_search ON messages USING gin(content gin_trgm_ops);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_messages_updated_at 
BEFORE UPDATE ON messages 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add constraints
ALTER TABLE messages ADD CONSTRAINT messages_content_not_empty CHECK (length(content) > 0);
ALTER TABLE messages ADD CONSTRAINT messages_tokens_positive CHECK (tokens >= 0);
ALTER TABLE messages ADD CONSTRAINT messages_content_type_valid CHECK (content_type IN ('text', 'markdown', 'code', 'image', 'file'));

-- Create function to update conversation statistics
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update conversation stats on message insert
        UPDATE conversations 
        SET 
            message_count = message_count + 1,
            total_tokens = total_tokens + COALESCE(NEW.tokens, 0),
            last_message_at = NEW.created_at,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.conversation_id;
        
        -- Auto-generate conversation title from first user message
        UPDATE conversations 
        SET title = CASE 
            WHEN title = 'New Conversation' AND NEW.role = 'user' THEN 
                left(NEW.content, 50) || CASE WHEN length(NEW.content) > 50 THEN '...' ELSE '' END
            ELSE title 
        END
        WHERE id = NEW.conversation_id;
        
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Update conversation stats on message delete
        UPDATE conversations 
        SET 
            message_count = GREATEST(message_count - 1, 0),
            total_tokens = GREATEST(total_tokens - COALESCE(OLD.tokens, 0), 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.conversation_id;
        
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Update conversation stats on message update
        UPDATE conversations 
        SET 
            total_tokens = total_tokens - COALESCE(OLD.tokens, 0) + COALESCE(NEW.tokens, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.conversation_id;
        
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversation_stats_trigger 
AFTER INSERT OR UPDATE OR DELETE ON messages 
FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();

-- Create function to validate message data
CREATE OR REPLACE FUNCTION validate_message_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure content is not empty
    IF length(trim(NEW.content)) = 0 THEN
        RAISE EXCEPTION 'Message content cannot be empty';
    END IF;
    
    -- Validate role
    IF NEW.role NOT IN ('user', 'assistant', 'system') THEN
        RAISE EXCEPTION 'Invalid message role: %. Must be user, assistant, or system', NEW.role;
    END IF;
    
    -- Validate content type
    IF NEW.content_type NOT IN ('text', 'markdown', 'code', 'image', 'file') THEN
        RAISE EXCEPTION 'Invalid content type: %', NEW.content_type;
    END IF;
    
    -- Ensure tokens is not negative
    IF NEW.tokens < 0 THEN
        NEW.tokens = 0;
    END IF;
    
    -- Trim content
    NEW.content = trim(NEW.content);
    
    -- Store edit history if content is being updated
    IF TG_OP = 'UPDATE' AND OLD.content != NEW.content THEN
        NEW.is_edited = true;
        NEW.edit_history = OLD.edit_history || jsonb_build_object(
            'timestamp', CURRENT_TIMESTAMP,
            'old_content', OLD.content,
            'new_content', NEW.content
        );
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER validate_message_data_trigger 
BEFORE INSERT OR UPDATE ON messages 
FOR EACH ROW EXECUTE FUNCTION validate_message_data();

-- Insert sample messages for existing conversations
DO $$
DECLARE
    welcome_conv_id UUID;
    code_conv_id UUID;
    creative_conv_id UUID;
BEGIN
    -- Get conversation IDs
    SELECT id INTO welcome_conv_id FROM conversations WHERE title = 'Welcome to LLM Chat' LIMIT 1;
    SELECT id INTO code_conv_id FROM conversations WHERE title = 'Code Assistant' LIMIT 1;
    SELECT id INTO creative_conv_id FROM conversations WHERE title = 'Creative Writing' LIMIT 1;
    
    -- Insert welcome conversation messages
    IF welcome_conv_id IS NOT NULL THEN
        INSERT INTO messages (conversation_id, role, content, content_type, tokens, model) VALUES 
        (welcome_conv_id, 'user', 'Hi! I''m new to this LLM chat application. Can you help me understand how it works?', 'text', 25, 'gpt-3.5-turbo'),
        (welcome_conv_id, 'assistant', 'Welcome to LLM Chat! I''d be happy to help you get started. Here are the key features:

## Main Features:
- **Multiple AI Models**: Choose from GPT-4, GPT-3.5, Claude, and more
- **Conversation Management**: Organize your chats with titles and descriptions
- **File Attachments**: Upload documents and images for analysis
- **Code Highlighting**: Automatic syntax highlighting for code blocks
- **Dark/Light Theme**: Toggle between themes for your preference

## Getting Started:
1. Start a new conversation or continue this one
2. Select your preferred AI model from the dropdown
3. Type your message and press Enter to send
4. Use Shift+Enter for multi-line messages

Feel free to ask me anything about using the application!', 'markdown', 150, 'gpt-3.5-turbo');
    END IF;
    
    -- Insert code conversation messages
    IF code_conv_id IS NOT NULL THEN
        INSERT INTO messages (conversation_id, role, content, content_type, tokens, model) VALUES 
        (code_conv_id, 'user', 'Can you help me write a function to calculate fibonacci numbers in Python?', 'text', 20, 'gpt-4'),
        (code_conv_id, 'assistant', 'I''ll help you create a Fibonacci function in Python. Here are a few different approaches:

## Recursive Approach (Simple but inefficient for large numbers):
```python
def fibonacci_recursive(n):
    """Calculate nth Fibonacci number using recursion."""
    if n <= 1:
        return n
    return fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2)

# Example usage
print(fibonacci_recursive(10))  # Output: 55
```

## Iterative Approach (Efficient):
```python
def fibonacci_iterative(n):
    """Calculate nth Fibonacci number using iteration."""
    if n <= 1:
        return n
    
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

# Example usage
print(fibonacci_iterative(10))  # Output: 55
```

## Memoized Approach (Best for multiple calls):
```python
def fibonacci_memoized(n, memo={}):
    """Calculate nth Fibonacci number with memoization."""
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    
    memo[n] = fibonacci_memoized(n - 1, memo) + fibonacci_memoized(n - 2, memo)
    return memo[n]

# Example usage
print(fibonacci_memoized(10))  # Output: 55
```

The iterative approach is generally the best balance of efficiency and readability for most use cases.', 'markdown', 280, 'gpt-4');
    END IF;
    
    -- Insert creative conversation messages
    IF creative_conv_id IS NOT NULL THEN
        INSERT INTO messages (conversation_id, role, content, content_type, tokens, model) VALUES 
        (creative_conv_id, 'user', 'I want to write a short story about a time traveler who accidentally changes history. Can you help me brainstorm some ideas?', 'text', 30, 'claude-3-sonnet'),
        (creative_conv_id, 'assistant', 'What a fascinating premise! Time travel stories with unintended consequences offer rich storytelling possibilities. Here are some brainstorming ideas:

## Character Concepts:
- **The Clumsy Historian**: A researcher who travels back to observe historical events but keeps accidentally interfering
- **The Well-Meaning Tourist**: Someone who travels to the past for vacation but can''t resist "helping" people
- **The Butterfly Effect Student**: A physics student testing time travel who doesn''t realize small actions have huge consequences

## Accidental Changes Ideas:
1. **The Lost Wallet**: Dropping a modern wallet in ancient Rome leads to advanced technology being discovered centuries early
2. **The Saved Life**: Preventing someone''s "destined" death changes the course of major historical events
3. **The Introduced Phrase**: Teaching a historical figure a modern saying that becomes a famous quote, altering literature
4. **The Medical Intervention**: Accidentally curing a disease too early, leading to overpopulation and resource wars

## Story Structure Options:
- **The Escalating Problem**: Each attempt to fix the timeline makes things worse
- **The Ripple Discovery**: The protagonist doesn''t realize what they''ve changed until returning to their present
- **The Moral Dilemma**: They could fix everything but would have to let something terrible happen

What type of time period interests you most? And would you prefer a serious or more comedic tone?', 'markdown', 250, 'claude-3-sonnet');
    END IF;
END $$;

-- Create view for message summaries with conversation context
CREATE VIEW message_summaries AS
SELECT 
    m.id,
    m.conversation_id,
    m.role,
    m.content,
    m.content_type,
    m.tokens,
    m.model,
    m.is_edited,
    m.created_at,
    m.updated_at,
    c.title as conversation_title,
    c.user_id,
    u.username
FROM messages m
JOIN conversations c ON m.conversation_id = c.id
JOIN users u ON c.user_id = u.id;

-- Create function to search messages
CREATE OR REPLACE FUNCTION search_messages(
    search_term TEXT,
    user_id_param UUID DEFAULT NULL,
    limit_param INTEGER DEFAULT 50,
    offset_param INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    conversation_id UUID,
    role VARCHAR(20),
    content TEXT,
    conversation_title VARCHAR(255),
    similarity_score REAL,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.conversation_id,
        m.role,
        m.content,
        c.title as conversation_title,
        similarity(m.content, search_term) as similarity_score,
        m.created_at
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE 
        (user_id_param IS NULL OR c.user_id = user_id_param)
        AND similarity(m.content, search_term) > 0.1
    ORDER BY similarity_score DESC, m.created_at DESC
    LIMIT limit_param
    OFFSET offset_param;
END;
$$ language 'plpgsql';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 003 completed: Messages table created successfully';
END $$;
