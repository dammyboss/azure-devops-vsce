import * as vscode from 'vscode';
import { APIClient, StreamCallbacks } from './api-client';
import { MCPClient } from './mcp-client';
import { ChatHistoryManager } from './chat-history-manager';

export class ChatEditorProvider implements vscode.CustomTextEditorProvider {
    private static viewType = 'azureDevOps.chatEditor';
    private outputChannel: vscode.OutputChannel;
    private apiClient: APIClient;
    private mcpClient: MCPClient;
    private historyManager: ChatHistoryManager;

    constructor(
        private readonly context: vscode.ExtensionContext,
        outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel = outputChannel;
        this.apiClient = APIClient.getInstance(outputChannel);
        this.mcpClient = new MCPClient(outputChannel, context);
        this.historyManager = ChatHistoryManager.getInstance(context);
        this.loadMCPServers();
    }

    private async loadMCPServers() {
        const config = vscode.workspace.getConfiguration('azureDevOps.ai');
        const servers = config.get<any[]>('mcp.servers', []);
        await this.mcpClient.loadServers(servers);
        this.updateMCPTools();
    }

    private updateMCPTools() {
        const provider = vscode.workspace.getConfiguration('azureDevOps.ai').get('provider', 'anthropic');
        const format = provider === 'anthropic' ? 'anthropic' : 'azure';
        const tools = this.mcpClient.getToolsForAPI(format);
        this.apiClient.setMCPTools(tools);
        this.apiClient.setMCPClient(this.mcpClient);
        this.sendSessionInfo();
    }

    private currentWebview?: vscode.Webview;

    private sendSessionInfo() {
        if (!this.currentWebview) return;
        
        const provider = vscode.workspace.getConfiguration('azureDevOps.ai').get('provider', 'anthropic');
        const format = provider === 'anthropic' ? 'anthropic' : 'azure';
        const tools = this.mcpClient.getToolsForAPI(format);
        const mcpServers = this.mcpClient.getActiveServers();
        
        this.currentWebview.postMessage({
            type: 'sessionInfo',
            data: {
                sessionId: `session_${Date.now()}`,
                tools: tools,
                mcpServers: mcpServers
            }
        });
    }

    public static register(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): vscode.Disposable {
        const provider = new ChatEditorProvider(context, outputChannel);
        return vscode.window.registerCustomEditorProvider(ChatEditorProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        });
    }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewPanel.webview.html = this.getHtmlContent(webviewPanel.webview);

        this.currentWebview = webviewPanel.webview;
        this.historyManager.registerWebview(webviewPanel.webview);

        // Send initial history to webview
        this.historyManager.getHistory().then(history => {
            webviewPanel.webview.postMessage({ type: 'historyUpdated', history });
        });

        this.sendSessionInfo();

        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'sendMessage':
                    await this.handleSendMessage(message.text, webviewPanel.webview);
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
                    await vscode.commands.executeCommand('azureDevOps.openAISettings');
                    break;
                case 'getHistory':
                    const history = await this.historyManager.getHistory();
                    webviewPanel.webview.postMessage({ type: 'historyUpdated', history });
                    break;
                case 'saveChat':
                    await this.historyManager.saveChat(message.chat);
                    break;
                case 'getMCPServers':
                    await this.getMCPServersForSettings(webviewPanel.webview);
                    break;
                case 'permissionResponse':
                    this.mcpClient.getPermissionsManager().respondToPermission(message.id, message.action);
                    // Echo back to webview to update UI
                    webviewPanel.webview.postMessage({
                        type: 'permissionResponse',
                        id: message.id,
                        action: message.action
                    });
                    break;
            }
        });
    }

    public async getMCPServersForSettings(webview: vscode.Webview): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const servers = config.get<any[]>('mcp.servers', []);

            const statuses: Record<string, { connected: boolean; toolCount: number; enabled: boolean }> = {};

            const allTools = this.mcpClient.getAllTools();

            for (const server of servers) {
                const serverTools = allTools.filter(t => t.serverName === server.name);
                const isEnabled = server.enabled !== false;
                const isConnected = serverTools.length > 0 && isEnabled;
                statuses[server.name] = {
                    connected: isConnected,
                    toolCount: serverTools.length,
                    enabled: isEnabled
                };
            }

            webview.postMessage({
                type: 'mcpServersData',
                data: {
                    servers: servers,
                    statuses
                }
            });
        } catch (error) {
            console.error('Error getting MCP servers:', error);
        }
    }

    public async handleSendMessage(text: string, webview: vscode.Webview) {
        const callbacks: StreamCallbacks = {
            onText: (text: string) => {
                webview.postMessage({ type: 'streamText', text });
            },
            onToolUse: (toolName: string, toolInput: any) => {
                webview.postMessage({ type: 'toolUse', toolName, toolInput });
            },
            onToolResult: (toolName: string, result: string, isError: boolean) => {
                webview.postMessage({ type: 'toolResult', toolName, result, isError });
            },
            onError: (error: string) => {
                webview.postMessage({ type: 'error', error });
            },
            onComplete: (inputTokens: number, outputTokens: number) => {
                webview.postMessage({ type: 'complete', inputTokens, outputTokens });
            },
            onPermissionPrompt: (id: string, serverName: string, toolName: string, toolInput: any) => {
                webview.postMessage({
                    type: 'permissionPrompt',
                    id,
                    serverName,
                    toolName,
                    toolInput
                });
            }
        };

        // Start the sendMessage call (which will add the user message synchronously at the start)
        const sendPromise = this.apiClient.sendMessage(text, callbacks);

        // Get the user message timestamp immediately (it's been added synchronously)
        const uiMessages = this.apiClient.getUIMessages();
        const lastMessage = uiMessages[uiMessages.length - 1];

        if (lastMessage && lastMessage.role === 'user') {
            // Send user message with timestamp to UI right away
            webview.postMessage({
                type: 'userMessageAdded',
                text: lastMessage.text,
                timestamp: lastMessage.ts
            });
        }

        // Wait for the sendMessage to complete
        await sendPromise;
    }

    public clearHistory(): void {
        this.apiClient.clearHistory();
    }

    public stopGeneration(): void {
        this.apiClient.stop();
    }


    public getHtmlContent(webview: vscode.Webview): string {
        // Get icon URIs
        const settingsIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'settings.png'));
        const historyIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'history.png'));
        const newChatIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'new-chat.png'));
        const scrollToBottomIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'scroll-to-bottom.png'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure DevOps AI Assistant</title>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js"></script>
    <style>
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            background-color: transparent;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h2 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
        }

        .header-actions {
            display: flex;
            gap: 4px;
            align-items: center;
        }

        .icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            transition: all 0.2s ease;
        }

        .icon-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .icon-btn svg {
            display: block;
            width: 16px;
            height: 16px;
        }

        .icon-btn img {
            filter: brightness(0) invert(1);
            opacity: 0.8;
            width: 16px;
            height: 16px;
        }

        .icon-btn:hover img {
            opacity: 1;
        }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
        }

        .messages {
            flex: 1;
            padding: 16px 20px;
            overflow-y: auto;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            line-height: 1.6;
            scroll-behavior: smooth;
        }

        .message {
            margin-bottom: 16px;
            padding: 0;
            max-width: 100%;
            animation: messageSlideIn 0.2s ease-out;
        }

        @keyframes messageSlideIn {
            from {
                opacity: 0;
                transform: translateY(8px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message.user {
            background: rgba(255, 255, 255, 0.06);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            padding: 12px 16px;
            margin-left: 0;
            border-radius: 6px;
            border: none;
            position: relative;
        }

        .message.assistant {
            padding: 0;
            background: transparent;
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .message-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 14px;
            color: #fff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .message-icon.user {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .message-icon.assistant {
            background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
        }

        .message-label {
            font-weight: 500;
            font-size: 12px;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .message-content {
            padding-left: 6px;
        }

        .message-content p {
            margin: 0 0 12px 0;
            line-height: 1.6;
        }

        .message-content p:last-child {
            margin-bottom: 0;
        }

        .message-content code {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 2px 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            color: var(--vscode-editor-foreground);
        }

        .tool-use {
            background-color: rgba(0, 122, 204, 0.1);
            border-left: 3px solid var(--vscode-textLink-foreground);
            font-size: 12px;
            margin: 8px 0;
            padding: 10px 12px;
            border-radius: 4px;
        }

        .input-container {
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-panel-background);
            display: flex;
            flex-direction: column;
            position: relative;
        }

        .textarea-container {
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }

        .textarea-wrapper {
            flex: 1;
            background-color: rgba(255, 255, 255, 0.03);
            border: 2px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            overflow: hidden;
            transition: all 0.2s ease;
        }

        .textarea-wrapper:focus-within {
            border-color: #007ACC;
            background-color: rgba(255, 255, 255, 0.04);
        }

        .input-field {
            width: 100%;
            background-color: transparent;
            color: var(--vscode-input-foreground);
            border: none;
            padding: 14px 16px;
            outline: none;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            min-height: 20px;
            line-height: 1.5;
            overflow-y: hidden;
            resize: none;
        }

        .input-field:focus {
            border: none;
            outline: none;
        }

        .input-field::placeholder {
            color: var(--vscode-input-placeholderForeground);
            opacity: 0.5;
        }

        .input-controls {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            padding: 6px 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            background-color: transparent;
        }

        .send-btn {
            background-color: rgba(255, 255, 255, 0.1);
            color: var(--vscode-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.15s ease;
        }

        .send-btn:hover:not(.generating) {
            background-color: rgba(255, 255, 255, 0.15);
        }

        .send-btn.generating {
            background-color: rgba(255, 100, 100, 0.2);
        }

        .send-btn.generating:hover {
            background-color: rgba(255, 100, 100, 0.3);
        }

        .send-btn-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .send-btn span {
            line-height: 1;
        }

        .token-info {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            flex: 1;
        }

        /* Welcome Screen */
        .welcome-screen {
            position: absolute;
            top: 20px;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding-top: 0;
            pointer-events: none;
        }

        .welcome-screen.hidden {
            display: none;
        }

        .welcome-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 40px 20px;
        }

        .welcome-logo {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            animation: pulse 2s ease-in-out infinite;
            border-radius: 5px;
        }

        .welcome-logo h1 {
            font-size: 16px;
            font-weight: 300;
            margin: 0;
            color: var(--vscode-foreground);
            letter-spacing: -0.5px;
        }

        .welcome-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin: 0;
            transition: opacity 0.6s ease-in-out;
        }

        @keyframes pulse {
            0%, 100% {
                opacity: 1;
                transform: scale(1);
            }
            50% {
                opacity: 0.9;
                transform: scale(1.02);
            }
        }

        /* Scroll to Bottom Button */
        .scroll-to-bottom-btn {
            position: absolute;
            bottom: 170px;
            right: 20px;
            width: 48px;
            height: 48px;
            background: transparent;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
            transition: opacity 0.2s ease, transform 0.2s ease;
            opacity: 0.8;
        }

        .scroll-to-bottom-btn:hover {
            opacity: 1;
            transform: scale(1.1);
        }

        .scroll-to-bottom-btn img {
            width: 32px;
            height: 32px;
            pointer-events: none;
        }

        /* Slash Commands & @ Buttons */
        .slash-btn, .at-btn {
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: none;
            padding: 4px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            transition: all 0.2s ease;
            font-size: 14px;
        }

        .slash-btn:hover, .at-btn:hover {
            background-color: rgba(255, 255, 255, 0.05);
            color: var(--vscode-foreground);
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: transparent;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        /* Animated Loading Indicator */
        .animated-loading {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            animation: fadeIn 0.3s ease;
        }

        .loading-dots {
            display: flex;
            gap: 4px;
        }

        .loading-dots span {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--vscode-textLink-foreground);
            opacity: 0.4;
            animation: loadingDot 1.4s ease-in-out infinite;
        }

        .loading-dots span:nth-child(1) {
            animation-delay: 0s;
        }

        .loading-dots span:nth-child(2) {
            animation-delay: 0.2s;
        }

        .loading-dots span:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes loadingDot {
            0%, 80%, 100% {
                opacity: 0.4;
                transform: scale(1);
            }
            40% {
                opacity: 1;
                transform: scale(1.2);
            }
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .loading-text {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        /* History Panel */
        .history-panel {
            position: absolute;
            top: 0;
            right: -300px;
            width: 300px;
            height: 100%;
            background: var(--vscode-sideBar-background);
            border-left: 1px solid var(--vscode-panel-border);
            transition: right 0.3s ease;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .history-panel.open {
            right: 0;
        }

        .history-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .history-header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
        }

        .history-content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .history-item {
            padding: 8px 12px;
            margin-bottom: 4px;
            background: var(--vscode-editor-background);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            border: 1px solid transparent;
        }

        .history-item:hover {
            border-color: var(--vscode-focusBorder);
        }

        .history-item-preview {
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .history-empty {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        /* Modern Error Card Styles */
        .message.error-card {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.03) 100%);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 12px;
            padding: 0;
            margin: 12px;
            max-width: calc(100% - 24px);
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.1);
        }

        .error-card-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            background: rgba(239, 68, 68, 0.1);
            border-bottom: 1px solid rgba(239, 68, 68, 0.15);
        }

        .error-icon-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: rgba(239, 68, 68, 0.15);
            border-radius: 8px;
            color: #ef4444;
        }

        .error-label {
            flex: 1;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #ef4444;
        }

        .error-copy-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: transparent;
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            color: var(--vscode-foreground);
        }

        .error-copy-btn:hover {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            border-color: rgba(239, 68, 68, 0.4);
        }

        .error-card-content {
            padding: 16px;
            font-size: 13px;
            line-height: 1.6;
            color: var(--vscode-foreground);
        }

        .error-card-content p {
            margin: 0 0 8px 0;
        }

        .error-card-content p:last-child {
            margin-bottom: 0;
        }

        .error-card-content pre {
            background: rgba(0, 0, 0, 0.2);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 12px;
            margin: 8px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>Azure DevOps AI Assistant</h2>
        <div class="header-actions">
            <button class="icon-btn" id="settingsBtn" title="Settings" onclick="openSettings()">
                <img src="${settingsIconUri}" width="16" height="16" alt="Settings">
            </button>
            <button class="icon-btn" id="historyBtn" title="History" onclick="toggleHistory()">
                <img src="${historyIconUri}" width="16" height="16" alt="History">
            </button>
            <button class="icon-btn" id="newChatBtn" title="New Chat" onclick="newChat()">
                <img src="${newChatIconUri}" width="16" height="16" alt="New Chat">
            </button>
        </div>
    </div>
    <div class="chat-container">
        <div class="messages" id="messages"></div>

        <!-- History Panel -->
        <div class="history-panel" id="historyPanel">
            <div class="history-header">
                <h3>Chat History</h3>
                <div style="display: flex; gap: 4px;">
                    <button class="icon-btn" id="searchToggleBtn" onclick="toggleSearch()" title="Search">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                        </svg>
                    </button>
                    <button class="icon-btn" onclick="toggleHistory()" title="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div id="historySearchContainer" style="padding: 0 8px; max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; box-sizing: border-box;">
                <input type="text" id="historySearch" placeholder="Search history..." style="width: 100%; padding: 8px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; color: var(--vscode-input-foreground); font-size: 12px; box-sizing: border-box; margin-bottom: 8px;" oninput="filterHistory()">
            </div>
            <div class="history-content" id="historyContent">
                <div class="history-empty">No conversation history yet</div>
            </div>
        </div>

        <!-- Scroll to Bottom Button -->
        <button class="scroll-to-bottom-btn" id="scrollToBottomBtn" onclick="scrollToBottom()" style="display: none;" title="Scroll to bottom">
            <img src="${scrollToBottomIconUri}" width="20" height="20" alt="Scroll to bottom">
        </button>

        <!-- Welcome Screen -->
        <div id="welcomeScreen" class="welcome-screen">
            <div class="welcome-content">
                <div class="welcome-logo">
                    <h1>Azure DevOps Boards AI Assistant</h1>
                </div>
                <p class="welcome-text">Ready to help with work items, sprints, and Azure DevOps...</p>
            </div>
        </div>

        <div class="input-container">
            <div class="textarea-container">
                <div class="textarea-wrapper">
                    <textarea class="input-field" id="message-input" placeholder="Ask about work items, sprints, or Azure DevOps..." rows="1"></textarea>
                    <div class="input-controls">
                        <div class="token-info" id="token-info"></div>
                        <button class="slash-btn" onclick="showSlashCommands()" title="Quick actions">/</button>
                        <button class="at-btn" onclick="showAtMention()" title="Reference files">@</button>
                        <button class="send-btn" id="send-button">
                            <div class="send-btn-content">
                                <span>Send</span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12">
                                    <path fill="currentColor" d="M20 4v9a4 4 0 0 1-4 4H6.914l2.5 2.5L8 20.914L3.086 16L8 11.086L9.414 12.5l-2.5 2.5H16a2 2 0 0 0 2-2V4z"></path>
                                </svg>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const tokenInfo = document.getElementById('token-info');
        const welcomeScreen = document.getElementById('welcomeScreen');

        let currentAssistantMessage = null;
        let isGenerating = false;
        let loadingElement = null;
        let loadingInterval = null;
        let loadingMessageIndex = 0;
        let chatHistory = [];
        let currentChatId = Date.now();

        const md = window.markdownit({ html: false, breaks: true, linkify: true });

        function loadHistory() {
            vscode.postMessage({ type: 'getHistory' });
        }

        function saveHistory() {
            // History is saved when newChat is called
        }

        function updateHistoryPanel() {
            const historyContent = document.getElementById('historyContent');
            if (chatHistory.length === 0) {
                historyContent.innerHTML = '<div class="history-empty">No conversation history yet</div>';
                return;
            }
            historyContent.innerHTML = chatHistory.map((chat, index) => \`
                <div class="history-item" onclick="loadChat(\${index})">
                    <div class="history-item-preview">\${chat.preview}</div>
                    <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px;">\${new Date(chat.timestamp).toLocaleString()}</div>
                </div>
            \`).join('');
        }

        function filterHistory() {
            const searchTerm = document.getElementById('historySearch').value.toLowerCase();
            const filtered = chatHistory.filter(chat => 
                chat.preview.toLowerCase().includes(searchTerm)
            );
            const historyContent = document.getElementById('historyContent');
            if (filtered.length === 0) {
                historyContent.innerHTML = '<div class="history-empty">No matching conversations</div>';
                return;
            }
            historyContent.innerHTML = filtered.map((chat) => {
                const index = chatHistory.indexOf(chat);
                return \`
                    <div class="history-item" onclick="loadChat(\${index})">
                        <div class="history-item-preview">\${chat.preview}</div>
                        <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px;">\${new Date(chat.timestamp).toLocaleString()}</div>
                    </div>
                \`;
            }).join('');
        }

        function loadChat(index) {
            const chat = chatHistory[index];
            messagesDiv.innerHTML = '';
            welcomeScreen.classList.add('hidden');
            chat.messages.forEach(msg => {
                addMessage(msg.role, msg.content);
            });
            currentChatId = chat.id;
            toggleHistory();
        }

        loadHistory();

        loadHistory();

        const processingMessages = [
            'Reticulating splines',
            'Marinating',
            'Discombobulating',
            'Percolating',
            'Cogitating',
            'Ruminating',
            'Contemplating',
            'Brainstorming',
            'Synthesizing',
            'Pondering deeply',
            'Consulting the oracle',
            'Channeling inspiration',
            'Untangling thoughts',
            'Brewing ideas',
            'Assembling neurons',
            'Calibrating wisdom',
            'Defragmenting thoughts',
            'Loading creativity',
            'Warming up circuits',
            'Connecting dots'
        ];

        function showAnimatedLoading() {
            hideAnimatedLoading();
            
            loadingElement = document.createElement('div');
            loadingElement.className = 'animated-loading';
            loadingElement.innerHTML = \`
                <div class="loading-dots">
                    <span></span><span></span><span></span>
                </div>
                <span class="loading-text">\${processingMessages[0]}</span>
            \`;
            
            messagesDiv.appendChild(loadingElement);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            loadingMessageIndex = 0;
            loadingInterval = setInterval(() => {
                loadingMessageIndex = (loadingMessageIndex + 1) % processingMessages.length;
                const textEl = loadingElement?.querySelector('.loading-text');
                if (textEl) {
                    textEl.textContent = processingMessages[loadingMessageIndex];
                }
            }, 2000);
        }

        function hideAnimatedLoading() {
            if (loadingInterval) {
                clearInterval(loadingInterval);
                loadingInterval = null;
            }
            if (loadingElement) {
                loadingElement.remove();
                loadingElement = null;
            }
        }

        // Auto-resize textarea
        function autoResizeTextarea() {
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';
        }

        messageInput.addEventListener('input', autoResizeTextarea);

        sendButton.addEventListener('click', () => {
            if (isGenerating) {
                stopGeneration();
            } else {
                sendMessage();
            }
        });
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isGenerating) {
                    sendMessage();
                }
            }
        });

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            // Hide welcome screen on first message
            if (welcomeScreen) {
                welcomeScreen.classList.add('hidden');
            }

            // Don't add message to UI yet - wait for backend to send it with timestamp
            messageInput.value = '';
            messageInput.style.height = 'auto';

            isGenerating = true;
            updateSendButton();
            showAnimatedLoading();

            currentAssistantMessage = addMessage('assistant', '');

            vscode.postMessage({ type: 'sendMessage', text });
        }

        function stopGeneration() {
            vscode.postMessage({ type: 'stopGeneration' });
            isGenerating = false;
            updateSendButton();
            hideAnimatedLoading();
        }

        function updateSendButton() {
            const btnContent = sendButton.querySelector('.send-btn-content');
            console.log('Updating button, isGenerating:', isGenerating);
            if (isGenerating) {
                sendButton.classList.add('generating');
                btnContent.innerHTML = '<span>Stop</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12"><rect x="6" y="6" width="12" height="12" fill="currentColor" rx="2"/></svg>';
                console.log('Button changed to Stop');
            } else {
                sendButton.classList.remove('generating');
                btnContent.innerHTML = '<span>Send</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M20 4v9a4 4 0 0 1-4 4H6.914l2.5 2.5L8 20.914L3.086 16L8 11.086L9.414 12.5l-2.5 2.5H16a2 2 0 0 0 2-2V4z"></path></svg>';
                console.log('Button changed to Send');
            }
        }

        function addMessage(role, content, timestamp) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}\`;

            // Store timestamp
            if (timestamp) {
                messageDiv.setAttribute('data-timestamp', timestamp);
            }

            if (role === 'user') {
                // Create user message
                const textDiv = document.createElement('div');
                textDiv.className = 'user-message-text';
                textDiv.textContent = content;
                messageDiv.appendChild(textDiv);
            } else {
                // Assistant message - clean, no header
                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.innerHTML = md.render(content);
                messageDiv.appendChild(contentDiv);
            }

            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return messageDiv;
        }

        function addErrorMessage(errorText) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message error-card';

            // Error header with icon and label
            const headerDiv = document.createElement('div');
            headerDiv.className = 'error-card-header';

            // Icon container
            const iconContainer = document.createElement('div');
            iconContainer.className = 'error-icon-container';
            iconContainer.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

            // Error label
            const labelDiv = document.createElement('div');
            labelDiv.className = 'error-label';
            labelDiv.textContent = 'ERROR';

            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'error-copy-btn';
            copyBtn.title = 'Copy error message';
            copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.onclick = function() {
                navigator.clipboard.writeText(errorText).then(() => {
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = '✓';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHTML;
                    }, 2000);
                });
            };

            headerDiv.appendChild(iconContainer);
            headerDiv.appendChild(labelDiv);
            headerDiv.appendChild(copyBtn);
            messageDiv.appendChild(headerDiv);

            // Error content
            const contentDiv = document.createElement('div');
            contentDiv.className = 'error-card-content';
            contentDiv.innerHTML = '<p>' + errorText.replace(/\\n/g, '</p><p>') + '</p>';
            messageDiv.appendChild(contentDiv);

            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return messageDiv;
        }

        function addToolUse(toolName, toolInput) {
            const toolDiv = document.createElement('div');
            toolDiv.className = 'tool-use';
            toolDiv.style.cssText = \`
                background: var(--vscode-editor-background);
                border: 1px solid rgba(102, 126, 234, 0.3);
                border-radius: 6px;
                padding: 10px 12px;
                margin: 8px 0;
                font-size: 12px;
                color: var(--vscode-foreground);
            \`;

            // Header row with server icon and status
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = \`
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
            \`;

            // Left side - Server icon and tool name
            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const serverIcon = document.createElement('span');
            serverIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>';
            serverIcon.style.cssText = 'color: var(--vscode-descriptionForeground); display: flex;';

            const toolNameSpan = document.createElement('span');
            toolNameSpan.style.cssText = 'font-weight: 600; color: var(--vscode-foreground);';
            toolNameSpan.textContent = toolName;

            leftDiv.appendChild(serverIcon);
            leftDiv.appendChild(toolNameSpan);

            // Right side - Status indicator
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = \`
                display: flex;
                align-items: center;
                gap: 6px;
                font-family: monospace;
                font-size: 11px;
            \`;

            const statusDot = document.createElement('div');
            statusDot.style.cssText = \`
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #9ecc3b;
            \`;

            const statusText = document.createElement('span');
            statusText.style.cssText = 'color: var(--vscode-foreground);';
            statusText.textContent = 'Running';

            statusDiv.appendChild(statusDot);
            statusDiv.appendChild(statusText);

            headerDiv.appendChild(leftDiv);
            headerDiv.appendChild(statusDiv);

            // Tool input display (if present)
            let inputDiv;
            if (toolInput && Object.keys(toolInput).length > 0) {
                inputDiv = document.createElement('div');
                inputDiv.style.cssText = \`
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 4px;
                    padding: 8px;
                    margin-top: 6px;
                    font-family: monospace;
                    font-size: 11px;
                    overflow-x: auto;
                    color: var(--vscode-descriptionForeground);
                \`;
                inputDiv.textContent = JSON.stringify(toolInput, null, 2);
            }

            toolDiv.appendChild(headerDiv);
            if (inputDiv) {
                toolDiv.appendChild(inputDiv);
            }

            messagesDiv.appendChild(toolDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            // Store reference for status updates
            window.currentToolUse = { element: toolDiv, statusDot, statusText };
        }

        function openSettings() {
            vscode.postMessage({ type: 'openSettings' });
        }

        function toggleHistory() {
            const panel = document.getElementById('historyPanel');
            panel.classList.toggle('open');
        }

        function toggleSearch() {
            const container = document.getElementById('historySearchContainer');
            const input = document.getElementById('historySearch');
            if (container.style.maxHeight === '0px' || !container.style.maxHeight) {
                container.style.maxHeight = '60px';
                container.style.padding = '8px';
                setTimeout(() => input.focus(), 300);
            } else {
                container.style.maxHeight = '0px';
                container.style.padding = '0 8px';
                input.value = '';
                updateHistoryPanel();
            }
        }

        function newChat() {
            const messages = Array.from(messagesDiv.querySelectorAll('.message'));
            if (messages.length > 0) {
                const firstUserMsg = messages.find(m => m.classList.contains('user'));
                const preview = firstUserMsg ? firstUserMsg.textContent.substring(0, 50) : 'New conversation';
                const chat = {
                    id: currentChatId,
                    timestamp: Date.now(),
                    preview: preview,
                    messages: messages.map(m => ({
                        role: m.classList.contains('user') ? 'user' : 'assistant',
                        content: m.textContent
                    }))
                };
                vscode.postMessage({ type: 'saveChat', chat });
            }
            vscode.postMessage({ type: 'clearHistory' });
            messagesDiv.innerHTML = '';
            welcomeScreen.classList.remove('hidden');
            currentChatId = Date.now();
        }

        // Create a permanent permission message (Roo Code style)
        function addPermissionMessage(id, serverName, toolName, toolInput) {
            console.log('[DEBUG] addPermissionMessage called with id:', id, 'at', new Date().toISOString());
            console.trace('[DEBUG] Call stack for addPermissionMessage');

            // Check if this permission was already shown
            if (window.shownPermissions && window.shownPermissions.has(id)) {
                console.log('[DEBUG] Permission', id, 'already shown, skipping');
                return;
            }

            // Track shown permissions
            if (!window.shownPermissions) {
                window.shownPermissions = new Set();
            }
            window.shownPermissions.add(id);

            // Add explanation message
            const explainMsg = addMessage('assistant', \`I'll use the \${toolName} tool on the \${serverName} MCP server.\`);

            // Add permission request card
            const permCard = document.createElement('div');
            permCard.className = 'permission-request';
            permCard.style.cssText = \`
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-focusBorder);
                border-radius: 8px;
                padding: 12px;
                margin: 12px 0;
            \`;

            // Header with icon and title
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;';
            headerDiv.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                    <line x1="6" y1="6" x2="6.01" y2="6"/>
                    <line x1="6" y1="18" x2="6.01" y2="18"/>
                </svg>
                <span style="font-weight: 600; color: var(--vscode-foreground);">AI Assistant wants to use a tool on the \${serverName} MCP server</span>
            \`;

            // Collapsible tool details section
            const detailsContainer = document.createElement('div');
            detailsContainer.id = \`perm-details-\${id}\`;
            detailsContainer.style.cssText = \`
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 12px;
            \`;

            // Server name header with chevron
            const serverHeader = document.createElement('div');
            serverHeader.style.cssText = \`
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
                margin-bottom: 12px;
            \`;
            serverHeader.innerHTML = \`
                <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                        <line x1="6" y1="6" x2="6.01" y2="6"/>
                        <line x1="6" y1="18" x2="6.01" y2="18"/>
                    </svg>
                    <span style="font-weight: 600; color: var(--vscode-foreground);">\${serverName}</span>
                </div>
                <svg id="chevron-\${id}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            \`;

            // Tool details (collapsible)
            const toolDetails = document.createElement('div');
            toolDetails.id = \`tool-details-\${id}\`;
            toolDetails.style.cssText = 'display: block;';
            toolDetails.innerHTML = \`
                <div style="margin-top: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2 L12 6 M12 18 L12 22 M4.93 4.93 L7.76 7.76 M16.24 16.24 L19.07 19.07 M2 12 L6 12 M18 12 L22 12 M4.93 19.07 L7.76 16.24 M16.24 7.76 L19.07 4.93"/>
                        </svg>
                        <span style="font-weight: 600; color: var(--vscode-textLink-foreground); font-family: monospace;">\${toolName}</span>
                        <label style="margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" id="always-allow-\${id}" style="cursor: pointer;"/>
                            <span>Always allow</span>
                        </label>
                    </div>
                    <p style="margin: 4px 0 8px 20px; font-size: 11px; color: var(--vscode-descriptionForeground);">Tool execution on MCP server</p>
                    \${toolInput && Object.keys(toolInput).length > 0 ? \`
                    <div style="background: rgba(0, 0, 0, 0.2); border-radius: 4px; padding: 8px; margin-top: 8px; font-family: monospace; font-size: 11px; overflow-x: auto;">
                        <pre style="margin: 0; color: var(--vscode-descriptionForeground);">\${JSON.stringify(toolInput, null, 2)}</pre>
                    </div>
                    \` : ''}
                </div>
            \`;

            // Toggle collapse
            serverHeader.onclick = () => {
                const details = document.getElementById(\`tool-details-\${id}\`);
                const chevron = document.getElementById(\`chevron-\${id}\`);
                if (details.style.display === 'none') {
                    details.style.display = 'block';
                    chevron.style.transform = 'rotate(0deg)';
                } else {
                    details.style.display = 'none';
                    chevron.style.transform = 'rotate(-90deg)';
                }
            };

            detailsContainer.appendChild(serverHeader);
            detailsContainer.appendChild(toolDetails);

            // Action buttons
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'permission-actions';
            actionsDiv.setAttribute('data-permission-actions', id);
            actionsDiv.style.cssText = 'display: flex; gap: 8px;';
            actionsDiv.innerHTML = \`
                <button onclick="respondPermission('\${id}', 'deny')" style="flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.05); color: var(--vscode-foreground); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">Deny</button>
                <button onclick="respondPermission('\${id}', 'allow')" style="flex: 1; padding: 8px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">Allow</button>
            \`;

            permCard.appendChild(headerDiv);
            permCard.appendChild(detailsContainer);
            permCard.appendChild(actionsDiv);

            // Mark the card with the permission ID
            permCard.setAttribute('data-permission-id', id);

            messagesDiv.appendChild(permCard);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            // Store reference including the explanation message
            window.currentPermissionCard = { id, card: permCard, explanationMsg: explainMsg };
        }

        function respondPermission(id, action) {
            console.log('[DEBUG] respondPermission called with id:', id, 'action:', action);

            // Check if "always allow" is checked
            const alwaysAllowCheckbox = document.getElementById(\`always-allow-\${id}\`);
            const finalAction = (alwaysAllowCheckbox && alwaysAllowCheckbox.checked) ? 'allow-always' : action;

            vscode.postMessage({ type: 'permissionResponse', id, action: finalAction });

            // DON'T remove the card - instead update it to show approved/denied state (Roo Code style)
            const permCard = document.querySelector(\`[data-permission-id="\${id}"]\`);
            console.log('[DEBUG] Found permCard:', permCard);

            if (permCard) {
                // Find and replace the action buttons with approval status
                const actionsDiv = permCard.querySelector('.permission-actions');
                console.log('[DEBUG] Found actionsDiv:', actionsDiv);

                if (actionsDiv) {
                    if (action === 'allow') {
                        actionsDiv.innerHTML = \`
                            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(158, 204, 59, 0.1); border-radius: 6px;">
                                <div style="width: 6px; height: 6px; border-radius: 50%; background: #9ecc3b;"></div>
                                <span style="color: #9ecc3b; font-weight: 500; font-size: 12px;">Approved</span>
                            </div>
                        \`;
                    } else {
                        actionsDiv.innerHTML = \`
                            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(241, 76, 76, 0.1); border-radius: 6px;">
                                <div style="width: 6px; height: 6px; border-radius: 50%; background: #f14c4c;"></div>
                                <span style="color: #f14c4c; font-weight: 500; font-size: 12px;">Denied</span>
                            </div>
                        \`;
                    }
                }
            }

            // Show loading animation after approval to indicate tool execution
            if (action === 'allow') {
                showAnimatedLoading();
            }
        }

        function showSlashCommands() {
            // Placeholder for slash commands functionality
            messageInput.value = '/';
            messageInput.focus();
        }

        function showAtMention() {
            // Placeholder for @ mention functionality
            messageInput.value += '@';
            messageInput.focus();
        }

        // Scroll to bottom functionality
        const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');

        function scrollToBottom() {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            if (scrollToBottomBtn) scrollToBottomBtn.style.display = 'none';
        }

        messagesDiv.addEventListener('scroll', () => {
            const isAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop <= messagesDiv.clientHeight + 50;
            if (scrollToBottomBtn) {
                scrollToBottomBtn.style.display = isAtBottom ? 'none' : 'flex';
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'streamText':
                    // Only hide loading after we start receiving substantial text
                    // This keeps the loading animation visible during tool execution
                    if (currentAssistantMessage) {
                        const contentDiv = currentAssistantMessage.querySelector('.message-content');
                        if (contentDiv) {
                            const currentText = contentDiv.getAttribute('data-raw') || '';
                            const newText = currentText + message.text;
                            contentDiv.setAttribute('data-raw', newText);
                            contentDiv.innerHTML = md.render(newText);

                            // Hide loading only after we have some content
                            if (newText.length > 10) {
                                hideAnimatedLoading();
                            }
                        }
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    }
                    break;

                case 'toolUse':
                    addToolUse(message.toolName, message.toolInput);
                    break;

                case 'toolResult':
                    // Update tool status to completed
                    if (window.currentToolUse) {
                        const { statusDot, statusText } = window.currentToolUse;
                        if (!message.isError) {
                            statusDot.style.background = '#9ecc3b'; // Green for success
                            statusText.textContent = 'Completed';
                        } else {
                            statusDot.style.background = '#f14c4c'; // Red for error
                            statusText.textContent = 'Error';
                        }
                    }
                    break;

                case 'permissionPrompt':
                    // Pause any ongoing message streaming
                    hideAnimatedLoading();
                    isGenerating = true; // Keep generating state active
                    updateSendButton();

                    // Add permission prompt as a permanent message (Roo Code style)
                    addPermissionMessage(message.id, message.serverName, message.toolName, message.toolInput);
                    break;

                case 'error':
                    hideAnimatedLoading();
                    addErrorMessage(message.error);
                    isGenerating = false;
                    updateSendButton();
                    currentAssistantMessage = null;
                    break;

                case 'complete':
                    hideAnimatedLoading();
                    isGenerating = false;
                    updateSendButton();
                    currentAssistantMessage = null;
                    tokenInfo.textContent = \`Tokens: \${message.inputTokens} in / \${message.outputTokens} out\`;
                    break;

                case 'historyUpdated':
                    chatHistory = message.history;
                    updateHistoryPanel();
                    break;

                case 'userMessageAdded':
                    // Add user message to UI with timestamp
                    addMessage('user', message.text, message.timestamp);
                    break;
            }
        });

    </script>
</body>
</html>`;
    }
}

let activeChatPanel: vscode.WebviewPanel | undefined;

export async function openChatEditor(context: vscode.ExtensionContext) {
    // If panel already exists, reveal it and close sidebar
    if (activeChatPanel) {
        activeChatPanel.reveal(vscode.ViewColumn.One);
        await vscode.commands.executeCommand('workbench.action.closeSidebar');
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'azureDevOps.chatEditorView',
        'Azure DevOps AI Chat',
        vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [context.extensionUri], retainContextWhenHidden: true }
    );

    activeChatPanel = panel;

    // Clear reference when panel is disposed
    panel.onDidDispose(() => {
        activeChatPanel = undefined;
    });

    // Close the sidebar after opening the editor
    await vscode.commands.executeCommand('workbench.action.closeSidebar');

    const provider = new ChatEditorProvider(context, vscode.window.createOutputChannel('Azure DevOps AI'));
    
    panel.webview.html = provider.getHtmlContent(panel.webview);

    // Set the webview for session info
    (provider as any).currentWebview = panel.webview;

    const historyManager = (provider as any).historyManager;
    historyManager.registerWebview(panel.webview);
    
    historyManager.getHistory().then((history: any) => {
        panel.webview.postMessage({ type: 'historyUpdated', history });
    });

    // Send session info
    (provider as any).sendSessionInfo();

    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
            case 'sendMessage':
                await provider.handleSendMessage(message.text, panel.webview);
                break;
            case 'clearHistory':
                provider.clearHistory();
                break;
            case 'stopGeneration':
                provider.stopGeneration();
                break;
            case 'openSettings':
                await vscode.commands.executeCommand('azureDevOps.openAISettings');
                break;
            case 'getHistory':
                const hist = await historyManager.getHistory();
                panel.webview.postMessage({ type: 'historyUpdated', history: hist });
                break;
            case 'saveChat':
                await historyManager.saveChat(message.chat);
                break;
            case 'getMCPServers':
                await provider.getMCPServersForSettings(panel.webview);
                break;
            case 'permissionResponse':
                (provider as any).mcpClient.getPermissionsManager().respondToPermission(message.id, message.action);
                break;
        }
    });
}
