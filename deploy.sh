#!/bin/bash

# LLM Web App Deployment Script
# This script will help deploy the application to /var/www/html/llm-webapp

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SOURCE_DIR="/home/m/Desktop/llm/llm-webapp"
DEST_DIR="/var/www/html/llm-webapp"
BACKUP_DIR="/var/backups/llm-webapp-$(date +%Y%m%d-%H%M%S)"
NGINX_CONFIG="/etc/nginx/sites-available/llm-webapp"
NGINX_ENABLED="/etc/nginx/sites-enabled/llm-webapp"

echo -e "${BLUE}=== LLM Web App Deployment Script ===${NC}"

# Check if running as root for certain operations
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}This script requires sudo privileges for certain operations.${NC}"
        echo "Please run with sudo or ensure you have write permissions to $DEST_DIR"
    fi
}

# Create backup if destination exists
create_backup() {
    if [ -d "$DEST_DIR" ]; then
        echo -e "${YELLOW}Creating backup of existing installation...${NC}"
        sudo mkdir -p "$(dirname "$BACKUP_DIR")"
        sudo cp -r "$DEST_DIR" "$BACKUP_DIR"
        echo -e "${GREEN}Backup created at: $BACKUP_DIR${NC}"
    fi
}

# Copy application files
deploy_files() {
    echo -e "${BLUE}Deploying application files...${NC}"
    
    # Create destination directory
    sudo mkdir -p "$DEST_DIR"
    
    # Copy all files
    sudo cp -r "$SOURCE_DIR"/* "$DEST_DIR"/
    
    # Set proper ownership
    sudo chown -R www-data:www-data "$DEST_DIR"
    
    # Set proper permissions
    sudo chmod -R 755 "$DEST_DIR"
    sudo chmod -R 644 "$DEST_DIR"/.env.example
    
    echo -e "${GREEN}Files deployed successfully!${NC}"
}

# Install dependencies
install_dependencies() {
    echo -e "${BLUE}Installing Node.js dependencies...${NC}"
    
    # Frontend dependencies
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd "$DEST_DIR/frontend"
    sudo -u www-data npm install
    
    # Backend dependencies
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    cd "$DEST_DIR/backend"
    sudo -u www-data npm install
    
    echo -e "${GREEN}Dependencies installed successfully!${NC}"
}

# Setup environment file
setup_environment() {
    echo -e "${BLUE}Setting up environment file...${NC}"
    
    if [ ! -f "$DEST_DIR/.env" ]; then
        sudo cp "$DEST_DIR/.env.example" "$DEST_DIR/.env"
        sudo chown www-data:www-data "$DEST_DIR/.env"
        sudo chmod 600 "$DEST_DIR/.env"
        
        echo -e "${YELLOW}Environment file created from template.${NC}"
        echo -e "${YELLOW}Please edit $DEST_DIR/.env with your configuration.${NC}"
    else
        echo -e "${GREEN}Environment file already exists.${NC}"
    fi
}

# Build frontend
build_frontend() {
    echo -e "${BLUE}Building frontend for production...${NC}"
    
    cd "$DEST_DIR/frontend"
    sudo -u www-data npm run build
    
    echo -e "${GREEN}Frontend built successfully!${NC}"
}

# Build backend
build_backend() {
    echo -e "${BLUE}Building backend for production...${NC}"
    
    cd "$DEST_DIR/backend"
    sudo -u www-data npm run build
    
    echo -e "${GREEN}Backend built successfully!${NC}"
}

# Setup Nginx configuration
setup_nginx() {
    echo -e "${BLUE}Setting up Nginx configuration...${NC}"
    
    # Copy nginx config
    sudo cp "$DEST_DIR/nginx/llm-webapp.conf" "$NGINX_CONFIG"
    
    # Create symbolic link if it doesn't exist
    if [ ! -L "$NGINX_ENABLED" ]; then
        sudo ln -s "$NGINX_CONFIG" "$NGINX_ENABLED"
        echo -e "${GREEN}Nginx configuration linked.${NC}"
    else
        echo -e "${YELLOW}Nginx configuration already linked.${NC}"
    fi
    
    # Test nginx configuration
    if sudo nginx -t; then
        echo -e "${GREEN}Nginx configuration is valid.${NC}"
        echo -e "${YELLOW}Remember to reload nginx: sudo systemctl reload nginx${NC}"
    else
        echo -e "${RED}Nginx configuration has errors. Please check and fix.${NC}"
    fi
}

# Setup systemd service (optional)
setup_systemd() {
    echo -e "${BLUE}Setting up systemd service...${NC}"
    
    cat << EOF | sudo tee /etc/systemd/system/llm-webapp.service > /dev/null
[Unit]
Description=LLM Web App Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$DEST_DIR/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable llm-webapp
    
    echo -e "${GREEN}Systemd service created and enabled.${NC}"
    echo -e "${YELLOW}Start the service with: sudo systemctl start llm-webapp${NC}"
}

# Main deployment function
main() {
    echo -e "${BLUE}Starting deployment process...${NC}"
    
    check_sudo
    create_backup
    deploy_files
    install_dependencies
    setup_environment
    build_frontend
    build_backend
    setup_nginx
    
    echo -e "${GREEN}=== Deployment completed successfully! ===${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Edit $DEST_DIR/.env with your configuration"
    echo "2. Setup your database and run migrations:"
    echo "   cd $DEST_DIR/backend && npm run db:migrate"
    echo "3. Setup SSL certificates for production"
    echo "4. Reload nginx: sudo systemctl reload nginx"
    echo "5. Start the application:"
    echo "   - With systemd: sudo systemctl start llm-webapp"
    echo "   - With PM2: pm2 start $DEST_DIR/backend/dist/index.js --name llm-webapp"
    echo ""
    echo -e "${GREEN}Your application will be available at your configured domain!${NC}"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "backup")
        create_backup
        ;;
    "nginx")
        setup_nginx
        ;;
    "systemd")
        setup_systemd
        ;;
    "build")
        build_frontend
        build_backend
        ;;
    "help")
        echo "Usage: $0 [deploy|backup|nginx|systemd|build|help]"
        echo ""
        echo "Commands:"
        echo "  deploy  - Full deployment (default)"
        echo "  backup  - Create backup only"
        echo "  nginx   - Setup nginx configuration only"
        echo "  systemd - Setup systemd service only"
        echo "  build   - Build frontend and backend only"
        echo "  help    - Show this help message"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Use '$0 help' for usage information."
        exit 1
        ;;
esac
