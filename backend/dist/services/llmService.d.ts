export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: string;
    tokensUsed?: number;
    timestamp?: Date;
}
export interface LLMResponse {
    content: string;
    model: string;
    tokensUsed: number;
    sessionId: string;
    finishReason?: string;
}
export interface ModelInfo {
    id: string;
    name: string;
    provider: 'openai' | 'anthropic';
    description: string;
    contextWindow: number;
    maxTokens: number;
    costPer1kTokens: number;
    capabilities: string[];
}
export interface GenerateOptions {
    message: string;
    model: string;
    context: ChatMessage[];
    userId: string;
    sessionId?: string;
    stream?: boolean;
    onChunk?: (chunk: string) => void;
}
export declare class LLMService {
    private openai?;
    private anthropic?;
    private readonly defaultMaxTokens;
    private readonly contextWindowLimit;
    constructor();
    /**
     * Generate response from the specified LLM
     */
    generateResponse(options: GenerateOptions): Promise<LLMResponse>;
    /**
     * Generate response using OpenAI API
     */
    private generateOpenAIResponse;
    /**
     * Generate response using Anthropic Claude API
     */
    private generateAnthropicResponse;
    /**
     * Get available models
     */
    getAvailableModels(): Promise<ModelInfo[]>;
    /**
     * Prepare conversation context with token management
     */
    private prepareContext;
    /**
     * Check if model is from OpenAI
     */
    private isOpenAIModel;
    /**
     * Check if model is from Anthropic
     */
    private isAnthropicModel;
    /**
     * Map our model names to Anthropic model names
     */
    private mapToAnthropicModel;
    /**
     * Get max tokens for model
     */
    private getMaxTokensForModel;
    /**
     * Generate session ID
     */
    private generateSessionId;
    /**
     * Count tokens in text (approximate)
     */
    countTokens(text: string): number;
    /**
     * Validate model availability
     */
    validateModel(model: string): Promise<boolean>;
}
