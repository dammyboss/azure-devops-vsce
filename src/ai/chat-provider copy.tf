import * as vscode from 'vscode';
import { APIClient, StreamCallbacks } from './api-client';
import { MCPClient } from './mcp-client';
import { ChatHistoryManager } from './chat-history-manager';

export class AIChatProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private apiClient: APIClient;
    private mcpClient: MCPClient;
    private outputChannel: vscode.OutputChannel;
    private historyManager: ChatHistoryManager;

    constructor(
        private readonly extensionUri: vscode.Uri,
        outputChannel: vscode.OutputChannel,
        private readonly context: vscode.ExtensionContext
    ) {
        this.outputChannel = outputChannel;
        this.apiClient = APIClient.getInstance(outputChannel);
        this.mcpClient = new MCPClient(outputChannel, context);
        this.historyManager = ChatHistoryManager.getInstance(context);
        this.loadMCPServers();
    }

    public getMCPClient(): MCPClient {
        return this.mcpClient;
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
        // Update session info when tools change
        this.sendSessionInfo();
    }

    private sendSessionInfo() {
        if (!this.view) return;
        
        const provider = vscode.workspace.getConfiguration('azureDevOps.ai').get('provider', 'anthropic');
        const format = provider === 'anthropic' ? 'anthropic' : 'azure';
        const tools = this.mcpClient.getToolsForAPI(format);
        const mcpServers = this.mcpClient.getActiveServers();
        
        this.view.webview.postMessage({
            type: 'sessionInfo',
            data: {
                sessionId: `session_${Date.now()}`,
                tools: tools,
                mcpServers: mcpServers
            }
        });
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        this.historyManager.registerWebview(webviewView.webview);

        // Send initial history to webview
        this.historyManager.getHistory().then(history => {
            webviewView.webview.postMessage({ type: 'historyUpdated', history });
        });

        // Send session info with tools count
        this.sendSessionInfo();

        webviewView.webview.onDidReceiveMessage(async (message) => {
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
                    await vscode.commands.executeCommand('azureDevOps.openAISettings');
                    break;
                case 'getHistory':
                    const history = await this.historyManager.getHistory();
                    this.view?.webview.postMessage({ type: 'historyUpdated', history });
                    break;
                case 'saveChat':
                    await this.historyManager.saveChat(message.chat);
                    break;
                case 'openEditorChat':
                    await vscode.commands.executeCommand('azureDevOps.openAIChatEditor');
                    break;
                case 'getMCPServers':
                    await this.getMCPServersForSettings();
                    break;
                case 'permissionResponse':
                    this.mcpClient.getPermissionsManager().respondToPermission(message.id, message.action);
                    break;
            }
        });
    }

    private async getMCPServersForSettings(): Promise<void> {
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

            this.view?.webview.postMessage({
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

    private async handleSendMessage(text: string) {
        if (!this.view) return;

        const callbacks: StreamCallbacks = {
            onText: (text: string) => {
                this.view?.webview.postMessage({ type: 'streamText', text });
            },
            onToolUse: (toolName: string, toolInput: any) => {
                this.view?.webview.postMessage({ type: 'toolUse', toolName, toolInput });
            },
            onToolResult: (toolName: string, result: string, isError: boolean) => {
                this.view?.webview.postMessage({ type: 'toolResult', toolName, result, isError });
            },
            onError: (error: string) => {
                this.view?.webview.postMessage({ type: 'error', error });
            },
            onComplete: (inputTokens: number, outputTokens: number) => {
                this.view?.webview.postMessage({ type: 'complete', inputTokens, outputTokens });
            },
            onPermissionPrompt: (id: string, serverName: string, toolName: string, toolInput: any) => {
                this.view?.webview.postMessage({ 
                    type: 'permissionPrompt', 
                    id, 
                    serverName, 
                    toolName, 
                    toolInput 
                });
            }
        };

        await this.apiClient.sendMessage(text, callbacks);
    }

    private getHtmlContent(webview: vscode.Webview): string {
        // Get icon URIs
        const settingsIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.png'));
        const historyIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'history.png'));
        const newChatIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'new-chat.png'));
        const scrollToBottomIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'scroll-to-bottom.png'));
        const editorIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'external-link.png'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Assistant</title>
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
    </style>
</head>
<body>
    <div class="header">
        <h2>AI Assistant</h2>
        <div class="header-actions">
            <button class="icon-btn" id="editorBtn" title="Open in Editor" onclick="openEditorChat()">
                <img src="${editorIconUri}" width="16" height="16" alt="Open in Editor">
            </button>
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
        let loadingElement = null;
        let loadingInterval = null;
        let loadingMessageIndex = 0;
        let isGenerating = false;
        let chatHistory = [];
        let currentChatId = Date.now();

        const md = window.markdownit({ html: false, breaks: true, linkify: true });

        // Load history from localStorage
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

            if (welcomeScreen) {
                welcomeScreen.classList.add('hidden');
            }

            addMessage('user', text);
            messageInput.value = '';
            messageInput.style.height = 'auto';
            
            isGenerating = true;
            updateSendButton();
            showAnimatedLoading();

            vscode.postMessage({ type: 'sendMessage', text });
        }

        function addMessage(role, content) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}\`;

            if (role === 'user') {
                messageDiv.textContent = content;
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

        function addToolUse(toolName, toolInput) {
            const toolDiv = document.createElement('div');
            toolDiv.className = 'tool-use';
            toolDiv.textContent = \`🔧 Using tool: \${toolName}\`;
            messagesDiv.appendChild(toolDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function openSettings() {
            vscode.postMessage({ type: 'openSettings' });
        }

        function openEditorChat() {
            vscode.postMessage({ type: 'openEditorChat' });
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

        function stopGeneration() {
            vscode.postMessage({ type: 'stopGeneration' });
            isGenerating = false;
            updateSendButton();
            hideAnimatedLoading();
        }

        function updateSendButton() {
            const btnContent = sendButton.querySelector('.send-btn-content');
            if (isGenerating) {
                sendButton.classList.add('generating');
                btnContent.innerHTML = '<span>Stop</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12"><rect x="6" y="6" width="12" height="12" fill="currentColor" rx="2"/></svg>';
            } else {
                sendButton.classList.remove('generating');
                btnContent.innerHTML = '<span>Send</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M20 4v9a4 4 0 0 1-4 4H6.914l2.5 2.5L8 20.914L3.086 16L8 11.086L9.414 12.5l-2.5 2.5H16a2 2 0 0 0 2-2V4z"></path></svg>';
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
                    hideAnimatedLoading();
                    if (!currentAssistantMessage) {
                        currentAssistantMessage = addMessage('assistant', '');
                    }
                    if (currentAssistantMessage) {
                        const contentDiv = currentAssistantMessage.querySelector('.message-content');
                        if (contentDiv) {
                            const currentText = contentDiv.getAttribute('data-raw') || '';
                            const newText = currentText + message.text;
                            contentDiv.setAttribute('data-raw', newText);
                            contentDiv.innerHTML = md.render(newText);
                        }
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    }
                    break;

                case 'toolUse':
                    addToolUse(message.toolName, message.toolInput);
                    break;

                case 'toolResult':
                    // Optionally show tool results
                    break;

                case 'error':
                    hideAnimatedLoading();
                    addMessage('assistant', \`Error: \${message.error}\`);
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

                case 'permissionPrompt':
                    showPermissionPrompt(message.id, message.serverName, message.toolName, message.toolInput);
                    break;
            }
        });

        function showPermissionPrompt(id, serverName, toolName, toolInput) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
            
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 20px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
            
            dialog.innerHTML = \`
                <h3 style="margin: 0 0 12px 0; font-size: 14px;">MCP Tool Permission</h3>
                <p style="margin: 0 0 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">Server: <strong>\${serverName}</strong></p>
                <p style="margin: 0 0 16px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">Tool: <strong>\${toolName}</strong></p>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button onclick="respondPermission('\${id}', 'deny')" style="padding: 6px 12px; background: transparent; border: 1px solid var(--vscode-button-border); border-radius: 4px; cursor: pointer; font-size: 12px;">Deny</button>
                    <button onclick="respondPermission('\${id}', 'allow')" style="padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Allow Once</button>
                    <button onclick="respondPermission('\${id}', 'allow-always')" style="padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Always Allow</button>
                </div>
            \`;
            
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            window.currentPermissionOverlay = overlay;
        }

        function respondPermission(id, action) {
            vscode.postMessage({ type: 'permissionResponse', id, action });
            if (window.currentPermissionOverlay) {
                window.currentPermissionOverlay.remove();
                window.currentPermissionOverlay = null;
            }
        }
    </script>
</body>
</html>`;
    }
}
