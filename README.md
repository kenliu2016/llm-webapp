# LLM Chat Web Application

A production-ready, full-stack web application for chatting with Large Language Models (LLMs). Built with React, TypeScript, Node.js, and Socket.IO for real-time communication.

## 🚀 Features

- **Real-time Chat**: WebSocket-based communication using Socket.IO
- **Multiple LLM Support**: OpenAI GPT, Anthropic Claude, and more
- **Modern UI**: Dark/Light theme with responsive design
- **User Authentication**: JWT-based authentication with refresh tokens
- **Chat History**: PostgreSQL storage with Redis caching
- **Rate Limiting**: Built-in API rate limiting and abuse prevention
- **Security**: Comprehensive security headers and CORS protection
- **Production Ready**: Nginx configuration and Docker support
- **TypeScript**: Full TypeScript support for type safety

## 📁 Project Structure

```
llm-webapp/
├── frontend/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── services/        # API communication
│   │   └── styles/          # Tailwind CSS styling
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── backend/                  # Node.js + Express backend
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic & LLM integration
│   │   └── middleware/      # Auth, rate limiting, etc.
│   ├── package.json
│   └── tsconfig.json
├── nginx/                    # Nginx configuration
│   ├── llm-webapp.conf      # Production config
│   └── development.conf     # Development config
└── .env.example             # Environment variables template
```

## 🛠️ Technology Stack

### Frontend
- **React 18+** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Socket.IO Client** for real-time communication
- **Zustand** for state management
- **React Markdown** for message rendering
- **Framer Motion** for animations

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **Socket.IO** for WebSocket communication
- **Prisma** ORM for database operations
- **PostgreSQL** for data persistence
- **Redis** for session management and caching
- **JWT** for authentication
- **Winston** for logging

### Infrastructure
- **Nginx** as reverse proxy
- **Docker** for containerization (optional)
- **PM2** for process management

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 13+
- Redis 6+
- Nginx (for production)

### 1. Clone and Setup

```bash
# Create project directory
sudo mkdir -p /var/www/html/llm-webapp
sudo chown $USER:$USER /var/www/html/llm-webapp

# Copy project files (from your development location)
cp -r /home/m/Desktop/llm/llm-webapp/* /var/www/html/llm-webapp/
cd /var/www/html/llm-webapp
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `OPENAI_API_KEY`: Your OpenAI API key
- `FRONTEND_URL`: Frontend application URL

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev  # Development server
# or
npm run build  # Production build
```

### 4. Backend Setup

```bash
cd backend
npm install

# Database setup
npm run db:generate
npm run db:migrate

# Start development server
npm run dev
# or
npm run build && npm start  # Production
```

### 5. Nginx Configuration (Production)

```bash
# Copy nginx configuration
sudo cp nginx/llm-webapp.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/llm-webapp.conf /etc/nginx/sites-enabled/

# Update domain and SSL certificate paths in the config
sudo nano /etc/nginx/sites-available/llm-webapp.conf

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

## 🔧 Development

### Frontend Development

```bash
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npm test            # Run tests
```

The frontend will be available at `http://localhost:5173`

### Backend Development

```bash
cd backend
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm run start        # Start production server
npm run lint         # Run ESLint
npm test            # Run tests
```

The backend will be available at `http://localhost:3000`

### Database Management

```bash
cd backend
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Prisma Studio
```

## 📝 API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh access token

### Chat Endpoints

- `GET /api/chat/conversations` - Get user's conversations
- `POST /api/chat/conversations` - Create new conversation
- `GET /api/chat/conversations/:id` - Get conversation messages
- `POST /api/chat/conversations/:id/messages` - Send message

### WebSocket Events

- `connection` - Client connects
- `join_conversation` - Join conversation room
- `send_message` - Send message to conversation
- `message_received` - Receive new message
- `typing_start` - User starts typing
- `typing_stop` - User stops typing

## 🔒 Security Features

- **Helmet.js**: Security headers
- **CORS**: Cross-Origin Resource Sharing protection
- **Rate Limiting**: API endpoint protection
- **JWT Authentication**: Secure token-based auth
- **Input Validation**: Request validation middleware
- **SQL Injection Prevention**: Prisma ORM protection
- **XSS Protection**: Content Security Policy

## 🚀 Deployment

### Production Deployment Checklist

1. **Environment Variables**: Set all required environment variables
2. **Database**: Setup PostgreSQL with proper user permissions
3. **Redis**: Configure Redis for session storage
4. **SSL Certificate**: Setup SSL/TLS certificates
5. **Nginx**: Configure reverse proxy with proper security headers
6. **Process Manager**: Use PM2 for Node.js process management
7. **Monitoring**: Setup logging and monitoring
8. **Backup**: Configure database backups

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start backend with PM2
cd backend
npm run build
pm2 start dist/index.js --name "llm-webapp-backend"

# Setup PM2 startup script
pm2 startup
pm2 save
```

### Docker Deployment (Optional)

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build individual containers
docker build -t llm-webapp-frontend ./frontend
docker build -t llm-webapp-backend ./backend
```

## 📊 Monitoring and Logs

### Log Files

- **Application Logs**: `backend/logs/app.log`
- **Nginx Access**: `/var/log/nginx/llm-webapp-access.log`
- **Nginx Error**: `/var/log/nginx/llm-webapp-error.log`

### Health Check

Visit `http://your-domain.com/health` to check application status.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

1. Check the [Issues](https://github.com/your-repo/llm-webapp/issues) page
2. Create a new issue with detailed information
3. Refer to the documentation and configuration examples

## 🔄 Version History

- **v1.0.0** - Initial release with core chat functionality
- **v1.1.0** - Added multi-LLM support
- **v1.2.0** - Enhanced security and rate limiting
- **v1.3.0** - Improved UI/UX and performance optimizations

---

**Note**: Remember to update domain names, API keys, and other configuration values before deploying to production.
