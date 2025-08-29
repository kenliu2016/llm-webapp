import { logger } from '../utils/logger.js';
// import { authService } from '../middleware/auth.js';
// Mock auth service for compilation
const authService = {
    validateToken: async (token) => {
        // Mock implementation
        return token ? { id: 'mock-user', username: 'mock' } : null;
    },
    createGuestSession: async () => {
        return { id: 'guest-session', userId: 'guest' };
    },
    verifyAccessToken: (token) => {
        return token ? {
            userId: 'mock-user',
            username: 'mock',
            email: 'mock@example.com',
            role: 'user',
            isGuest: false
        } : null;
    }
};
export class SocketService {
    constructor(io) {
        this.connectedUsers = new Map();
        this.userSockets = new Map();
        this.io = io;
        this.setupMiddleware();
    }
    /**
     * Setup Socket.IO middleware
     */
    setupMiddleware() {
        // Authentication middleware for Socket.IO
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
                if (!token) {
                    // Allow connection for guest users
                    const guestSession = await authService.createGuestSession();
                    socket.data.user = {
                        id: guestSession.userId,
                        isGuest: true,
                        role: 'guest'
                    };
                    return next();
                }
                const payload = authService.verifyAccessToken(token);
                if (!payload) {
                    return next(new Error('Invalid authentication token'));
                }
                socket.data.user = {
                    id: payload.userId,
                    email: payload.email,
                    role: payload.role || 'user',
                    isGuest: payload.isGuest || false
                };
                next();
            }
            catch (error) {
                logger.error('Socket authentication error:', error);
                next(new Error('Authentication failed'));
            }
        });
    }
    /**
     * Handle new socket connection
     */
    handleConnection(socket) {
        const user = socket.data.user;
        const userId = user.id;
        // Track connected users
        this.connectedUsers.set(socket.id, socket);
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId).add(socket.id);
        logger.info(`User connected via Socket.IO: ${userId} (${socket.id})`);
        // Join user to their personal room
        socket.join(`user:${userId}`);
        // Handle chat events
        this.setupChatEvents(socket);
        // Handle disconnection
        socket.on('disconnect', () => {
            this.handleDisconnection(socket);
        });
        // Send welcome message
        socket.emit('connection_established', {
            message: 'Connected to chat server',
            userId,
            timestamp: new Date().toISOString()
        });
    }
    /**
     * Setup chat-related socket events
     */
    setupChatEvents(socket) {
        const user = socket.data.user;
        // Join conversation room
        socket.on('join_conversation', (data) => {
            const { conversationId } = data;
            socket.join(`conversation:${conversationId}`);
            logger.debug(`User ${user.id} joined conversation: ${conversationId}`);
            socket.emit('conversation_joined', {
                conversationId,
                timestamp: new Date().toISOString()
            });
        });
        // Leave conversation room
        socket.on('leave_conversation', (data) => {
            const { conversationId } = data;
            socket.leave(`conversation:${conversationId}`);
            logger.debug(`User ${user.id} left conversation: ${conversationId}`);
        });
        // Handle typing indicators
        socket.on('typing_start', (data) => {
            const { conversationId } = data;
            socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId: user.id,
                isTyping: true,
                timestamp: new Date().toISOString()
            });
        });
        socket.on('typing_stop', (data) => {
            const { conversationId } = data;
            socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId: user.id,
                isTyping: false,
                timestamp: new Date().toISOString()
            });
        });
        // Handle message events
        socket.on('message_sent', (data) => {
            const { conversationId, message, timestamp } = data;
            // Broadcast message to other users in the conversation
            socket.to(`conversation:${conversationId}`).emit('new_message', {
                userId: user.id,
                message,
                timestamp,
                conversationId
            });
            logger.debug(`Message sent by ${user.id} in conversation ${conversationId}`);
        });
        // Handle message reactions
        socket.on('message_reaction', (data) => {
            const { messageId, reaction, conversationId } = data;
            socket.to(`conversation:${conversationId}`).emit('message_reacted', {
                messageId,
                reaction,
                userId: user.id,
                timestamp: new Date().toISOString()
            });
        });
        // Handle read receipts
        socket.on('mark_read', (data) => {
            const { conversationId, messageId } = data;
            socket.to(`conversation:${conversationId}`).emit('message_read', {
                messageId,
                userId: user.id,
                timestamp: new Date().toISOString()
            });
        });
    }
    /**
     * Handle socket disconnection
     */
    handleDisconnection(socket) {
        const user = socket.data.user;
        const userId = user?.id;
        if (userId) {
            const userSocketSet = this.userSockets.get(userId);
            if (userSocketSet) {
                userSocketSet.delete(socket.id);
                if (userSocketSet.size === 0) {
                    this.userSockets.delete(userId);
                }
            }
        }
        this.connectedUsers.delete(socket.id);
        logger.info(`User disconnected from Socket.IO: ${userId} (${socket.id})`);
    }
    /**
     * Send message to specific user
     */
    sendToUser(userId, event, data) {
        this.io.to(`user:${userId}`).emit(event, data);
    }
    /**
     * Send message to conversation
     */
    sendToConversation(conversationId, event, data) {
        this.io.to(`conversation:${conversationId}`).emit(event, data);
    }
    /**
     * Broadcast message to all connected users
     */
    broadcast(event, data) {
        this.io.emit(event, data);
    }
    /**
     * Send LLM response stream to user
     */
    streamResponseToUser(userId, data) {
        this.sendToUser(userId, 'llm_response_stream', {
            ...data,
            timestamp: new Date().toISOString()
        });
    }
    /**
     * Notify conversation about new message
     */
    notifyNewMessage(conversationId, message) {
        this.sendToConversation(conversationId, 'message_received', message);
    }
    /**
     * Get connected users count
     */
    getConnectedUsersCount() {
        return this.connectedUsers.size;
    }
    /**
     * Get user's active connections
     */
    getUserConnections(userId) {
        return this.userSockets.get(userId)?.size || 0;
    }
    /**
     * Check if user is online
     */
    isUserOnline(userId) {
        return this.userSockets.has(userId);
    }
    /**
     * Disconnect user
     */
    disconnectUser(userId, reason) {
        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
            userSocketSet.forEach(socketId => {
                const socket = this.connectedUsers.get(socketId);
                if (socket) {
                    socket.emit('force_disconnect', { reason: reason || 'Disconnected by server' });
                    socket.disconnect(true);
                }
            });
        }
    }
    /**
     * Send system notification
     */
    sendSystemNotification(userId, notification) {
        this.sendToUser(userId, 'system_notification', {
            ...notification,
            timestamp: new Date().toISOString()
        });
    }
}
//# sourceMappingURL=socketService.js.map