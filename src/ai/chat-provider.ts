import * as vscode from 'vscode';
import { APIClient, StreamCallbacks } from './api-client';
import { MCPClient } from './mcp-client';

export class AIChatProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private apiClient: APIClient;
    private mcpClient: MCPClient;
    private outputChannel: vscode.OutputChannel;

    constructor(
        private readonly extensionUri: vscode.Uri,
        outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel = outputChannel;
        this.apiClient = new APIClient(outputChannel);
        this.mcpClient = new MCPClient(outputChannel);
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
            }
        });
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

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Assistant</title>
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

        .send-btn:hover {
            background-color: rgba(255, 255, 255, 0.15);
        }

        .send-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
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
            top: 85px;
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
            font-size: 20px;
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
    </style>
</head>
<body>
    <div class="header">
        <h2>🤖 AI Assistant</h2>
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

        <!-- Scroll to Bottom Button -->
        <button class="scroll-to-bottom-btn" id="scrollToBottomBtn" onclick="scrollToBottom()" style="display: none;" title="Scroll to bottom">
            <img src="${scrollToBottomIconUri}" width="20" height="20" alt="Scroll to bottom">
        </button>

        <!-- Welcome Screen -->
        <div id="welcomeScreen" class="welcome-screen">
            <div class="welcome-content">
                <div class="welcome-logo">
                    <h1>🤖 Azure DevOps AI Assistant</h1>
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

        // Auto-resize textarea
        function autoResizeTextarea() {
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';
        }

        messageInput.addEventListener('input', autoResizeTextarea);

        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            // Hide welcome screen on first message
            if (welcomeScreen) {
                welcomeScreen.classList.add('hidden');
            }

            addMessage('user', text);
            messageInput.value = '';
            messageInput.style.height = 'auto';
            sendButton.disabled = true;

            currentAssistantMessage = addMessage('assistant', '');

            vscode.postMessage({ type: 'sendMessage', text });
        }

        function addMessage(role, content) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}\`;

            if (role === 'user') {
                messageDiv.textContent = content;
            } else {
                // Assistant message with header and content structure
                const header = document.createElement('div');
                header.className = 'message-header';

                const icon = document.createElement('div');
                icon.className = \`message-icon \${role}\`;
                icon.textContent = '🤖';

                const label = document.createElement('span');
                label.className = 'message-label';
                label.textContent = 'Assistant';

                header.appendChild(icon);
                header.appendChild(label);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.textContent = content;

                messageDiv.appendChild(header);
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

        function toggleHistory() {
            vscode.postMessage({ type: 'toggleHistory' });
        }

        function newChat() {
            vscode.postMessage({ type: 'clearHistory' });
            messagesDiv.innerHTML = '';
            welcomeScreen.classList.remove('hidden');
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
                    if (currentAssistantMessage) {
                        const contentDiv = currentAssistantMessage.querySelector('.message-content');
                        if (contentDiv) {
                            contentDiv.textContent += message.text;
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
                    addMessage('assistant', \`Error: \${message.error}\`);
                    sendButton.disabled = false;
                    currentAssistantMessage = null;
                    break;

                case 'complete':
                    sendButton.disabled = false;
                    currentAssistantMessage = null;
                    tokenInfo.textContent = \`Tokens: \${message.inputTokens} in / \${message.outputTokens} out\`;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
