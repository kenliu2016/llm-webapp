export interface SessionData {
    userId: string;
    email?: string;
    role?: string;
    isGuest?: boolean;
    createdAt: string;
    lastActivity: string;
    [key: string]: any;
}
export declare class RedisService {
    private client;
    private isConnected;
    private maxRetries;
    private retryDelay;
    private connectionOptions;
    constructor();
    /**
     * Connect to Redis with retry mechanism
     */
    connect(): Promise<void>;
    /**
     * Log Redis server information
     */
    private logRedisInfo;
    /**
     * Disconnect from Redis
     */
    disconnect(): Promise<void>;
    /**
     * Check if Redis is connected
     */
    isReady(): boolean;
    /**
     * Set session data
     */
    setSession(sessionId: string, data: SessionData, expirationSeconds?: number): Promise<void>;
    /**
     * Get session data
     */
    getSession(sessionId: string): Promise<SessionData | null>;
    /**
     * Delete session
     */
    deleteSession(sessionId: string): Promise<boolean>;
    /**
     * Extend session expiration
     */
    extendSession(sessionId: string, expirationSeconds?: number): Promise<boolean>;
    /**
     * Get all sessions for a user
     */
    getUserSessions(userId: string): Promise<string[]>;
    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions(): Promise<number>;
    /**
     * Store rate limiting data
     */
    setRateLimit(key: string, value: number, windowSeconds: number): Promise<void>;
    /**
     * Get rate limiting data
     */
    getRateLimit(key: string): Promise<number | null>;
    /**
     * Increment rate limiting counter
     */
    incrementRateLimit(key: string, windowSeconds: number): Promise<number>;
    /**
     * Cache chat history
     */
    setChatHistory(userId: string, sessionId: string, messages: any[], expirationSeconds?: number): Promise<void>;
    /**
     * Get cached chat history
     */
    getChatHistory(userId: string, sessionId: string): Promise<any[] | null>;
    /**
     * Store temporary data
     */
    setTempData(key: string, data: any, expirationSeconds?: number): Promise<void>;
    /**
     * Get temporary data
     */
    getTempData(key: string): Promise<any | null>;
    /**
     * Health check
     */
    healthCheck(): Promise<boolean>;
}
