export interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: string;
    tokensUsed?: number;
    timestamp: Date;
    metadata?: any;
}
export interface ChatSession {
    id: string;
    userId: string;
    title?: string;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
    lastMessage?: string;
}
export interface ChatHistoryResult {
    messages: ChatMessage[];
    total: number;
}
export interface SessionsResult {
    sessions: ChatSession[];
    total: number;
}
export declare class ChatHistoryService {
    private redis;
    private db;
    constructor();
    /**
     * Save a message to chat history
     */
    saveMessage(userId: string, sessionId: string, message: Omit<ChatMessage, 'id'>): Promise<ChatMessage>;
    /**
     * Get chat history for a user/session
     */
    getChatHistory(userId: string, sessionId?: string, limit?: number, offset?: number): Promise<ChatHistoryResult>;
    /**
     * Get context messages for LLM (last N messages)
     */
    getContextMessages(userId: string, sessionId?: string, limit?: number): Promise<ChatMessage[]>;
    /**
     * Clear a chat session
     */
    clearSession(userId: string, sessionId: string): Promise<boolean>;
    /**
     * Get user's chat sessions
     */
    getUserSessions(userId: string, limit?: number, offset?: number): Promise<SessionsResult>;
    /**
     * Create a new chat session
     */
    createSession(userId: string, title?: string): Promise<ChatSession>;
    /**
     * Update session title
     */
    updateSessionTitle(userId: string, sessionId: string, title: string): Promise<boolean>;
    /**
     * Get session statistics
     */
    getSessionStats(userId: string, sessionId: string): Promise<{
        messageCount: number;
        tokensUsed: number;
        duration: number;
    }>;
    private saveMessageToDatabase;
    private getChatHistoryFromDatabase;
    private clearSessionFromDatabase;
    private getUserSessionsFromDatabase;
    private saveSessionToDatabase;
    private updateSessionInDatabase;
    private getSessionStatsFromDatabase;
    private cacheRecentMessages;
    private generateMessageId;
    private generateSessionId;
    /**
     * Clean up old chat history
     */
    cleanupOldHistory(daysToKeep?: number): Promise<number>;
    /**
     * Search chat history
     */
    searchHistory(userId: string, query: string, limit?: number): Promise<ChatMessage[]>;
}
