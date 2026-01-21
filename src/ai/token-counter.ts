/**
 * Token counting utility for managing context windows
 * Supports multiple AI providers with different token limits
 */

export interface ModelContextLimits {
    maxTokens: number;
    maxOutputTokens: number;
    reservedTokens: number; // Reserve for system prompt and overhead
}

export interface TokenCount {
    inputTokens: number;
    outputTokens: number;
    total: number;
}

/**
 * Model context limits for supported providers
 * Based on official documentation as of January 2025
 */
export const MODEL_LIMITS: Record<string, ModelContextLimits> = {
    // Anthropic Claude models
    'claude-opus-4-5-20251101': {
        maxTokens: 200000,
        maxOutputTokens: 16384,
        reservedTokens: 5000
    },
    'claude-sonnet-4-20250514': {
        maxTokens: 200000,
        maxOutputTokens: 16384,
        reservedTokens: 5000
    },
    'claude-3-5-sonnet-20241022': {
        maxTokens: 200000,
        maxOutputTokens: 8192,
        reservedTokens: 5000
    },
    'claude-3-opus-20240229': {
        maxTokens: 200000,
        maxOutputTokens: 4096,
        reservedTokens: 5000
    },

    // OpenAI models
    'gpt-4-turbo': {
        maxTokens: 128000,
        maxOutputTokens: 4096,
        reservedTokens: 3000
    },
    'gpt-4': {
        maxTokens: 8192,
        maxOutputTokens: 4096,
        reservedTokens: 1000
    },
    'gpt-3.5-turbo': {
        maxTokens: 16385,
        maxOutputTokens: 4096,
        reservedTokens: 1000
    },
    'gpt-4o': {
        maxTokens: 128000,
        maxOutputTokens: 16384,
        reservedTokens: 3000
    },

    // Azure OpenAI (same limits as OpenAI)
    'azure-gpt-4': {
        maxTokens: 8192,
        maxOutputTokens: 4096,
        reservedTokens: 1000
    },
    'azure-gpt-35-turbo': {
        maxTokens: 16385,
        maxOutputTokens: 4096,
        reservedTokens: 1000
    },

    // DeepSeek models
    'deepseek-chat': {
        maxTokens: 64000,
        maxOutputTokens: 8192,
        reservedTokens: 2000
    },
    'deepseek-coder': {
        maxTokens: 64000,
        maxOutputTokens: 8192,
        reservedTokens: 2000
    },

    // Grok models
    'grok-beta': {
        maxTokens: 128000,
        maxOutputTokens: 4096,
        reservedTokens: 3000
    },

    // Default fallback
    'default': {
        maxTokens: 8192,
        maxOutputTokens: 4096,
        reservedTokens: 1000
    }
};

export class TokenCounter {
    /**
     * Estimate token count for text (simple approximation)
     * More accurate methods would use tiktoken or similar libraries
     * Rule of thumb: ~4 characters per token for English text
     */
    static estimateTokens(text: string): number {
        if (!text) return 0;

        // Remove extra whitespace
        const cleaned = text.trim().replace(/\s+/g, ' ');

        // Basic estimation: 1 token ≈ 4 characters
        // Add extra for special characters and formatting
        const baseCount = Math.ceil(cleaned.length / 4);

        // Account for punctuation and special characters (they often are separate tokens)
        const specialChars = (cleaned.match(/[^\w\s]/g) || []).length;

        return baseCount + Math.ceil(specialChars / 2);
    }

    /**
     * Count tokens in a message (including content blocks)
     */
    static countMessageTokens(message: any): number {
        let total = 0;

        // Role adds a few tokens
        total += 3;

        if (typeof message.content === 'string') {
            total += this.estimateTokens(message.content);
        } else if (Array.isArray(message.content)) {
            for (const block of message.content) {
                if (block.type === 'text' && block.text) {
                    total += this.estimateTokens(block.text);
                } else if (block.type === 'tool_use') {
                    // Tool use: name + input
                    total += this.estimateTokens(block.name || '');
                    total += this.estimateTokens(JSON.stringify(block.input || {}));
                    total += 10; // Overhead for tool_use structure
                } else if (block.type === 'tool_result') {
                    // Tool result: content
                    total += this.estimateTokens(block.content || '');
                    total += 10; // Overhead for tool_result structure
                }
            }
        }

        return total;
    }

    /**
     * Count tokens in conversation history
     */
    static countConversationTokens(messages: any[]): TokenCount {
        let inputTokens = 0;
        let outputTokens = 0;

        for (const message of messages) {
            const tokens = this.countMessageTokens(message);

            if (message.role === 'user') {
                inputTokens += tokens;
            } else if (message.role === 'assistant') {
                outputTokens += tokens;
            }
        }

        return {
            inputTokens,
            outputTokens,
            total: inputTokens + outputTokens
        };
    }

    /**
     * Get context limits for a model
     */
    static getModelLimits(modelId: string): ModelContextLimits {
        // Try exact match first
        if (MODEL_LIMITS[modelId]) {
            return MODEL_LIMITS[modelId];
        }

        // Try partial match (e.g., "gpt-4-0125-preview" matches "gpt-4")
        for (const key in MODEL_LIMITS) {
            if (modelId.startsWith(key) || key.startsWith(modelId)) {
                return MODEL_LIMITS[key];
            }
        }

        // Default fallback
        return MODEL_LIMITS['default'];
    }

    /**
     * Check if adding a message would exceed context window
     */
    static wouldExceedLimit(
        currentMessages: any[],
        newMessageText: string,
        modelId: string,
        maxOutputTokens: number = 4096
    ): { exceeds: boolean; currentTokens: number; estimatedTotal: number; limit: number } {
        const limits = this.getModelLimits(modelId);
        const currentCount = this.countConversationTokens(currentMessages);
        const newTokens = this.estimateTokens(newMessageText);

        const estimatedTotal = currentCount.total + newTokens + limits.reservedTokens + maxOutputTokens;
        const exceeds = estimatedTotal > limits.maxTokens;

        return {
            exceeds,
            currentTokens: currentCount.total,
            estimatedTotal,
            limit: limits.maxTokens
        };
    }

    /**
     * Trim conversation history to fit within context window
     * Uses sliding window approach - keeps recent messages and system prompt
     */
    static trimToFit(
        messages: any[],
        modelId: string,
        maxOutputTokens: number = 4096
    ): { trimmedMessages: any[]; removedCount: number } {
        const limits = this.getModelLimits(modelId);
        const targetTokens = limits.maxTokens - limits.reservedTokens - maxOutputTokens;

        // Always keep first message if it's a system prompt
        const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
        const conversationMessages = systemMessage ? messages.slice(1) : messages;

        // Start from the end and work backwards
        const kept: any[] = [];
        let currentTokens = systemMessage ? this.countMessageTokens(systemMessage) : 0;

        for (let i = conversationMessages.length - 1; i >= 0; i--) {
            const message = conversationMessages[i];
            const messageTokens = this.countMessageTokens(message);

            if (currentTokens + messageTokens <= targetTokens) {
                kept.unshift(message);
                currentTokens += messageTokens;
            } else {
                // Can't fit any more messages
                break;
            }
        }

        const trimmedMessages = systemMessage ? [systemMessage, ...kept] : kept;
        const removedCount = messages.length - trimmedMessages.length;

        return { trimmedMessages, removedCount };
    }

    /**
     * Summarize old messages to compress context
     * This creates a summary of the oldest messages
     */
    static createSummary(messages: any[]): string {
        if (messages.length === 0) return '';

        const summaryPoints: string[] = [];

        for (const message of messages) {
            if (message.role === 'user') {
                const content = typeof message.content === 'string'
                    ? message.content
                    : message.content.find((b: any) => b.type === 'text')?.text || '';

                if (content) {
                    // Extract first sentence or 100 characters
                    const firstSentence = content.split(/[.!?]/)[0].trim();
                    if (firstSentence) {
                        summaryPoints.push(`User: ${firstSentence}`);
                    }
                }
            } else if (message.role === 'assistant') {
                const content = typeof message.content === 'string'
                    ? message.content
                    : message.content.find((b: any) => b.type === 'text')?.text || '';

                if (content) {
                    const firstSentence = content.split(/[.!?]/)[0].trim();
                    if (firstSentence) {
                        summaryPoints.push(`Assistant: ${firstSentence}`);
                    }
                }
            }
        }

        return `Previous conversation summary:\n${summaryPoints.join('\n')}`;
    }
}
