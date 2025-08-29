export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
}
export declare class DatabaseService {
    private config;
    private isConnected;
    constructor();
    /**
     * Connect to the database
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the database
     */
    disconnect(): Promise<void>;
    /**
     * Check if database is connected
     */
    isReady(): boolean;
    /**
     * Health check
     */
    healthCheck(): Promise<boolean>;
    /**
     * Execute a query (placeholder)
     */
    query(sql: string, params?: any[]): Promise<any>;
    /**
     * Begin transaction
     */
    beginTransaction(): Promise<void>;
    /**
     * Commit transaction
     */
    commitTransaction(): Promise<void>;
    /**
     * Rollback transaction
     */
    rollbackTransaction(): Promise<void>;
}
