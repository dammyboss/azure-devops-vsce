import { TokenCounter, TokenCount } from './token-counter';

export interface ContextWindow {
    messages: any[];
    tokenCount: TokenCount;
    isTruncated: boolean;
    removedCount: number;
}

/**
 * Manages conversation context window
 * Handles token counting, trimming, and summarization
 */
export class ContextManager {
    private messages: any[] = [];
    private modelId: string = 'default';
    private maxOutputTokens: number = 4096;

    constructor(modelId?: string) {
        if (modelId) {
            this.modelId = modelId;
        }
    }

    /**
     * Update the model ID (for context limit calculations)
     */
    setModel(modelId: string): void {
        this.modelId = modelId;
    }

    /**
     * Set max output tokens
     */
    setMaxOutputTokens(tokens: number): void {
        this.maxOutputTokens = tokens;
    }

    /**
     * Add a message to the context
     */
    addMessage(message: any): void {
        this.messages.push(message);
    }

    /**
     * Get all messages
     */
    getMessages(): any[] {
        return [...this.messages];
    }

    /**
     * Clear all messages
     */
    clear(): void {
        this.messages = [];
    }

    /**
     * Get current token count
     */
    getTokenCount(): TokenCount {
        return TokenCounter.countConversationTokens(this.messages);
    }

    /**
     * Check if adding new text would exceed limits
     */
    wouldExceedLimit(newText: string): boolean {
        const check = TokenCounter.wouldExceedLimit(
            this.messages,
            newText,
            this.modelId,
            this.maxOutputTokens
        );
        return check.exceeds;
    }

    /**
     * Get context limits info
     */
    getLimitsInfo(): {
        currentTokens: number;
        maxTokens: number;
        percentUsed: number;
        canAccommodate: (text: string) => boolean;
    } {
        const limits = TokenCounter.getModelLimits(this.modelId);
        const current = this.getTokenCount();

        return {
            currentTokens: current.total,
            maxTokens: limits.maxTokens,
            percentUsed: (current.total / limits.maxTokens) * 100,
            canAccommodate: (text: string) => !this.wouldExceedLimit(text)
        };
    }

    /**
     * Get messages suitable for API call (trimmed if necessary)
     */
    getContextWindow(): ContextWindow {
        const result = TokenCounter.trimToFit(
            this.messages,
            this.modelId,
            this.maxOutputTokens
        );

        const tokenCount = TokenCounter.countConversationTokens(result.trimmedMessages);

        return {
            messages: result.trimmedMessages,
            tokenCount,
            isTruncated: result.removedCount > 0,
            removedCount: result.removedCount
        };
    }

    /**
     * Automatically trim if needed
     */
    autoTrim(): { trimmed: boolean; removedCount: number } {
        const check = TokenCounter.wouldExceedLimit(
            this.messages,
            '', // Empty string - just checking current state
            this.modelId,
            this.maxOutputTokens
        );

        if (check.exceeds) {
            const result = TokenCounter.trimToFit(
                this.messages,
                this.modelId,
                this.maxOutputTokens
            );

            this.messages = result.trimmedMessages;

            return {
                trimmed: true,
                removedCount: result.removedCount
            };
        }

        return {
            trimmed: false,
            removedCount: 0
        };
    }

    /**
     * Summarize oldest messages and replace them with summary
     */
    summarizeOldest(count: number): void {
        if (count >= this.messages.length) {
            return;
        }

        const toSummarize = this.messages.slice(0, count);
        const remaining = this.messages.slice(count);

        const summary = TokenCounter.createSummary(toSummarize);

        // Replace oldest messages with summary message
        this.messages = [
            {
                role: 'user',
                content: summary
            },
            ...remaining
        ];
    }

    /**
     * Get statistics about the context
     */
    getStats(): {
        totalMessages: number;
        userMessages: number;
        assistantMessages: number;
        tokenCount: TokenCount;
        percentOfLimit: number;
    } {
        const tokenCount = this.getTokenCount();
        const limits = TokenCounter.getModelLimits(this.modelId);

        let userMessages = 0;
        let assistantMessages = 0;

        for (const message of this.messages) {
            if (message.role === 'user') {
                userMessages++;
            } else if (message.role === 'assistant') {
                assistantMessages++;
            }
        }

        return {
            totalMessages: this.messages.length,
            userMessages,
            assistantMessages,
            tokenCount,
            percentOfLimit: (tokenCount.total / limits.maxTokens) * 100
        };
    }
}
