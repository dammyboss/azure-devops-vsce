/**
 * Enhanced Error Handler
 * Categorizes errors and provides retry logic with exponential backoff
 */

export enum ErrorCategory {
    Authentication = 'authentication',
    Network = 'network',
    Tool = 'tool',
    API = 'api',
    RateLimit = 'rate_limit',
    Timeout = 'timeout',
    Validation = 'validation',
    Unknown = 'unknown'
}

export interface CategorizedError {
    category: ErrorCategory;
    message: string;
    originalError: any;
    isRetryable: boolean;
    userMessage: string;
    technicalDetails?: string;
}

export interface RetryConfig {
    maxRetries: number;
    baseDelay: number; // milliseconds
    maxDelay: number; // milliseconds
    backoffMultiplier: number;
}

export class ErrorHandler {
    private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
    };

    /**
     * Categorize an error
     */
    static categorize(error: any): CategorizedError {
        const errorMessage = error?.message || String(error);
        const errorString = errorMessage.toLowerCase();

        // Authentication errors
        if (this.isAuthError(errorString)) {
            return {
                category: ErrorCategory.Authentication,
                message: errorMessage,
                originalError: error,
                isRetryable: false,
                userMessage: '🔐 Authentication failed. Please check your API key in settings.',
                technicalDetails: errorMessage
            };
        }

        // Rate limit errors
        if (this.isRateLimitError(errorString)) {
            return {
                category: ErrorCategory.RateLimit,
                message: errorMessage,
                originalError: error,
                isRetryable: true,
                userMessage: '⏱️ Rate limit reached. Will retry automatically.',
                technicalDetails: errorMessage
            };
        }

        // Network errors
        if (this.isNetworkError(errorString)) {
            return {
                category: ErrorCategory.Network,
                message: errorMessage,
                originalError: error,
                isRetryable: true,
                userMessage: '🌐 Network error. Check your internet connection. Will retry automatically.',
                technicalDetails: errorMessage
            };
        }

        // Timeout errors
        if (this.isTimeoutError(errorString)) {
            return {
                category: ErrorCategory.Timeout,
                message: errorMessage,
                originalError: error,
                isRetryable: true,
                userMessage: '⏰ Request timed out. Will retry with a shorter message if needed.',
                technicalDetails: errorMessage
            };
        }

        // Tool execution errors
        if (this.isToolError(errorString)) {
            return {
                category: ErrorCategory.Tool,
                message: errorMessage,
                originalError: error,
                isRetryable: false,
                userMessage: '🔧 Tool execution failed. Check tool input parameters.',
                technicalDetails: errorMessage
            };
        }

        // Validation errors
        if (this.isValidationError(errorString)) {
            return {
                category: ErrorCategory.Validation,
                message: errorMessage,
                originalError: error,
                isRetryable: false,
                userMessage: '✅ Validation failed. Check your input.',
                technicalDetails: errorMessage
            };
        }

        // API errors
        if (this.isAPIError(errorString)) {
            return {
                category: ErrorCategory.API,
                message: errorMessage,
                originalError: error,
                isRetryable: false,
                userMessage: '🔌 API error. The AI service encountered an issue.',
                technicalDetails: errorMessage
            };
        }

        // Unknown errors
        return {
            category: ErrorCategory.Unknown,
            message: errorMessage,
            originalError: error,
            isRetryable: false,
            userMessage: `❌ An error occurred: ${errorMessage}`,
            technicalDetails: errorMessage
        };
    }

    /**
     * Check if error is authentication-related
     */
    private static isAuthError(errorString: string): boolean {
        return errorString.includes('401') ||
               errorString.includes('unauthorized') ||
               errorString.includes('authentication') ||
               errorString.includes('api key') ||
               errorString.includes('invalid key') ||
               errorString.includes('forbidden') ||
               errorString.includes('403');
    }

    /**
     * Check if error is rate limit
     */
    private static isRateLimitError(errorString: string): boolean {
        return errorString.includes('429') ||
               errorString.includes('rate limit') ||
               errorString.includes('too many requests') ||
               errorString.includes('quota exceeded');
    }

    /**
     * Check if error is network-related
     */
    private static isNetworkError(errorString: string): boolean {
        return errorString.includes('network') ||
               errorString.includes('econnrefused') ||
               errorString.includes('enotfound') ||
               errorString.includes('econnreset') ||
               errorString.includes('etimedout') ||
               errorString.includes('socket') ||
               errorString.includes('fetch failed') ||
               errorString.includes('failed to fetch');
    }

    /**
     * Check if error is timeout
     */
    private static isTimeoutError(errorString: string): boolean {
        return errorString.includes('timeout') ||
               errorString.includes('timed out') ||
               errorString.includes('time out');
    }

    /**
     * Check if error is tool-related
     */
    private static isToolError(errorString: string): boolean {
        return errorString.includes('tool') ||
               errorString.includes('mcp') ||
               errorString.includes('function call');
    }

    /**
     * Check if error is validation-related
     */
    private static isValidationError(errorString: string): boolean {
        return errorString.includes('validation') ||
               errorString.includes('invalid input') ||
               errorString.includes('schema') ||
               errorString.includes('required property');
    }

    /**
     * Check if error is API-related
     */
    private static isAPIError(errorString: string): boolean {
        return errorString.includes('400') ||
               errorString.includes('500') ||
               errorString.includes('502') ||
               errorString.includes('503') ||
               errorString.includes('504') ||
               errorString.includes('bad request') ||
               errorString.includes('internal server error') ||
               errorString.includes('service unavailable');
    }

    /**
     * Execute function with retry logic
     */
    static async withRetry<T>(
        fn: () => Promise<T>,
        config: Partial<RetryConfig> = {},
        onRetry?: (attempt: number, error: CategorizedError) => void
    ): Promise<T> {
        const retryConfig: RetryConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
        let lastError: CategorizedError | null = null;

        for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = this.categorize(error);

                // Don't retry if not retryable
                if (!lastError.isRetryable) {
                    throw lastError;
                }

                // Don't retry if this was the last attempt
                if (attempt === retryConfig.maxRetries) {
                    throw lastError;
                }

                // Calculate delay with exponential backoff
                const delay = Math.min(
                    retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
                    retryConfig.maxDelay
                );

                // Notify about retry
                if (onRetry) {
                    onRetry(attempt + 1, lastError);
                }

                // Wait before retry
                await this.sleep(delay);
            }
        }

        // This should never be reached, but TypeScript doesn't know that
        throw lastError || new Error('Unknown error during retry');
    }

    /**
     * Sleep for specified milliseconds
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get retry delay for rate limit (from error message if available)
     */
    static getRetryDelay(error: CategorizedError): number {
        if (error.category !== ErrorCategory.RateLimit) {
            return this.DEFAULT_RETRY_CONFIG.baseDelay;
        }

        // Try to extract retry-after from error message
        const retryAfterMatch = error.message.match(/retry after (\d+)/i);
        if (retryAfterMatch) {
            return parseInt(retryAfterMatch[1]) * 1000;
        }

        // Default to 60 seconds for rate limits
        return 60000;
    }

    /**
     * Format error for logging
     */
    static formatForLogging(error: CategorizedError): string {
        return `[${error.category.toUpperCase()}] ${error.message}`;
    }

    /**
     * Get recommended action for error
     */
    static getRecommendedAction(error: CategorizedError): string {
        switch (error.category) {
            case ErrorCategory.Authentication:
                return 'Check your API key in settings (Ctrl+,) and ensure it is valid.';

            case ErrorCategory.Network:
                return 'Check your internet connection and firewall settings.';

            case ErrorCategory.RateLimit:
                return 'Wait a few moments and try again. Consider reducing request frequency.';

            case ErrorCategory.Timeout:
                return 'Try sending a shorter message or check your network connection.';

            case ErrorCategory.Tool:
                return 'Review the tool input parameters and try again.';

            case ErrorCategory.Validation:
                return 'Check your input format and ensure all required fields are provided.';

            case ErrorCategory.API:
                return 'The AI service is experiencing issues. Try again in a few moments.';

            default:
                return 'Try again or check the output channel for more details.';
        }
    }

    /**
     * Create user-friendly error message with action
     */
    static getUserMessage(error: CategorizedError, includeAction: boolean = true): string {
        let message = error.userMessage;

        if (includeAction) {
            const action = this.getRecommendedAction(error);
            message += `\n\n${action}`;
        }

        return message;
    }

    /**
     * Categorize and format error in one step
     */
    static handleError(error: any, includeAction: boolean = true): {
        categorized: CategorizedError;
        userMessage: string;
        logMessage: string;
    } {
        const categorized = this.categorize(error);

        return {
            categorized,
            userMessage: this.getUserMessage(categorized, includeAction),
            logMessage: this.formatForLogging(categorized)
        };
    }
}
