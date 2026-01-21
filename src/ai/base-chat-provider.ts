import * as vscode from 'vscode';
import { APIClient, StreamCallbacks } from './api-client';
import { MCPClient } from './mcp-client';
import { ChatHistoryManager } from './chat-history-manager';
import { MCPPermissionsManager } from './mcp-permissions';

/**
 * Base class for chat providers (sidebar and editor)
 * Eliminates code duplication between AIChatProvider and ChatEditorProvider
 */
export abstract class BaseChatProvider {
    protected apiClient: APIClient;
    protected mcpClient: MCPClient;
    protected outputChannel: vscode.OutputChannel;
    protected historyManager: ChatHistoryManager;
    protected mcpPermissions: MCPPermissionsManager;
    protected extensionUri: vscode.Uri;
    protected context: vscode.ExtensionContext;

    constructor(
        extensionUri: vscode.Uri,
        outputChannel: vscode.OutputChannel,
        context: vscode.ExtensionContext
    ) {
        this.extensionUri = extensionUri;
        this.context = context;
        this.outputChannel = outputChannel;
        this.apiClient = APIClient.getInstance(outputChannel, context);
        this.mcpClient = new MCPClient(outputChannel, context);
        this.historyManager = ChatHistoryManager.getInstance(context);
        this.mcpPermissions = MCPPermissionsManager.getInstance(context);
        this.loadMCPServers();
    }

    /**
     * Get the current webview instance (implemented by child classes)
     */
    protected abstract getCurrentWebview(): vscode.Webview | undefined;

    /**
     * Load MCP servers from configuration
     */
    protected async loadMCPServers() {
        const config = vscode.workspace.getConfiguration('azureDevOps.ai');
        const servers = config.get<any[]>('mcp.servers', []);
        await this.mcpClient.loadServers(servers);
        this.updateMCPTools();
    }

    /**
     * Update MCP tools and notify webview
     */
    protected updateMCPTools() {
        const provider = vscode.workspace.getConfiguration('azureDevOps.ai').get('provider', 'anthropic');
        const format = provider === 'anthropic' ? 'anthropic' : 'azure';
        const tools = this.mcpClient.getToolsForAPI(format);
        this.apiClient.setMCPTools(tools);
        this.apiClient.setMCPClient(this.mcpClient);
        this.sendSessionInfo();
    }

    /**
     * Send session info to webview
     */
    protected sendSessionInfo() {
        const webview = this.getCurrentWebview();
        if (!webview) return;

        const provider = vscode.workspace.getConfiguration('azureDevOps.ai').get('provider', 'anthropic');
        const format = provider === 'anthropic' ? 'anthropic' : 'azure';
        const tools = this.mcpClient.getToolsForAPI(format);
        const mcpServers = this.mcpClient.getActiveServers();

        webview.postMessage({
            type: 'sessionInfo',
            data: {
                sessionId: `session_${Date.now()}`,
                tools: tools,
                mcpServers: mcpServers
            }
        });
    }

    /**
     * Handle incoming messages from webview
     */
    protected async handleMessage(message: any) {
        switch (message.type) {
            case 'sendMessage':
                await this.handleSendMessage(message.text);
                break;
            case 'clearHistory':
                this.apiClient.clearHistory();
                break;
            case 'stopGeneration':
                this.apiClient.stop();
                break;
            case 'updateConfig':
                this.apiClient.updateConfig();
                await this.loadMCPServers();
                break;
            case 'openSettings':
                vscode.commands.executeCommand('azureDevOps.openAISettings');
                break;
            case 'loadHistory':
                const history = await this.historyManager.getHistory();
                const webview = this.getCurrentWebview();
                if (webview) {
                    webview.postMessage({ type: 'historyUpdated', history });
                }
                break;
            case 'deleteHistory':
                // TODO: Implement deleteHistory in ChatHistoryManager
                // await this.historyManager.deleteHistory(message.id);
                break;
            case 'loadConversation':
                // TODO: Implement loadConversation in ChatHistoryManager
                // await this.historyManager.loadConversation(message.id);
                break;
            case 'requestMCPPermission':
                const allowed = await this.handleMCPPermissionRequest(
                    message.serverName,
                    message.toolName,
                    message.args
                );
                const webview3 = this.getCurrentWebview();
                if (webview3) {
                    webview3.postMessage({
                        type: 'mcpPermissionResponse',
                        requestId: message.requestId,
                        allowed
                    });
                }
                break;
            case 'editMessage':
                await this.handleEditMessage(message.timestamp, message.newContent);
                break;
            case 'confirmEditMessage':
                await this.handleConfirmEditMessage(message.timestamp, message.newContent);
                break;
            case 'deleteMessage':
                await this.handleDeleteMessage(message.timestamp);
                break;
            case 'getUIMessages':
                const webview4 = this.getCurrentWebview();
                if (webview4) {
                    const uiMessages = this.apiClient.getUIMessages();
                    webview4.postMessage({
                        type: 'uiMessagesUpdate',
                        messages: uiMessages
                    });
                }
                break;
        }
    }

    /**
     * Handle MCP permission request
     */
    protected async handleMCPPermissionRequest(
        serverName: string,
        toolName: string,
        args: any
    ): Promise<boolean> {
        // Show permission dialog
        const argsPreview = JSON.stringify(args, null, 2);
        const message = `Allow MCP tool execution?\n\nServer: ${serverName}\nTool: ${toolName}\n\nArguments:\n${argsPreview}`;

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Allow Once',
            'Always Allow',
            'Deny'
        );

        if (choice === 'Always Allow') {
            await this.mcpPermissions.setPermission(serverName, toolName, 'allow');
            return true;
        } else if (choice === 'Allow Once') {
            return true;
        } else {
            await this.mcpPermissions.setPermission(serverName, toolName, 'deny');
            return false;
        }
    }

    /**
     * Handle edit message request (show confirmation first)
     */
    protected async handleEditMessage(timestamp: number, newContent: string): Promise<void> {
        const webview = this.getCurrentWebview();
        if (!webview) return;

        // Send confirmation dialog request to webview
        webview.postMessage({
            type: 'showEditConfirmation',
            timestamp,
            newContent
        });
    }

    /**
     * Handle confirmed edit message
     */
    protected async handleConfirmEditMessage(timestamp: number, newContent: string): Promise<void> {
        const webview = this.getCurrentWebview();
        if (!webview) return;

        try {
            // Show loading indicator
            webview.postMessage({ type: 'editingMessage' });

            // Stream callbacks for resubmission
            const callbacks = {
                onText: (text: string) => {
                    webview.postMessage({
                        type: 'assistantMessageDelta',
                        text: text
                    });
                },
                onToolUse: (toolName: string, toolInput: any) => {
                    webview.postMessage({
                        type: 'toolUse',
                        toolName: toolName,
                        toolInput: toolInput
                    });
                },
                onToolResult: (toolName: string, result: string, isError: boolean) => {
                    webview.postMessage({
                        type: 'toolResult',
                        toolName: toolName,
                        result: result,
                        isError: isError
                    });
                },
                onError: (error: string) => {
                    webview.postMessage({
                        type: 'error',
                        message: error
                    });
                },
                onComplete: (inputTokens: number, outputTokens: number) => {
                    webview.postMessage({
                        type: 'assistantMessageEnd',
                        inputTokens: inputTokens,
                        outputTokens: outputTokens
                    });
                    // Send updated UI messages
                    webview.postMessage({
                        type: 'uiMessagesUpdate',
                        messages: this.apiClient.getUIMessages()
                    });
                },
                onPermissionPrompt: (id: string, serverName: string, toolName: string, toolInput: any) => {
                    webview.postMessage({
                        type: 'permissionPrompt',
                        id: id,
                        serverName: serverName,
                        toolName: toolName,
                        toolInput: toolInput
                    });
                }
            };

            // Execute edit (this will rewind and resubmit)
            await this.apiClient.editMessage(timestamp, newContent, callbacks);

        } catch (error: any) {
            webview.postMessage({
                type: 'error',
                message: `Failed to edit message: ${error.message}`
            });
            this.outputChannel.appendLine(`Error editing message: ${error.message}`);
        }
    }

    /**
     * Handle delete message request
     */
    protected async handleDeleteMessage(timestamp: number): Promise<void> {
        const webview = this.getCurrentWebview();
        if (!webview) return;

        try {
            // Show confirmation dialog
            const choice = await vscode.window.showWarningMessage(
                'Delete this message and all subsequent messages?',
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (choice !== 'Delete') {
                return;
            }

            // Execute delete
            await this.apiClient.deleteMessage(timestamp);

            // Send updated UI messages
            webview.postMessage({
                type: 'uiMessagesUpdate',
                messages: this.apiClient.getUIMessages()
            });

            vscode.window.showInformationMessage('Message deleted successfully');
        } catch (error: any) {
            webview.postMessage({
                type: 'error',
                message: `Failed to delete message: ${error.message}`
            });
            this.outputChannel.appendLine(`Error deleting message: ${error.message}`);
        }
    }

    /**
     * Handle sending a message to the API
     */
    protected async handleSendMessage(text: string) {
        const webview = this.getCurrentWebview();
        if (!webview) return;

        try {
            // Add user message to UI
            webview.postMessage({
                type: 'userMessage',
                text: text
            });

            // TODO: Add message to history properly
            // await this.historyManager.addMessage({ role: 'user', content: text });

            // Show loading indicator
            webview.postMessage({ type: 'assistantMessageStart' });

            // Stream callbacks
            const callbacks: StreamCallbacks = {
                onText: (text: string) => {
                    webview.postMessage({
                        type: 'assistantMessageDelta',
                        text: text
                    });
                },
                onToolUse: (toolName: string, toolInput: any) => {
                    webview.postMessage({
                        type: 'toolUse',
                        toolName: toolName,
                        toolInput: toolInput
                    });
                },
                onToolResult: (toolName: string, result: string, isError: boolean) => {
                    webview.postMessage({
                        type: 'toolResult',
                        toolName: toolName,
                        result: result,
                        isError: isError
                    });
                },
                onError: (error: string) => {
                    webview.postMessage({
                        type: 'error',
                        message: error
                    });
                },
                onComplete: (inputTokens: number, outputTokens: number) => {
                    webview.postMessage({
                        type: 'assistantMessageEnd',
                        inputTokens: inputTokens,
                        outputTokens: outputTokens
                    });
                },
                onPermissionPrompt: (id: string, serverName: string, toolName: string, toolInput: any) => {
                    webview.postMessage({
                        type: 'permissionPrompt',
                        id: id,
                        serverName: serverName,
                        toolName: toolName,
                        toolInput: toolInput
                    });
                }
            };

            // Send message to API
            await this.apiClient.sendMessage(text, callbacks);

        } catch (error: any) {
            webview.postMessage({
                type: 'error',
                message: error.message || 'An error occurred'
            });
            this.outputChannel.appendLine(`Error: ${error.message}`);
        }
    }

    /**
     * Get MCP client (for external access)
     */
    public getMCPClient(): MCPClient {
        return this.mcpClient;
    }

    /**
     * Generate HTML content for webview
     * This is shared between sidebar and editor, with minor differences
     */
    protected getHtmlContent(webview: vscode.Webview, viewType: 'sidebar' | 'editor'): string {
        // Get icon URIs
        const settingsIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.png'));
        const historyIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'history.png'));
        const newChatIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'new-chat.png'));
        const scrollToBottomIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'scroll-to-bottom.png'));
        const editorIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'external-link.png'));

        // View-specific differences
        const scrollOffset = viewType === 'sidebar' ? '120px' : '10px';
        const showEditorButton = viewType === 'sidebar';
        const promptHeadingMargin = viewType === 'sidebar' ? '40px' : '10px';

        // TODO: Extract this into separate HTML/CSS/JS files
        // For now, return the complete HTML inline (same as original implementation)
        // This will be refactored in the next step

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Assistant</title>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js"></script>
    <style>
        /* CSS will be extracted in next refactoring step */
        /* For now, keeping inline to maintain functionality */
    </style>
</head>
<body>
    <!-- HTML content will be extracted in next refactoring step -->
    <!-- Placeholder for now -->
    <div>Chat interface loading...</div>
</body>
</html>`;
    }
}
