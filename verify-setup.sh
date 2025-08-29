#!/bin/bash

# LLM Web App Setup Verification Script
# This script checks if the project structure is correct and dependencies are properly configured

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_DIR="/home/m/Desktop/llm/llm-webapp"

echo -e "${BLUE}=== LLM Web App Setup Verification ===${NC}"

# Check if project directory exists
check_project_structure() {
    echo -e "${BLUE}Checking project structure...${NC}"
    
    local required_dirs=(
        "frontend"
        "frontend/src"
        "frontend/src/components"
        "frontend/src/services"
        "frontend/src/styles"
        "backend"
        "backend/routes"
        "backend/services"
        "backend/middleware"
        "nginx"
    )
    
    local required_files=(
        "frontend/package.json"
        "frontend/vite.config.ts"
        "frontend/tailwind.config.js"
        "frontend/tsconfig.json"
        "frontend/index.html"
        "backend/package.json"
        "backend/tsconfig.json"
        "backend/src/index.ts"
        "nginx/llm-webapp.conf"
        "nginx/development.conf"
        ".env.example"
        "README.md"
        "deploy.sh"
    )
    
    local all_good=true
    
    for dir in "${required_dirs[@]}"; do
        if [ -d "$PROJECT_DIR/$dir" ]; then
            echo -e "${GREEN}✓${NC} Directory exists: $dir"
        else
            echo -e "${RED}✗${NC} Missing directory: $dir"
            all_good=false
        fi
    done
    
    for file in "${required_files[@]}"; do
        if [ -f "$PROJECT_DIR/$file" ]; then
            echo -e "${GREEN}✓${NC} File exists: $file"
        else
            echo -e "${RED}✗${NC} Missing file: $file"
            all_good=false
        fi
    done
    
    if [ "$all_good" = true ]; then
        echo -e "${GREEN}✓ Project structure is complete!${NC}"
    else
        echo -e "${RED}✗ Project structure is incomplete!${NC}"
        return 1
    fi
}

# Check Node.js and npm
check_nodejs() {
    echo -e "${BLUE}Checking Node.js and npm...${NC}"
    
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        echo -e "${GREEN}✓${NC} Node.js: $node_version"
        
        # Check if Node.js version is 18 or higher
        local major_version=$(echo $node_version | sed 's/v\([0-9]*\).*/\1/')
        if [ "$major_version" -ge 18 ]; then
            echo -e "${GREEN}✓${NC} Node.js version is compatible (>= 18)"
        else
            echo -e "${RED}✗${NC} Node.js version is too old. Required: >= 18, Found: $node_version"
            return 1
        fi
    else
        echo -e "${RED}✗${NC} Node.js is not installed"
        return 1
    fi
    
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        echo -e "${GREEN}✓${NC} npm: $npm_version"
    else
        echo -e "${RED}✗${NC} npm is not installed"
        return 1
    fi
}

# Check package.json files
check_package_json() {
    echo -e "${BLUE}Checking package.json files...${NC}"
    
    # Frontend package.json
    if [ -f "$PROJECT_DIR/frontend/package.json" ]; then
        if jq . "$PROJECT_DIR/frontend/package.json" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Frontend package.json is valid JSON"
            
            # Check for essential dependencies
            local deps=$(jq -r '.dependencies | keys[]' "$PROJECT_DIR/frontend/package.json" 2>/dev/null || echo "")
            if echo "$deps" | grep -q "react"; then
                echo -e "${GREEN}✓${NC} React dependency found"
            else
                echo -e "${RED}✗${NC} React dependency missing"
            fi
        else
            echo -e "${RED}✗${NC} Frontend package.json is invalid JSON"
        fi
    else
        echo -e "${RED}✗${NC} Frontend package.json not found"
    fi
    
    # Backend package.json
    if [ -f "$PROJECT_DIR/backend/package.json" ]; then
        if jq . "$PROJECT_DIR/backend/package.json" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Backend package.json is valid JSON"
            
            # Check for essential dependencies
            local deps=$(jq -r '.dependencies | keys[]' "$PROJECT_DIR/backend/package.json" 2>/dev/null || echo "")
            if echo "$deps" | grep -q "express"; then
                echo -e "${GREEN}✓${NC} Express dependency found"
            else
                echo -e "${RED}✗${NC} Express dependency missing"
            fi
        else
            echo -e "${RED}✗${NC} Backend package.json is invalid JSON"
        fi
    else
        echo -e "${RED}✗${NC} Backend package.json not found"
    fi
}

# Check if jq is available (for JSON parsing)
check_jq() {
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}Warning: jq is not installed. JSON validation will be skipped.${NC}"
        echo "Install jq with: sudo apt-get install jq"
        return 1
    fi
    return 0
}

# Check deployment script
check_deploy_script() {
    echo -e "${BLUE}Checking deployment script...${NC}"
    
    if [ -f "$PROJECT_DIR/deploy.sh" ]; then
        if [ -x "$PROJECT_DIR/deploy.sh" ]; then
            echo -e "${GREEN}✓${NC} Deploy script is executable"
        else
            echo -e "${YELLOW}!${NC} Deploy script exists but is not executable"
            echo "  Run: chmod +x $PROJECT_DIR/deploy.sh"
        fi
    else
        echo -e "${RED}✗${NC} Deploy script not found"
    fi
}

# Check environment template
check_env_template() {
    echo -e "${BLUE}Checking environment template...${NC}"
    
    if [ -f "$PROJECT_DIR/.env.example" ]; then
        echo -e "${GREEN}✓${NC} Environment template exists"
        
        # Check for essential variables
        local required_vars=(
            "NODE_ENV"
            "PORT"
            "DATABASE_URL"
            "REDIS_URL"
            "JWT_SECRET"
            "OPENAI_API_KEY"
        )
        
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" "$PROJECT_DIR/.env.example"; then
                echo -e "${GREEN}✓${NC} Environment variable: $var"
            else
                echo -e "${YELLOW}!${NC} Missing environment variable: $var"
            fi
        done
    else
        echo -e "${RED}✗${NC} Environment template not found"
    fi
}

# Generate summary report
generate_summary() {
    echo ""
    echo -e "${BLUE}=== Setup Summary ===${NC}"
    echo ""
    echo -e "${GREEN}The LLM Web App project structure has been created successfully!${NC}"
    echo ""
    echo "📁 Project Location: $PROJECT_DIR"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Review and customize the configuration files"
    echo "2. Install dependencies:"
    echo "   cd $PROJECT_DIR/frontend && npm install"
    echo "   cd $PROJECT_DIR/backend && npm install"
    echo "3. Set up your environment variables:"
    echo "   cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env"
    echo "   # Edit .env with your actual values"
    echo "4. For production deployment:"
    echo "   sudo $PROJECT_DIR/deploy.sh"
    echo ""
    echo -e "${BLUE}For detailed instructions, see:${NC} $PROJECT_DIR/README.md"
}

# Main verification function
main() {
    cd "$PROJECT_DIR" || exit 1
    
    check_jq
    check_nodejs
    check_project_structure
    check_package_json
    check_deploy_script
    check_env_template
    generate_summary
}

# Run verification
main
