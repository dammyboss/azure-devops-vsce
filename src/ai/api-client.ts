import * as vscode from 'vscode';
import { MCPClient } from './mcp-client';
import { ContextManager } from './context-manager';
import { TokenCounter } from './token-counter';
import { SecretsManager } from './secrets-manager';
import { ToolSchemaValidator } from './tool-schema-validator';
import { ErrorHandler, CategorizedError } from './error-handler';
import { MessageManager, UIMessage } from './message-manager';

export interface Message {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

export interface ContentBlock {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
    tool_use_id?: string;
    content?: string;
    is_error?: boolean;
}

export interface StreamCallbacks {
    onText: (text: string) => void;
    onToolUse: (toolName: string, toolInput: any) => void;
    onToolResult: (toolName: string, result: string, isError: boolean) => void;
    onError: (error: string) => void;
    onComplete: (totalInputTokens: number, totalOutputTokens: number) => void;
    onPermissionPrompt: (id: string, serverName: string, toolName: string, toolInput: any) => void;
}

export type Provider = 'anthropic' | 'azure' | 'deepseek' | 'grok' | 'openai';

export interface ProviderConfig {
    provider: Provider;
    anthropicApiKey?: string;
    anthropicModel?: string;
    azureEndpoint?: string;
    azureApiKey?: string;
    azureDeployment?: string;
    azureApiVersion?: string;
    deepseekApiKey?: string;
    deepseekModel?: string;
    grokApiKey?: string;
    grokModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
}

export class APIClient {
    private static instance: APIClient | null = null;
    private provider: Provider;
    private anthropicApiKey: string = '';
    private anthropicModel: string = 'claude-opus-4-1-20250805';
    private azureEndpoint: string = '';
    private azureApiKey: string = '';
    private azureDeployment: string = '';
    private azureApiVersion: string = '2024-02-15-preview';
    private deepseekApiKey: string = '';
    private deepseekModel: string = 'deepseek-chat';
    private grokApiKey: string = '';
    private grokModel: string = 'grok-beta';
    private openaiApiKey: string = '';
    private openaiModel: string = 'gpt-4o';
    private conversationHistory: Message[] = [];
    private systemPrompt: string;
    private outputChannel: vscode.OutputChannel;
    private abortController: AbortController | null = null;
    private totalInputTokens = 0;
    private totalOutputTokens = 0;
    private mcpTools: any[] = [];
    private mcpClient: MCPClient | null = null;
    private contextManager: ContextManager;
    private secretsManager: SecretsManager | null = null;
    private context: vscode.ExtensionContext | null = null;
    private messageManager: MessageManager;

    constructor(outputChannel: vscode.OutputChannel, context?: vscode.ExtensionContext) {
        this.outputChannel = outputChannel;
        this.messageManager = new MessageManager(outputChannel);
        this.context = context || null;
        this.provider = 'anthropic';
        this.systemPrompt = this.buildSystemPrompt();
        this.contextManager = new ContextManager('claude-opus-4-1-20250805');

        // Initialize secrets manager if context is provided
        if (context) {
            this.secretsManager = SecretsManager.getInstance(context);
            this.migrateAndLoadConfig();
        } else {
            this.loadConfig();
        }
    }

    public static getInstance(outputChannel: vscode.OutputChannel, context?: vscode.ExtensionContext): APIClient {
        if (!APIClient.instance) {
            APIClient.instance = new APIClient(outputChannel, context);
        }
        return APIClient.instance;
    }

    private buildSystemPrompt(): string {
        return `You are an AI assistant integrated into Azure DevOps Boards VS Code extension. You help developers manage work items, sprints, boards, and development workflows.

## Capabilities
- Query and manage Azure DevOps work items
- Create and update work items, sprints, and boards
- Provide insights on project status and team velocity
- Help with Git integration and branch management
- Access MCP tools for extended functionality

## Guidelines
1. Be concise and actionable
2. Use Azure DevOps terminology correctly
3. Provide step-by-step guidance when needed
4. Use tools when available for real-time data`;
    }

    /**
     * Migrate secrets from settings and load config
     */
    private async migrateAndLoadConfig() {
        if (this.secretsManager) {
            // Check if migration is needed
            const needsMigration = await this.secretsManager.needsMigration();
            if (needsMigration) {
                this.outputChannel.appendLine('🔐 Migrating API keys to secure storage...');
                const result = await this.secretsManager.migrateFromSettings();

                if (result.migrated.length > 0) {
                    this.outputChannel.appendLine(`✅ Migrated: ${result.migrated.join(', ')}`);
                }
                if (result.errors.length > 0) {
                    this.outputChannel.appendLine(`❌ Migration errors: ${result.errors.join(', ')}`);
                }
            }
        }

        // Load config from secrets and settings
        await this.loadConfig();
    }

    private async loadConfig() {
        const config = vscode.workspace.getConfiguration('azureDevOps.ai');
        this.provider = config.get('provider', 'anthropic') as Provider;

        // Load API keys from secure storage if available, fallback to settings
        if (this.secretsManager) {
            this.anthropicApiKey = await this.secretsManager.getAnthropicApiKey() || '';
            this.azureApiKey = await this.secretsManager.getAzureApiKey() || '';
            this.deepseekApiKey = await this.secretsManager.getDeepSeekApiKey() || '';
            this.grokApiKey = await this.secretsManager.getGrokApiKey() || '';
            this.openaiApiKey = await this.secretsManager.getOpenAIApiKey() || '';
        } else {
            // Fallback to settings (backwards compatibility)
            this.anthropicApiKey = config.get('anthropic.apiKey', '');
            this.azureApiKey = config.get('azure.apiKey', '');
            this.deepseekApiKey = config.get('deepseek.apiKey', '');
            this.grokApiKey = config.get('grok.apiKey', '');
            this.openaiApiKey = config.get('openai.apiKey', '');
        }

        // Load other (non-secret) settings
        this.anthropicModel = config.get('anthropic.model', 'claude-opus-4-1-20250805');

        this.azureEndpoint = config.get('azure.endpoint', '');
        this.azureDeployment = config.get('azure.deployment', '');
        this.azureApiVersion = config.get('azure.apiVersion', '2024-02-15-preview');

        this.deepseekModel = config.get('deepseek.model', 'deepseek-chat');
        this.grokModel = config.get('grok.model', 'grok-beta');
        this.openaiModel = config.get('openai.model', 'gpt-4o');

        // Update context manager with current model
        this.updateContextManagerModel();
    }

    private updateContextManagerModel() {
        let modelId = 'default';

        switch (this.provider) {
            case 'anthropic':
                modelId = this.anthropicModel;
                break;
            case 'openai':
                modelId = this.openaiModel;
                break;
            case 'azure':
                modelId = `azure-${this.azureDeployment}`;
                break;
            case 'deepseek':
                modelId = this.deepseekModel;
                break;
            case 'grok':
                modelId = this.grokModel;
                break;
        }

        this.contextManager.setModel(modelId);
    }

    updateConfig(config?: Partial<ProviderConfig>) {
        if (!config) {
            this.loadConfig();
            return;
        }

        if (config.provider !== undefined) this.provider = config.provider;
        if (config.anthropicApiKey !== undefined) this.anthropicApiKey = config.anthropicApiKey;
        if (config.anthropicModel !== undefined) this.anthropicModel = config.anthropicModel;
        if (config.azureEndpoint !== undefined) this.azureEndpoint = config.azureEndpoint;
        if (config.azureApiKey !== undefined) this.azureApiKey = config.azureApiKey;
        if (config.azureDeployment !== undefined) this.azureDeployment = config.azureDeployment;
        if (config.azureApiVersion !== undefined) this.azureApiVersion = config.azureApiVersion;
        if (config.deepseekApiKey !== undefined) this.deepseekApiKey = config.deepseekApiKey;
        if (config.deepseekModel !== undefined) this.deepseekModel = config.deepseekModel;
        if (config.grokApiKey !== undefined) this.grokApiKey = config.grokApiKey;
        if (config.grokModel !== undefined) this.grokModel = config.grokModel;
        if (config.openaiApiKey !== undefined) this.openaiApiKey = config.openaiApiKey;
        if (config.openaiModel !== undefined) this.openaiModel = config.openaiModel;

        // Update context manager when model changes
        this.updateContextManagerModel();
    }

    setMCPTools(tools: any[]) {
        this.mcpTools = tools;
    }

    setMCPClient(client: MCPClient) {
        this.mcpClient = client;
    }

    clearHistory() {
        this.conversationHistory = [];
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        this.contextManager.clear();
        this.messageManager.clear();
    }

    /**
     * Get all UI messages for display
     */
    getUIMessages(): UIMessage[] {
        return this.messageManager.getUIMessages();
    }


    stop() {
        this.abortController?.abort();
        this.abortController = null;
    }

    async sendMessage(userMessage: string, callbacks: StreamCallbacks): Promise<{ userMessageTimestamp: number; }> {
        this.abortController = new AbortController();

        // Add to message manager (tracks both UI and API history)
        const uiMessage = this.messageManager.addUserMessage(userMessage);
        const userMessageTimestamp = uiMessage.ts;

        // Add to context manager
        this.contextManager.addMessage({ role: 'user', content: userMessage });

        // Always add to conversation history (full history for UI)
        this.conversationHistory.push({ role: 'user', content: userMessage });

        // Log token usage and warn if approaching limit
        const stats = this.contextManager.getStats();
        this.outputChannel.appendLine(`📊 Context: ${stats.tokenCount.total} tokens (${stats.percentOfLimit.toFixed(1)}% of limit)`);
        if (stats.percentOfLimit > 80) {
            this.outputChannel.appendLine(`⚠️ Context window usage high - older messages may be trimmed for API calls`);
        }

        try {
            await this.runAgentLoop(callbacks);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                callbacks.onError('Request cancelled');
            } else {
                // Categorize and handle error properly
                const categorized = ErrorHandler.categorize(error);
                const errorMessage = ErrorHandler.getUserMessage(categorized, true);
                this.outputChannel.appendLine(`[API Error] ${ErrorHandler.formatForLogging(categorized)}`);
                callbacks.onError(errorMessage);
            }
        } finally {
            this.abortController = null;
            callbacks.onComplete(this.totalInputTokens, this.totalOutputTokens);
        }

        return { userMessageTimestamp };
    }

    private async runAgentLoop(callbacks: StreamCallbacks): Promise<void> {
        const maxIterations = 25;
        let iteration = 0;

        while (iteration < maxIterations) {
            iteration++;

            // Wrap API call in retry logic
            let response;
            try {
                response = await ErrorHandler.withRetry(
                    async () => {
                        if (this.provider === 'anthropic') {
                            return await this.callAnthropicAPI();
                        } else if (this.provider === 'azure') {
                            return await this.callAzureAPI();
                        } else if (this.provider === 'deepseek') {
                            return await this.callDeepSeekAPI();
                        } else if (this.provider === 'grok') {
                            return await this.callGrokAPI();
                        } else if (this.provider === 'openai') {
                            return await this.callOpenAIAPI();
                        } else {
                            return await this.callAnthropicAPI(); // Default to Anthropic
                        }
                    },
                    {
                        maxRetries: 3,
                        baseDelay: 1000,
                        maxDelay: 30000,
                        backoffMultiplier: 2
                    },
                    (attempt: number, error: CategorizedError) => {
                        this.outputChannel.appendLine(
                            `[API Retry] Attempt ${attempt}: ${error.userMessage}`
                        );
                    }
                );
            } catch (error: any) {
                // If retry fails, throw the categorized error
                throw error;
            }

            this.totalInputTokens += response.inputTokens;
            this.totalOutputTokens += response.outputTokens;

            const toolUses = response.content.filter(b => b.type === 'tool_use');

            if (toolUses.length === 0) {
                if (response.bufferedText) {
                    callbacks.onText(response.bufferedText);
                }
                // Add final assistant message to MessageManager
                this.messageManager.addAssistantMessage(response.content, false);
                break;
            }

            // DON'T send buffered text yet - wait until after tool execution
            // This ensures permission prompts appear before the LLM response text

            this.conversationHistory.push({ role: 'assistant', content: response.content });
            // Also add to message manager for UI tracking
            this.messageManager.addAssistantMessage(response.content, false);

            const toolResults: ContentBlock[] = [];
            for (const toolUse of toolUses) {
                callbacks.onToolUse(toolUse.name!, toolUse.input);

                // Actually call the MCP tool
                let result: { success: boolean; result: string; error?: string };
                if (this.mcpClient && toolUse.name) {
                    try {
                        // Get tool schema for validation
                        const allTools = this.mcpClient.getAllTools();
                        const tool = allTools.find(t => {
                            const name = `mcp_${t.serverName}_${t.name}`.substring(0, 64);
                            return toolUse.name === name;
                        });

                        // Validate tool input against schema
                        if (tool && tool.inputSchema) {
                            const validation = ToolSchemaValidator.validateAndGetMessage(toolUse.input, tool.inputSchema);
                            if (!validation.valid) {
                                this.outputChannel.appendLine(`[Tool Validation Error] ${toolUse.name}: ${validation.message}`);
                                const validationError = `Tool input validation failed: ${validation.message}`;
                                result = {
                                    success: false,
                                    result: '',
                                    error: validationError
                                };
                                callbacks.onToolResult(toolUse.name!, validationError, true);
                                toolResults.push({
                                    type: 'tool_result',
                                    tool_use_id: toolUse.id,
                                    content: validationError,
                                    is_error: true
                                });
                                continue;
                            }
                        }

                        // Check permissions
                        const hasPermission = await this.mcpClient.checkToolPermission(
                            toolUse.name,
                            toolUse.input,
                            callbacks.onPermissionPrompt || (() => {})
                        );

                        if (!hasPermission) {
                            result = { success: false, result: '', error: 'Permission denied by user' };
                        } else {
                            // Execute with retry logic and error handling
                            result = await ErrorHandler.withRetry(
                                async () => await this.mcpClient!.callTool(toolUse.name!, toolUse.input),
                                { maxRetries: 2, baseDelay: 1000 }, // Shorter retry for tools
                                (attempt: number, error: CategorizedError) => {
                                    this.outputChannel.appendLine(
                                        `[Tool Retry] ${toolUse.name} - Attempt ${attempt}: ${error.userMessage}`
                                    );
                                }
                            );
                        }
                    } catch (error: any) {
                        // Categorize error and provide better messages
                        const categorized = ErrorHandler.categorize(error);
                        const errorMessage = ErrorHandler.getUserMessage(categorized, true);
                        this.outputChannel.appendLine(`[Tool Error] ${toolUse.name}: ${ErrorHandler.formatForLogging(categorized)}`);
                        result = { success: false, result: '', error: errorMessage };
                    }
                } else {
                    result = { success: false, result: '', error: 'MCP client not available' };
                }

                callbacks.onToolResult(toolUse.name!, result.result || result.error || 'No result', !result.success);
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: result.result || result.error || 'Tool execution failed',
                    is_error: !result.success
                });
            }

            // NOW send the buffered text after all tools have executed
            // This ensures the message order is: permission → tool execution → LLM response
            if (response.bufferedText) {
                // Add line breaks to separate this text from what comes after
                callbacks.onText(response.bufferedText + '\n\n');
            }

            this.conversationHistory.push({ role: 'user', content: toolResults });

            if (this.abortController?.signal.aborted) {
                throw new Error('AbortError');
            }
        }
    }

    private async callAPI(): Promise<{ content: ContentBlock[]; inputTokens: number; outputTokens: number; bufferedText: string }> {
        switch (this.provider) {
            case 'anthropic': return this.callAnthropicAPI();
            case 'azure': return this.callAzureAPI();
            case 'deepseek': return this.callDeepSeekAPI();
            case 'grok': return this.callGrokAPI();
            case 'openai': return this.callOpenAIAPI();
            default: throw new Error(`Unsupported provider: ${this.provider}`);
        }
    }

    private async callAnthropicAPI() {
        if (!this.anthropicApiKey) {
            throw new Error('Anthropic API key not configured. Please set azureDevOps.ai.anthropic.apiKey in settings.');
        }

        // Get trimmed context window for API call (keeps full history in conversationHistory for UI)
        const contextWindow = this.contextManager.getContextWindow();
        const messagesToSend = contextWindow.isTruncated ? contextWindow.messages : this.conversationHistory;

        if (contextWindow.isTruncated) {
            this.outputChannel.appendLine(`📎 Trimmed ${contextWindow.removedCount} old messages for API call (full history preserved in UI)`);
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.anthropicApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.anthropicModel,
                max_tokens: 8192,
                system: this.systemPrompt,
                messages: messagesToSend,
                tools: this.mcpTools,
                stream: true
            }),
            signal: this.abortController?.signal
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            throw new Error(error?.error?.message || `Anthropic API error: ${response.status}`);
        }

        return this.processAnthropicStream(response);
    }

    private async processAnthropicStream(response: Response) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        const contentBlocks: ContentBlock[] = [];
        let currentTextBlock: ContentBlock | null = null;
        let currentToolUseBlock: ContentBlock | null = null;
        let currentToolInput = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let bufferedText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const event = JSON.parse(data);

                    if (event.type === 'message_start' && event.message?.usage) {
                        inputTokens = event.message.usage.input_tokens || 0;
                    } else if (event.type === 'content_block_start') {
                        if (event.content_block?.type === 'text') {
                            currentTextBlock = { type: 'text', text: '' };
                        } else if (event.content_block?.type === 'tool_use') {
                            currentToolUseBlock = {
                                type: 'tool_use',
                                id: event.content_block.id,
                                name: event.content_block.name,
                                input: {}
                            };
                            currentToolInput = '';
                        }
                    } else if (event.type === 'content_block_delta') {
                        if (event.delta?.type === 'text_delta' && currentTextBlock) {
                            currentTextBlock.text += event.delta.text;
                            bufferedText += event.delta.text;
                        } else if (event.delta?.type === 'input_json_delta' && currentToolUseBlock) {
                            currentToolInput += event.delta.partial_json;
                        }
                    } else if (event.type === 'content_block_stop') {
                        if (currentTextBlock?.text) {
                            contentBlocks.push(currentTextBlock);
                        }
                        if (currentToolUseBlock) {
                            currentToolUseBlock.input = JSON.parse(currentToolInput || '{}');
                            contentBlocks.push(currentToolUseBlock);
                        }
                        currentTextBlock = null;
                        currentToolUseBlock = null;
                    } else if (event.type === 'message_delta' && event.usage?.output_tokens) {
                        outputTokens = event.usage.output_tokens;
                    }
                } catch (e) {
                    this.outputChannel.appendLine(`Parse error: ${e}`);
                }
            }
        }

        return { content: contentBlocks, inputTokens, outputTokens, bufferedText };
    }

    private async callAzureAPI() {
        if (!this.azureEndpoint || !this.azureApiKey || !this.azureDeployment) {
            throw new Error('Azure OpenAI not configured. Please set endpoint, apiKey, and deployment in settings.');
        }

        // Get trimmed context window for API call
        const contextWindow = this.contextManager.getContextWindow();
        const messagesToSend = contextWindow.isTruncated ? contextWindow.messages : this.conversationHistory;

        if (contextWindow.isTruncated) {
            this.outputChannel.appendLine(`📎 Trimmed ${contextWindow.removedCount} old messages for API call (full history preserved in UI)`);
        }

        const url = `${this.azureEndpoint}/openai/deployments/${this.azureDeployment}/chat/completions?api-version=${this.azureApiVersion}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.azureApiKey
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    ...this.formatMessagesForOpenAI(messagesToSend)
                ],
                tools: this.mcpTools,
                stream: true,
                max_tokens: 4096
            }),
            signal: this.abortController?.signal
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            throw new Error(error?.error?.message || `Azure API error: ${response.status}`);
        }

        return this.processOpenAIStream(response);
    }

    private async callDeepSeekAPI() {
        if (!this.deepseekApiKey) {
            throw new Error('DeepSeek API key not configured. Please set azureDevOps.ai.deepseek.apiKey in settings.');
        }
        return this.callOpenAICompatible('https://api.deepseek.com/chat/completions', this.deepseekApiKey, this.deepseekModel);
    }

    private async callGrokAPI() {
        if (!this.grokApiKey) {
            throw new Error('Grok API key not configured. Please set azureDevOps.ai.grok.apiKey in settings.');
        }
        return this.callOpenAICompatible('https://api.x.ai/v1/chat/completions', this.grokApiKey, this.grokModel);
    }

    private async callOpenAIAPI() {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured. Please set azureDevOps.ai.openai.apiKey in settings.');
        }
        return this.callOpenAICompatible('https://api.openai.com/v1/chat/completions', this.openaiApiKey, this.openaiModel);
    }

    private async callOpenAICompatible(url: string, apiKey: string, model: string) {
        // Get trimmed context window for API call
        const contextWindow = this.contextManager.getContextWindow();
        const messagesToSend = contextWindow.isTruncated ? contextWindow.messages : this.conversationHistory;

        if (contextWindow.isTruncated) {
            this.outputChannel.appendLine(`📎 Trimmed ${contextWindow.removedCount} old messages for API call (full history preserved in UI)`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    ...this.formatMessagesForOpenAI(messagesToSend)
                ],
                tools: this.mcpTools,
                stream: true,
                max_tokens: 4096
            }),
            signal: this.abortController?.signal
        });

        if (!response.ok) {
            const error: any = await response.json().catch(() => ({}));
            throw new Error(error?.error?.message || `API error: ${response.status}`);
        }

        return this.processOpenAIStream(response);
    }

    private async processOpenAIStream(response: Response) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        const contentBlocks: ContentBlock[] = [];
        let currentText = '';
        let currentToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
        let inputTokens = 0;
        let outputTokens = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const event = JSON.parse(data);
                    const choice = event.choices?.[0];

                    if (choice?.delta?.content) {
                        currentText += choice.delta.content;
                    }

                    if (choice?.delta?.tool_calls) {
                        for (const toolCall of choice.delta.tool_calls) {
                            const index = toolCall.index;
                            if (!currentToolCalls.has(index)) {
                                currentToolCalls.set(index, { id: toolCall.id || '', name: toolCall.function?.name || '', arguments: '' });
                            }
                            const tc = currentToolCalls.get(index)!;
                            if (toolCall.id) tc.id = toolCall.id;
                            if (toolCall.function?.name) tc.name = toolCall.function.name;
                            if (toolCall.function?.arguments) tc.arguments += toolCall.function.arguments;
                        }
                    }

                    if (event.usage) {
                        inputTokens = event.usage.prompt_tokens || 0;
                        outputTokens = event.usage.completion_tokens || 0;
                    }
                } catch (e) {
                    this.outputChannel.appendLine(`Parse error: ${e}`);
                }
            }
        }

        if (currentText) {
            contentBlocks.push({ type: 'text', text: currentText });
        }

        for (const [_, toolCall] of currentToolCalls) {
            contentBlocks.push({
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.name,
                input: JSON.parse(toolCall.arguments || '{}')
            });
        }

        return { content: contentBlocks, inputTokens, outputTokens, bufferedText: currentText };
    }

    private formatMessagesForOpenAI(messagesToFormat?: Message[]): any[] {
        const messages: any[] = [];
        const sourceMessages = messagesToFormat || this.conversationHistory;
        for (const msg of sourceMessages) {
            if (msg.role === 'user') {
                if (typeof msg.content === 'string') {
                    messages.push({ role: 'user', content: msg.content });
                } else if (Array.isArray(msg.content)) {
                    for (const block of msg.content) {
                        if (block.type === 'tool_result') {
                            messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
                        }
                    }
                }
            } else if (msg.role === 'assistant') {
                if (typeof msg.content === 'string') {
                    messages.push({ role: 'assistant', content: msg.content });
                } else if (Array.isArray(msg.content)) {
                    let content = '';
                    const toolCalls: any[] = [];
                    for (const block of msg.content) {
                        if (block.type === 'text') {
                            content += block.text || '';
                        } else if (block.type === 'tool_use') {
                            toolCalls.push({
                                id: block.id,
                                type: 'function',
                                function: { name: block.name, arguments: JSON.stringify(block.input) }
                            });
                        }
                    }
                    const assistantMsg: any = { role: 'assistant' };
                    if (content) assistantMsg.content = content;
                    if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
                    messages.push(assistantMsg);
                }
            }
        }
        return messages;
    }
}
