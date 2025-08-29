import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

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

export class LLMService {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private readonly defaultMaxTokens = 4000;
  private readonly contextWindowLimit = 10; // Last 10 messages

  constructor() {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    // Only initialize clients if API keys are provided
    if (openaiKey && openaiKey !== 'sk-test-key-placeholder') {
      this.openai = new OpenAI({
        apiKey: openaiKey,
      });
      logger.info('OpenAI client initialized');
    } else {
      logger.warn('OpenAI API key not configured - OpenAI models will not be available');
    }

    if (anthropicKey && anthropicKey !== 'sk-ant-test-key-placeholder') {
      this.anthropic = new Anthropic({
        apiKey: anthropicKey,
      });
      logger.info('Anthropic client initialized');
    } else {
      logger.warn('Anthropic API key not configured - Claude models will not be available');
    }
  }

  /**
   * Generate response from the specified LLM
   */
  async generateResponse(options: GenerateOptions): Promise<LLMResponse> {
    const { message, model, context, userId, sessionId, stream = false, onChunk } = options;

    try {
      // Generate session ID if not provided
      const finalSessionId = sessionId || this.generateSessionId(userId);

      // Prepare conversation context with token limit management
      const conversation = this.prepareContext(context, message);

      // Route to appropriate LLM provider
      if (this.isOpenAIModel(model)) {
        if (!this.openai) {
          throw new Error('OpenAI client not initialized. Please configure OPENAI_API_KEY.');
        }
        return await this.generateOpenAIResponse({
          conversation,
          model,
          sessionId: finalSessionId,
          stream,
          onChunk: onChunk || undefined
        });
      } else if (this.isAnthropicModel(model)) {
        if (!this.anthropic) {
          throw new Error('Anthropic client not initialized. Please configure ANTHROPIC_API_KEY.');
        }
        return await this.generateAnthropicResponse({
          conversation,
          model,
          sessionId: finalSessionId,
          stream,
          onChunk: onChunk || undefined
        });
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }
    } catch (error) {
      logger.error(`Error generating response with ${model}:`, error);
      throw error;
    }
  }

  /**
   * Generate response using OpenAI API
   */
  private async generateOpenAIResponse(params: {
    conversation: ChatMessage[];
    model: string;
    sessionId: string;
    stream: boolean;
    onChunk?: (chunk: string) => void;
  }): Promise<LLMResponse> {
    const { conversation, model, sessionId, stream, onChunk } = params;

    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const messages = conversation.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      }));

      if (stream && onChunk) {
        // Streaming response
        const stream = await this.openai.chat.completions.create({
          model: model,
          messages: messages,
          max_tokens: this.getMaxTokensForModel(model),
          temperature: 0.7,
          stream: true,
        });

        let fullContent = '';
        let tokensUsed = 0;

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            onChunk(content);
          }
          // Estimate tokens (rough approximation)
          tokensUsed += Math.ceil(content.length / 4);
        }

        return {
          content: fullContent,
          model,
          tokensUsed,
          sessionId,
          finishReason: 'stop'
        };
      } else {
        // Non-streaming response
        const response = await this.openai.chat.completions.create({
          model: model,
          messages: messages,
          max_tokens: this.getMaxTokensForModel(model),
          temperature: 0.7,
        });

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          throw new Error('No response content from OpenAI');
        }

        return {
          content: choice.message.content,
          model,
          tokensUsed: response.usage?.total_tokens || 0,
          sessionId,
          finishReason: choice.finish_reason || 'stop'
        };
      }
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate response using Anthropic Claude API
   */
  private async generateAnthropicResponse(params: {
    conversation: ChatMessage[];
    model: string;
    sessionId: string;
    stream: boolean;
    onChunk?: (chunk: string) => void;
  }): Promise<LLMResponse> {
    const { conversation, model, sessionId, stream, onChunk } = params;

    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    try {
      // Convert conversation to Anthropic format
      const messages = conversation
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      const systemMessage = conversation.find(msg => msg.role === 'system')?.content || '';

      if (stream && onChunk) {
        // Streaming response
        const stream = await this.anthropic.messages.create({
          model: this.mapToAnthropicModel(model),
          max_tokens: this.getMaxTokensForModel(model),
          temperature: 0.7,
          system: systemMessage,
          messages: messages,
          stream: true,
        });

        let fullContent = '';
        let tokensUsed = 0;

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const content = chunk.delta.text;
            fullContent += content;
            onChunk(content);
            tokensUsed += Math.ceil(content.length / 4);
          }
        }

        return {
          content: fullContent,
          model,
          tokensUsed,
          sessionId,
          finishReason: 'stop'
        };
      } else {
        // Non-streaming response
        const response = await this.anthropic.messages.create({
          model: this.mapToAnthropicModel(model),
          max_tokens: this.getMaxTokensForModel(model),
          temperature: 0.7,
          system: systemMessage,
          messages: messages,
        });

        const content = response.content
          .filter(block => block.type === 'text')
          .map(block => (block as any).text)
          .join('');

        return {
          content,
          model,
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          sessionId,
          finishReason: response.stop_reason || 'stop'
        };
      }
    } catch (error) {
      logger.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [
      // OpenAI Models
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        description: 'Fast and efficient model for most conversational tasks',
        contextWindow: 4096,
        maxTokens: 4096,
        costPer1kTokens: 0.002,
        capabilities: ['text-generation', 'conversation', 'code-assistance']
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        description: 'Most capable GPT model for complex reasoning and analysis',
        contextWindow: 8192,
        maxTokens: 8192,
        costPer1kTokens: 0.03,
        capabilities: ['text-generation', 'conversation', 'code-assistance', 'reasoning', 'analysis']
      },
      {
        id: 'gpt-4-turbo-preview',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        description: 'Latest GPT-4 model with improved performance and larger context window',
        contextWindow: 128000,
        maxTokens: 4096,
        costPer1kTokens: 0.01,
        capabilities: ['text-generation', 'conversation', 'code-assistance', 'reasoning', 'analysis', 'long-context']
      },
      // Anthropic Models
      {
        id: 'claude-3-haiku',
        name: 'Claude 3 Haiku',
        provider: 'anthropic',
        description: 'Fast and efficient Claude model for everyday tasks',
        contextWindow: 200000,
        maxTokens: 4096,
        costPer1kTokens: 0.00025,
        capabilities: ['text-generation', 'conversation', 'analysis', 'long-context']
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'anthropic',
        description: 'Balanced Claude model with strong performance across tasks',
        contextWindow: 200000,
        maxTokens: 4096,
        costPer1kTokens: 0.003,
        capabilities: ['text-generation', 'conversation', 'reasoning', 'analysis', 'long-context']
      },
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        description: 'Most capable Claude model for complex reasoning and creative tasks',
        contextWindow: 200000,
        maxTokens: 4096,
        costPer1kTokens: 0.015,
        capabilities: ['text-generation', 'conversation', 'reasoning', 'analysis', 'creativity', 'long-context']
      }
    ];

    // Filter models based on available API keys
    const availableModels = models.filter(model => {
      if (model.provider === 'openai') {
        return !!process.env.OPENAI_API_KEY;
      } else if (model.provider === 'anthropic') {
        return !!process.env.ANTHROPIC_API_KEY;
      }
      return false;
    });

    return availableModels;
  }

  /**
   * Prepare conversation context with token management
   */
  private prepareContext(context: ChatMessage[], newMessage: string): ChatMessage[] {
    // Start with system message if needed
    const conversation: ChatMessage[] = [];
    
    // Add system message for context
    conversation.push({
      role: 'system',
      content: 'You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user questions.'
    });

    // Add limited context (last N messages to fit within context window)
    const limitedContext = context.slice(-this.contextWindowLimit);
    conversation.push(...limitedContext);

    // Add new user message
    conversation.push({
      role: 'user',
      content: newMessage
    });

    return conversation;
  }

  /**
   * Check if model is from OpenAI
   */
  private isOpenAIModel(model: string): boolean {
    return model.startsWith('gpt-');
  }

  /**
   * Check if model is from Anthropic
   */
  private isAnthropicModel(model: string): boolean {
    return model.startsWith('claude-');
  }

  /**
   * Map our model names to Anthropic model names
   */
  private mapToAnthropicModel(model: string): string {
    const mapping: Record<string, string> = {
      'claude-3-haiku': 'claude-3-haiku-20240307',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
      'claude-3-opus': 'claude-3-opus-20240229'
    };
    return mapping[model] || model;
  }

  /**
   * Get max tokens for model
   */
  private getMaxTokensForModel(model: string): number {
    const limits: Record<string, number> = {
      'gpt-3.5-turbo': 4096,
      'gpt-4': 8192,
      'gpt-4-turbo-preview': 4096,
      'claude-3-haiku': 4096,
      'claude-3-sonnet': 4096,
      'claude-3-opus': 4096
    };
    return limits[model] || this.defaultMaxTokens;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${userId}_${timestamp}_${random}`;
  }

  /**
   * Count tokens in text (approximate)
   */
  countTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate model availability
   */
  async validateModel(model: string): Promise<boolean> {
    const availableModels = await this.getAvailableModels();
    return availableModels.some(m => m.id === model);
  }
}
