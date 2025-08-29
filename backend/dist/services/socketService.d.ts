import { Server, Socket } from 'socket.io';
export interface SocketUser {
    id: string;
    email?: string;
    role?: string;
    isGuest?: boolean;
}
export declare class SocketService {
    private io;
    private connectedUsers;
    private userSockets;
    constructor(io: Server);
    /**
     * Setup Socket.IO middleware
     */
    private setupMiddleware;
    /**
     * Handle new socket connection
     */
    handleConnection(socket: Socket): void;
    /**
     * Setup chat-related socket events
     */
    private setupChatEvents;
    /**
     * Handle socket disconnection
     */
    private handleDisconnection;
    /**
     * Send message to specific user
     */
    sendToUser(userId: string, event: string, data: any): void;
    /**
     * Send message to conversation
     */
    sendToConversation(conversationId: string, event: string, data: any): void;
    /**
     * Broadcast message to all connected users
     */
    broadcast(event: string, data: any): void;
    /**
     * Send LLM response stream to user
     */
    streamResponseToUser(userId: string, data: {
        conversationId: string;
        chunk?: string;
        done?: boolean;
        error?: string;
    }): void;
    /**
     * Notify conversation about new message
     */
    notifyNewMessage(conversationId: string, message: {
        id: string;
        content: string;
        role: 'user' | 'assistant';
        userId: string;
        timestamp: string;
    }): void;
    /**
     * Get connected users count
     */
    getConnectedUsersCount(): number;
    /**
     * Get user's active connections
     */
    getUserConnections(userId: string): number;
    /**
     * Check if user is online
     */
    isUserOnline(userId: string): boolean;
    /**
     * Disconnect user
     */
    disconnectUser(userId: string, reason?: string): void;
    /**
     * Send system notification
     */
    sendSystemNotification(userId: string, notification: {
        type: 'info' | 'warning' | 'error' | 'success';
        title: string;
        message: string;
    }): void;
}
