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

        // Get the timestamp by temporarily calling getUIMessages after message will be added
        // We'll send the timestamp in a synchronous way before the async work starts

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

        // Start the sendMessage call (which will add the user message synchronously at the start)
        const sendPromise = this.apiClient.sendMessage(text, callbacks);

        // Get the user message timestamp immediately (it's been added synchronously)
        const uiMessages = this.apiClient.getUIMessages();
        const lastMessage = uiMessages[uiMessages.length - 1];

        if (lastMessage && lastMessage.role === 'user') {
            // Send user message with timestamp to UI right away
            this.view.webview.postMessage({
                type: 'userMessageAdded',
                text: lastMessage.text,
                timestamp: lastMessage.ts
            });
        }

        // Wait for the sendMessage to complete
        await sendPromise;
    }


    private getHtmlContent(webview: vscode.Webview): string {
        // Get the bundle URI for React app
        const bundleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'bundle.js')
        );

        // Get CSP source
        const cspSource = webview.cspSource;

        // Return the React-based HTML template
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-eval'; connect-src ${cspSource} https://*.vscode-cdn.net;">
  <title>AI Assistant</title>
</head>
<body>
  <div id="root"></div>
  <script src="${bundleUri}"></script>
</body>
</html>`;
    }
}
