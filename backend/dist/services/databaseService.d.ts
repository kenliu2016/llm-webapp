import pg from 'pg';
export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    poolSize?: number;
    ssl?: boolean;
}
export declare class DatabaseService {
    private config;
    private pool;
    private isConnected;
    private maxRetries;
    private retryDelay;
    private healthCheckRetryInterval;
    constructor();
    /**
     * Connect to the database with retry mechanism
     */
    connect(): Promise<void>;
    /**
     * Log pool statistics periodically
     */
    private logPoolStats;
    /**
     * Disconnect from the database
     */
    disconnect(): Promise<void>;
    /**
     * Check if database is connected
     */
    isReady(): boolean;
    /**
     * Health check - simplified for stability in development environment
     */
    healthCheck(): Promise<boolean>;
    /**
     * Execute a query
     */
    query(sql: string, params?: any[]): Promise<any>;
    /**
     * Get a client from the pool
     */
    getClient(): Promise<pg.PoolClient>;
    /**
     * Execute a transaction
     */
    transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
    /**
     * Get pool statistics
     */
    getPoolStats(): any;
}
