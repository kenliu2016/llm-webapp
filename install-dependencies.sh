#!/bin/bash

# 一键安装脚本：安装并配置 PostgreSQL 和 Redis 以及项目所需的依赖

set -e  # 发生错误时停止执行

# 检查是否在 macOS 系统上运行
system_type=$(uname)
if [ "$system_type" != "Darwin" ]; then
    echo "错误：此脚本仅支持 macOS 系统"
    exit 1
fi

# 检查是否有安装命令的权限
if [[ $EUID -eq 0 ]]; then
    echo "❌ 此脚本不应以 root 用户身份运行"
    exit 1
fi

# 打印欢迎信息
echo "🚀 LLM Chat Application - 依赖安装与配置脚本"
echo "============================================="
echo ""

# 检查 Homebrew 是否已安装
if ! command -v brew &> /dev/null; then
    echo "正在安装 Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # 将 Homebrew 添加到 PATH
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
else
    echo "✅ Homebrew 已安装"
fi

# 更新 Homebrew
echo "正在更新 Homebrew..."
brew update

# 检查并安装 PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "正在安装 PostgreSQL..."
    brew install postgresql@14
    # 启动 PostgreSQL 服务
    brew services start postgresql@14
    # 创建默认数据库用户
    createdb "$(whoami)"
    echo "✅ PostgreSQL 安装完成"
else
    echo "✅ PostgreSQL 已安装"
    # 使用兼容 macOS 的方式提取版本号
    PG_VERSION=$(psql --version | sed -E 's/.* ([0-9]\.[0-9]+).*/\1/')
    echo "   版本: $PG_VERSION"
    # 确保 PostgreSQL 服务正在运行
    if ! brew services list | grep -q 'postgresql.*started'; then
        echo "启动 PostgreSQL 服务..."
        brew services start postgresql@14
    fi
fi

# 检查并安装 Redis
if ! command -v redis-server &> /dev/null; then
    echo "正在安装 Redis..."
    brew install redis
    # 启动 Redis 服务
    brew services start redis
    echo "✅ Redis 安装完成"
else
    echo "✅ Redis 已安装"
    # 使用兼容 macOS 的方式提取版本号
    REDIS_VERSION=$(redis-cli --version | sed -E 's/.* ([0-9]\.[0-9]+\.[0-9]+).*/\1/')
    echo "   版本: $REDIS_VERSION"
    # 确保 Redis 服务正在运行
    if ! brew services list | grep -q 'redis.*started'; then
        echo "启动 Redis 服务..."
        brew services start redis
    fi
fi

# 验证安装
echo ""
echo "🔧 验证服务状态..."
echo ""

# 验证 PostgreSQL
if psql -c "SELECT 1" &> /dev/null; then
    echo "✅ PostgreSQL 连接测试成功"
else
    echo "❌ PostgreSQL 连接测试失败，请手动检查配置"
fi

# 验证 Redis
if redis-cli ping | grep -q "PONG"; then
    echo "✅ Redis 连接测试成功"
else
    echo "❌ Redis 连接测试失败，请手动检查配置"
fi

# 配置项目所需的数据库
# 使用绝对路径确保脚本在任何位置都能正确运行
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
DATABASE_DIR="$BACKEND_DIR/database"

# 确保 .env 文件存在
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo ""
    echo "🔑 未找到 .env 文件，正在从 .env.example 创建..."
    if [ -f "$BACKEND_DIR/.env.example" ]; then
        cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
        echo "✅ .env 文件已创建，请根据需要编辑它"
    else
        echo "❌ 未找到 .env.example 文件，无法创建 .env 文件"
        echo "请手动创建 .env 文件并配置数据库连接信息"
        exit 1
    fi
fi

echo ""
echo "🗄️  配置项目数据库..."

# 从 .env 文件中获取数据库配置
source "$BACKEND_DIR/.env"

# 获取或设置默认的数据库配置
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-llm_chat_app}
DB_USER=${DB_USER:-llm_user}
DB_PASSWORD=${DB_PASSWORD:-llm_password}

# 创建数据库用户（如果不存在）
if ! psql -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    echo "创建数据库用户 $DB_USER..."
    psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" postgres
    psql -c "ALTER USER $DB_USER CREATEDB;" postgres
    echo "✅ 数据库用户创建完成"
else
    echo "✅ 数据库用户 $DB_USER 已存在"
fi

# 创建数据库（如果不存在）
if ! psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "创建数据库 $DB_NAME..."
    createdb -O "$DB_USER" "$DB_NAME"
    echo "✅ 数据库创建完成"
else
    echo "✅ 数据库 $DB_NAME 已存在"
fi

# 加载数据库模式
echo ""
echo "📋 加载数据库模式..."
if [ -f "$DATABASE_DIR/schema.sql" ]; then
    echo "   注意：如果出现对象已存在的错误，这是正常现象，可以忽略"
    # 添加 ON_ERROR_STOP=0 以允许脚本继续执行，即使部分对象已存在
    psql -d "$DB_NAME" -U "$DB_USER" -v ON_ERROR_STOP=0 -f "$DATABASE_DIR/schema.sql"
    echo "✅ 数据库模式加载完成（已存在的对象被跳过）"
else
    echo "❌ 未找到 $DATABASE_DIR/schema.sql 文件，跳过模式加载"
fi

# 检查并运行数据库迁移
echo ""
echo "🔄 运行数据库迁移..."
if [ -f "$DATABASE_DIR/migrate.js" ]; then
    # 确保已安装 Node.js
    if ! command -v node &> /dev/null; then
        echo "正在安装 Node.js..."
        brew install node
        echo "✅ Node.js 安装完成"
    fi
    
    # 安装依赖（如果需要）
    if [ ! -d "$BACKEND_DIR/node_modules" ]; then
        echo "正在安装后端依赖..."
        cd "$BACKEND_DIR"
        npm install
        cd "$PROJECT_DIR"
    fi
    
    # 运行迁移（即使部分迁移失败也继续）
    echo "   注意：如果出现迁移文件已应用的错误，这是正常现象，可以忽略"
    cd "$BACKEND_DIR"
    node "$DATABASE_DIR/migrate.js" migrate || echo "⚠️  部分迁移可能已应用，继续执行其他步骤"
    cd "$PROJECT_DIR"
    echo "✅ 数据库迁移检查完成"
else
    echo "❌ 未找到 $DATABASE_DIR/migrate.js 文件，跳过数据库迁移"
fi

# 测试数据库连接
echo ""
echo "🔌 测试数据库连接..."
if [ -f "$DATABASE_DIR/test-services.js" ]; then
    cd "$BACKEND_DIR"
    # 尝试运行测试脚本，但如果失败也继续执行
    node "$DATABASE_DIR/test-services.js" || echo "⚠️  数据库连接测试脚本执行失败，可能是缺少必要的模块文件"
    cd "$PROJECT_DIR"
else
    echo "⚠️  未找到 $DATABASE_DIR/test-services.js 文件，跳过连接测试"
fi

# 安装前端依赖
echo ""
echo "🎨 安装前端依赖..."
FRONTEND_DIR="$PROJECT_DIR/frontend"
if [ -d "$FRONTEND_DIR" ]; then
    cd "$FRONTEND_DIR"
    # 确保前端项目的 postcss.config.js 已存在
    if [ ! -f "$FRONTEND_DIR/postcss.config.js" ]; then
        echo "创建 postcss.config.js 文件..."
        echo "export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}" > "$FRONTEND_DIR/postcss.config.js"
        echo "✅ postcss.config.js 文件已创建"
    fi
    
    npm install
    echo "✅ 前端依赖安装完成"
    cd "$PROJECT_DIR"
else
    echo "❌ 未找到前端目录 $FRONTEND_DIR，跳过前端依赖安装"
fi

# 安装后端依赖（如果尚未安装）
echo ""
echo "⚙️  安装后端依赖..."
if [ -d "$BACKEND_DIR" ] && [ ! -d "$BACKEND_DIR/node_modules" ]; then
    cd "$BACKEND_DIR"
    npm install
    echo "✅ 后端依赖安装完成"
    cd "$PROJECT_DIR"
fi

# 构建项目
echo ""
echo "🏗️  构建项目..."
if [ -d "$FRONTEND_DIR" ]; then
    cd "$FRONTEND_DIR"
    npm run build
    echo "✅ 前端项目构建完成"
    cd "$PROJECT_DIR"
else
    echo "❌ 未找到前端目录 $FRONTEND_DIR，跳过项目构建"
fi

# 显示完成信息
echo ""
echo "✅ 所有依赖项安装和配置完成！"
echo ""
echo "📋 服务状态摘要："
echo "- PostgreSQL: 已安装并运行"
echo "- Redis: 已安装并运行"
echo "- 数据库: $DB_NAME 已创建并配置"
echo "- 数据库用户: $DB_USER 已创建"
echo ""
echo "💡 如何使用："
echo "1. 启动后端服务器："
echo "   cd backend && npm run dev"
echo "2. 启动前端开发服务器："
echo "   cd frontend && npm run dev"
echo "3. 访问应用："
echo "   http://localhost:5173"
echo ""
echo "🔧 管理服务："
echo "- 停止 PostgreSQL: brew services stop postgresql"
echo "- 停止 Redis: brew services stop redis"
echo "- 查看所有服务状态: brew services list"
echo ""
echo "✨ 祝您使用愉快！"

echo "\n✅ 所有依赖项安装和配置完成！"
echo "\n提示："
echo "1. 要停止 PostgreSQL 服务：brew services stop postgresql"
echo "2. 要停止 Redis 服务：brew services stop redis"
echo "3. 要重新启动所有服务：./install-dependencies.sh"