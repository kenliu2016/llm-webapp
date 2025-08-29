-- Migration 001: Create Users Table
-- Creates the users table with authentication and profile information

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    profile_image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    reset_password_token VARCHAR(255),
    reset_password_expires TIMESTAMP,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_password_token ON users(reset_password_token);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
BEFORE UPDATE ON users 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add constraints
ALTER TABLE users ADD CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username ~* '^[a-zA-Z0-9_-]{3,50}$');
ALTER TABLE users ADD CONSTRAINT users_password_hash_not_empty CHECK (length(password_hash) > 0);

-- Insert default admin user (password: admin123 - should be changed in production)
INSERT INTO users (
    email, 
    username, 
    password_hash, 
    first_name, 
    last_name, 
    is_verified,
    preferences
) VALUES (
    'admin@llmchat.app',
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeANs5oBq3dXq3oX2', -- bcrypt hash of 'admin123'
    'System',
    'Administrator',
    true,
    '{"theme": "dark", "language": "en", "notifications": true}'
) ON CONFLICT (email) DO NOTHING;

-- Create function to validate user data
CREATE OR REPLACE FUNCTION validate_user_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate email format
    IF NEW.email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Invalid email format: %', NEW.email;
    END IF;
    
    -- Validate username format
    IF NEW.username !~* '^[a-zA-Z0-9_-]{3,50}$' THEN
        RAISE EXCEPTION 'Invalid username format. Must be 3-50 characters, alphanumeric, dash, or underscore only';
    END IF;
    
    -- Ensure password hash is not empty
    IF length(NEW.password_hash) = 0 THEN
        RAISE EXCEPTION 'Password hash cannot be empty';
    END IF;
    
    -- Convert email to lowercase
    NEW.email = lower(NEW.email);
    
    -- Convert username to lowercase
    NEW.username = lower(NEW.username);
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER validate_user_data_trigger 
BEFORE INSERT OR UPDATE ON users 
FOR EACH ROW EXECUTE FUNCTION validate_user_data();

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 001 completed: Users table created successfully';
END $$;
