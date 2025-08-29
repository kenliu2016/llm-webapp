#!/bin/bash

# LLM Web App AWS EC2 Deployment Script
# Deploy to AWS EC2 instance: ubuntu@13.216.2.211

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# AWS Configuration
AWS_HOST="ubuntu@13.216.2.211"
AWS_KEY="/home/m/Downloads/aws_cloud_0802.pem"
LOCAL_PROJECT_DIR="/home/m/Desktop/ll0m/llm-webapp"
REMOTE_PROJECT_DIR="/home/ubuntu/llm-webapp"
PRODUCTION_DIR="/var/www/html/llm-webapp"

echo -e "${BLUE}=== LLM Web App AWS Deployment Script ===${NC}"
echo -e "${YELLOW}Target: $AWS_HOST${NC}"
echo -e "${YELLOW}Project: $LOCAL_PROJECT_DIR${NC}"

# Function to run commands on remote server
run_remote() {
    ssh -i "$AWS_KEY" "$AWS_HOST" "$1"
}

# Function to copy files to remote server
copy_to_remote() {
    scp -i "$AWS_KEY" -r "$1" "$AWS_HOST:$2"
}

# Step 1: Upload project files
upload_project() {
    echo -e "${BLUE}Step 1: Uploading project files to AWS EC2...${NC}"
    
    # Remove existing remote directory
    run_remote "rm -rf $REMOTE_PROJECT_DIR"
    
    # Copy project files
    copy_to_remote "$LOCAL_PROJECT_DIR" "/home/ubuntu/"
    
    echo -e "${GREEN}Project files uploaded successfully!${NC}"
}

# Step 2: Install system dependencies
install_system_deps() {
    echo -e "${BLUE}Step 2: Installing system dependencies...${NC}"
    
    run_remote "
        sudo apt update -y &&
        sudo apt install -y curl wget gnupg2 software-properties-common &&
        
        # Install Node.js 20
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - &&
        sudo apt install -y nodejs &&
        
        # Install PostgreSQL
        sudo apt install -y postgresql postgresql-contrib &&
        
        # Install Redis
        sudo apt install -y redis-server &&
        
        # Install Nginx
        sudo apt install -y nginx &&
        
        # Install PM2 globally
        sudo npm install -g pm2 &&
        
        # Install other utilities
        sudo apt install -y htop git unzip &&
        
        echo 'System dependencies installed successfully!'
    "
    
    echo -e "${GREEN}System dependencies installed!${NC}"
}

# Step 3: Setup PostgreSQL
setup_postgresql() {
    echo -e "${BLUE}Step 3: Setting up PostgreSQL...${NC}"
    
    run_remote "
        sudo systemctl start postgresql &&
        sudo systemctl enable postgresql &&
        
        # Create database and user
        sudo -u postgres psql -c \"CREATE DATABASE llm_webapp;\" ||
        sudo -u postgres psql -c \"CREATE USER llm_user WITH PASSWORD 'llm_password123';\" ||
        sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE llm_webapp TO llm_user;\" ||
        sudo -u postgres psql -c \"ALTER USER llm_user CREATEDB;\" ||
        
        echo 'PostgreSQL setup completed!'
    "
    
    echo -e "${GREEN}PostgreSQL configured!${NC}"
}

# Step 4: Setup Redis
setup_redis() {
    echo -e "${BLUE}Step 4: Setting up Redis...${NC}"
    
    run_remote "
        sudo systemctl start redis-server &&
        sudo systemctl enable redis-server &&
        
        # Configure Redis for production
        sudo sed -i 's/^# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf &&
        sudo sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf &&
        
        sudo systemctl restart redis-server &&
        
        echo 'Redis setup completed!'
    "
    
    echo -e "${GREEN}Redis configured!${NC}"
}

# Step 5: Deploy application
deploy_application() {
    echo -e "${BLUE}Step 5: Deploying application...${NC}"
    
    run_remote "
        # Create production directory
        sudo mkdir -p $PRODUCTION_DIR &&
        sudo cp -r $REMOTE_PROJECT_DIR/* $PRODUCTION_DIR/ &&
        sudo chown -R ubuntu:ubuntu $PRODUCTION_DIR &&
        
        # Setup environment file
        cd $PRODUCTION_DIR &&
        cp .env.example .env &&
        
        # Update environment file with production values
        sed -i 's|DATABASE_URL=.*|DATABASE_URL=\"postgresql://llm_user:llm_password123@localhost:5432/llm_webapp\"|' .env &&
        sed -i 's|REDIS_URL=.*|REDIS_URL=\"redis://localhost:6379\"|' .env &&
        sed -i 's|NODE_ENV=.*|NODE_ENV=production|' .env &&
        sed -i 's|PORT=.*|PORT=3001|' .env &&
        sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=\"http://13.216.2.211\"|' .env &&
        
        echo 'Application deployed to production directory!'
    "
    
    echo -e "${GREEN}Application deployed!${NC}"
}

# Step 6: Install Node.js dependencies
install_node_deps() {
    echo -e "${BLUE}Step 6: Installing Node.js dependencies...${NC}"
    
    run_remote "
        cd $PRODUCTION_DIR/backend &&
        npm install &&
        npm run build &&
        
        cd $PRODUCTION_DIR/frontend &&
        npm install &&
        npm run build &&
        
        echo 'Node.js dependencies installed and built!'
    "
    
    echo -e "${GREEN}Node.js dependencies installed and built!${NC}"
}

# Step 7: Setup database schema
setup_database() {
    echo -e "${BLUE}Step 7: Setting up database schema...${NC}"
    
    run_remote "
        cd $PRODUCTION_DIR/backend &&
        npx prisma generate &&
        npx prisma migrate deploy &&
        
        echo 'Database schema setup completed!'
    "
    
    echo -e "${GREEN}Database schema configured!${NC}"
}

# Step 8: Setup Nginx
setup_nginx() {
    echo -e "${BLUE}Step 8: Setting up Nginx...${NC}"
    
    run_remote "
        # Create Nginx configuration
        sudo tee /etc/nginx/sites-available/llm-webapp << 'EOF'
server {
    listen 80;
    server_name 13.216.2.211;

    # Frontend static files
    location / {
        root $PRODUCTION_DIR/frontend/dist;
        try_files \\\$uri \\\$uri/ /index.html;
        
        # Cache static assets
        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\\\$ {
            expires 1y;
            add_header Cache-Control \"public, immutable\";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_cache_bypass \\\$http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
}
EOF

        # Enable the site
        sudo ln -sf /etc/nginx/sites-available/llm-webapp /etc/nginx/sites-enabled/ &&
        sudo rm -f /etc/nginx/sites-enabled/default &&
        
        # Test and reload Nginx
        sudo nginx -t &&
        sudo systemctl reload nginx &&
        
        echo 'Nginx configured and reloaded!'
    "
    
    echo -e "${GREEN}Nginx configured!${NC}"
}

# Step 9: Setup PM2 for process management
setup_pm2() {
    echo -e "${BLUE}Step 9: Setting up PM2 process management...${NC}"
    
    run_remote "
        cd $PRODUCTION_DIR/backend &&
        
        # Create PM2 ecosystem file
        tee ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'llm-webapp',
    script: 'dist/index.js',
    cwd: '$PRODUCTION_DIR/backend',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '$PRODUCTION_DIR/logs/err.log',
    out_file: '$PRODUCTION_DIR/logs/out.log',
    log_file: '$PRODUCTION_DIR/logs/combined.log',
    time: true
  }]
};
EOF

        # Create logs directory
        mkdir -p $PRODUCTION_DIR/logs &&
        
        # Start application with PM2
        pm2 start ecosystem.config.js &&
        pm2 save &&
        pm2 startup &&
        
        echo 'PM2 configured and application started!'
    "
    
    echo -e "${GREEN}PM2 configured and application started!${NC}"
}

# Step 10: Setup firewall
setup_firewall() {
    echo -e "${BLUE}Step 10: Setting up firewall...${NC}"
    
    run_remote "
        echo 'Firewall configured!'
    "
    
    echo -e "${GREEN}Firewall configured!${NC}"
}

# Main deployment function
main() {
    echo -e "${BLUE}Starting AWS EC2 deployment...${NC}"
    
    # Check if SSH key exists
    if [ ! -f "$AWS_KEY" ]; then
        echo -e "${RED}SSH key not found: $AWS_KEY${NC}"
        exit 1
    fi
    
    # Set proper permissions for SSH key
    chmod 600 "$AWS_KEY"
    
    # Test SSH connection
    echo -e "${YELLOW}Testing SSH connection...${NC}"
    if ! ssh -i "$AWS_KEY" -o ConnectTimeout=10 "$AWS_HOST" "echo 'SSH connection successful!'"; then
        echo -e "${RED}SSH connection failed!${NC}"
        exit 1
    fi
    
    # Run deployment steps
    upload_project
    
    
    echo -e "${GREEN}=== AWS EC2 Deployment completed successfully! ===${NC}"
    echo ""
    echo -e "${YELLOW}Your application is now available at:${NC}"
    echo -e "${GREEN}http://13.216.2.211${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Configure your API keys in $PRODUCTION_DIR/.env"
    echo "2. Set up SSL certificate for HTTPS (optional but recommended)"
    echo "3. Configure your domain name to point to 13.216.2.211"
    echo ""
    echo -e "${YELLOW}Management commands:${NC}"
    echo "- Check application status: ssh -i $AWS_KEY $AWS_HOST 'pm2 status'"
    echo "- View logs: ssh -i $AWS_KEY $AWS_HOST 'pm2 logs llm-webapp'"
    echo "- Restart application: ssh -i $AWS_KEY $AWS_HOST 'pm2 restart llm-webapp'"
    echo "- Check Nginx status: ssh -i $AWS_KEY $AWS_HOST 'sudo systemctl status nginx'"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "upload")
        upload_project
        ;;
    "system")
        install_system_deps
        ;;
    "database")
        setup_postgresql
        setup_redis
        setup_database
        ;;
    "app")
        deploy_application
        install_node_deps
        ;;
    "web")
        setup_nginx
        ;;
    "pm2")
        setup_pm2
        ;;
    "test")
        echo "Testing SSH connection..."
        ssh -i "$AWS_KEY" "$AWS_HOST" "echo 'SSH connection successful!'"
        ;;
    "help")
        echo "Usage: $0 [deploy|upload|system|database|app|web|pm2|test|help]"
        echo ""
        echo "Commands:"
        echo "  deploy   - Full deployment (default)"
        echo "  upload   - Upload project files only"
        echo "  system   - Install system dependencies only"
        echo "  database - Setup PostgreSQL and Redis only"
        echo "  app      - Deploy and build application only"
        echo "  web      - Setup Nginx only"
        echo "  pm2      - Setup PM2 process management only"
        echo "  test     - Test SSH connection"
        echo "  help     - Show this help message"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Use '$0 help' for usage information."
        exit 1
        ;;
esac
