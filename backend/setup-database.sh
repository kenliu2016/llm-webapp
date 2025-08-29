#!/bin/bash

# LLM Chat Application - Database Setup Script
# This script helps set up PostgreSQL and Redis for the LLM chat application

echo "🚀 LLM Chat Application - Database Setup"
echo "========================================"
echo ""

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root for security reasons"
   exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a service is running
service_running() {
    systemctl is-active --quiet "$1"
}

echo "📋 Checking system requirements..."
echo ""

# Check for PostgreSQL
if command_exists psql; then
    echo "✅ PostgreSQL client found"
    PG_VERSION=$(psql --version | grep -oP '\d+\.\d+' | head -1)
    echo "   Version: $PG_VERSION"
else
    echo "❌ PostgreSQL not found"
    echo "   Install with: sudo apt-get install postgresql postgresql-contrib"
fi

# Check for Redis
if command_exists redis-cli; then
    echo "✅ Redis client found"
    REDIS_VERSION=$(redis-cli --version | grep -oP '\d+\.\d+\.\d+')
    echo "   Version: $REDIS_VERSION"
else
    echo "❌ Redis not found"
    echo "   Install with: sudo apt-get install redis-server"
fi

echo ""
echo "🔧 Checking service status..."
echo ""

# Check PostgreSQL service
if service_running postgresql; then
    echo "✅ PostgreSQL service is running"
else
    echo "❌ PostgreSQL service is not running"
    echo "   Start with: sudo systemctl start postgresql"
    echo "   Enable on boot: sudo systemctl enable postgresql"
fi

# Check Redis service
if service_running redis-server || service_running redis; then
    echo "✅ Redis service is running"
else
    echo "❌ Redis service is not running"
    echo "   Start with: sudo systemctl start redis-server"
    echo "   Enable on boot: sudo systemctl enable redis-server"
fi

echo ""
echo "💾 Database Setup Instructions:"
echo ""

# PostgreSQL setup
echo "📊 PostgreSQL Setup:"
echo "1. Create database and user:"
echo "   sudo -u postgres psql"
echo "   CREATE DATABASE llm_chat_app;"
echo "   CREATE USER llm_user WITH ENCRYPTED PASSWORD 'your_password';"
echo "   GRANT ALL PRIVILEGES ON DATABASE llm_chat_app TO llm_user;"
echo "   ALTER USER llm_user CREATEDB;"
echo "   \\q"
echo ""

# Redis setup
echo "🔴 Redis Setup:"
echo "1. Redis should work out of the box after installation"
echo "2. Optional: Configure password in /etc/redis/redis.conf"
echo "3. Optional: Set maxmemory and eviction policy for production"
echo ""

echo "⚙️  Environment Configuration:"
echo "1. Copy .env.example to .env:"
echo "   cp .env.example .env"
echo ""
echo "2. Update database credentials in .env:"
echo "   DB_USER=llm_user"
echo "   DB_PASSWORD=your_password"
echo "   DB_NAME=llm_chat_app"
echo ""

echo "🗃️  Run Database Migrations:"
echo "1. Test connection:"
echo "   node database/test-services.js"
echo ""
echo "2. Run migrations:"
echo "   node database/migrate.js migrate"
echo ""
echo "3. Check migration status:"
echo "   node database/migrate.js status"
echo ""

echo "🔗 Quick Install Commands (Ubuntu/Debian):"
echo "==========================================="
echo "sudo apt-get update"
echo "sudo apt-get install postgresql postgresql-contrib redis-server"
echo "sudo systemctl start postgresql redis-server"
echo "sudo systemctl enable postgresql redis-server"
echo ""

echo "📖 For other operating systems:"
echo "- macOS: brew install postgresql redis"
echo "- CentOS/RHEL: yum install postgresql-server redis"
echo "- Windows: Use Docker or WSL2"
echo ""

echo "🐳 Docker Alternative:"
echo "===================="
echo "If you prefer Docker, you can use:"
echo ""
echo "# PostgreSQL"
echo "docker run -d --name postgres-llm \\"
echo "  -e POSTGRES_DB=llm_chat_app \\"
echo "  -e POSTGRES_USER=llm_user \\"
echo "  -e POSTGRES_PASSWORD=your_password \\"
echo "  -p 5432:5432 \\"
echo "  postgres:15"
echo ""
echo "# Redis"
echo "docker run -d --name redis-llm \\"
echo "  -p 6379:6379 \\"
echo "  redis:7-alpine"
echo ""

echo "✨ Setup complete! Follow the instructions above to get started."
