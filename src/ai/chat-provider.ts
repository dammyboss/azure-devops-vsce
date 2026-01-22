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
                case 'getSettings':
                    await this.sendSettingsToWebview();
                    break;
                case 'setMcpEnabled':
                    await this.setMcpEnabled(message.enabled);
                    break;
                case 'toggleMcpServer':
                    await this.toggleMcpServer(message.serverName);
                    break;
                case 'restartMcpServer':
                    await this.restartMcpServer(message.serverName);
                    break;
                case 'deleteMcpServer':
                    await this.deleteMcpServer(message.serverName);
                    break;
                case 'refreshAllMcpServers':
                    await this.refreshAllMcpServers();
                    break;
                case 'openMcpSettings':
                    await this.openMcpSettings();
                    break;
                case 'saveApiConfig':
                    await this.saveApiConfig(message.config);
                    break;
                case 'webviewDidLaunch':
                    // Webview is ready, send initial session info
                    this.sendSessionInfo();
                    break;
                case 'updatePermissions':
                    await this.updatePermissions(message.permissions);
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

    private async sendSettingsToWebview(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');

            // Get MCP servers with status
            const servers = config.get<any[]>('mcp.servers', []);
            const allTools = this.mcpClient.getAllTools();
            const mcpEnabled = config.get<boolean>('mcp.enabled', true);

            const mcpServers = servers.map(server => {
                const serverTools = allTools.filter(t => t.serverName === server.name);
                const isEnabled = !server.disabled;
                const isConnected = serverTools.length > 0 && isEnabled;

                return {
                    name: server.name,
                    type: server.type || 'local',
                    command: server.command,
                    args: server.args,
                    env: server.env,
                    url: server.url,
                    disabled: server.disabled || false,
                    status: isConnected ? 'connected' : (isEnabled ? 'disconnected' : 'disconnected'),
                    toolCount: serverTools.length,
                    tools: serverTools.map(t => ({
                        name: t.name,
                        description: t.description,
                        inputSchema: t.inputSchema,
                        serverName: t.serverName
                    }))
                };
            });

            // Get API provider config
            const apiConfig = {
                provider: config.get<string>('provider', 'anthropic'),
                apiKey: config.get<string>('apiKey', ''),
                model: config.get<string>('model', 'claude-3-5-sonnet-20241022'),
                temperature: config.get<number>('temperature', 0.7),
                maxTokens: config.get<number>('maxTokens', 4096),
                baseUrl: config.get<string>('baseUrl', '')
            };

            // Get permissions config
            const permissions = {
                autoApproveEnabled: config.get<boolean>('permissions.autoApproveEnabled', false),
                alwaysAllowReadOnly: config.get<boolean>('permissions.alwaysAllowReadOnly', false),
                alwaysAllowWrite: config.get<boolean>('permissions.alwaysAllowWrite', false),
                alwaysAllowBrowser: config.get<boolean>('permissions.alwaysAllowBrowser', false),
                alwaysAllowMcp: config.get<boolean>('permissions.alwaysAllowMcp', false),
                alwaysAllowExecute: config.get<boolean>('permissions.alwaysAllowExecute', false),
                alwaysAllowTodoList: config.get<boolean>('permissions.alwaysAllowTodoList', false),
                allowedCommands: config.get<string[]>('permissions.allowedCommands', []),
                allowedMaxRequests: config.get<number>('permissions.allowedMaxRequests'),
                allowedMaxCost: config.get<number>('permissions.allowedMaxCost')
            };

            this.view?.webview.postMessage({
                type: 'settingsLoaded',
                mcpServers,
                mcpEnabled,
                apiConfig,
                permissions
            });
        } catch (error) {
            console.error('Error sending settings to webview:', error);
        }
    }

    private async setMcpEnabled(enabled: boolean): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            await config.update('mcp.enabled', enabled, vscode.ConfigurationTarget.Workspace);

            if (enabled) {
                await this.loadMCPServers();
            } else {
                // Disconnect all servers when disabled
                await this.mcpClient.disconnectAll();
            }

            await this.sendSettingsToWebview();
        } catch (error) {
            console.error('Error setting MCP enabled:', error);
            vscode.window.showErrorMessage(`Failed to ${enabled ? 'enable' : 'disable'} MCP: ${error}`);
        }
    }

    private async toggleMcpServer(serverName: string): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const servers = config.get<any[]>('mcp.servers', []);

            const serverIndex = servers.findIndex(s => s.name === serverName);
            if (serverIndex === -1) {
                throw new Error(`Server ${serverName} not found`);
            }

            servers[serverIndex].disabled = !servers[serverIndex].disabled;
            await config.update('mcp.servers', servers, vscode.ConfigurationTarget.Workspace);

            await this.loadMCPServers();
            await this.sendSettingsToWebview();
        } catch (error) {
            console.error('Error toggling MCP server:', error);
            vscode.window.showErrorMessage(`Failed to toggle MCP server: ${error}`);
        }
    }

    private async restartMcpServer(serverName: string): Promise<void> {
        try {
            await this.mcpClient.restartServer(serverName);
            await this.sendSettingsToWebview();
        } catch (error) {
            console.error('Error restarting MCP server:', error);
            vscode.window.showErrorMessage(`Failed to restart MCP server: ${error}`);
        }
    }

    private async deleteMcpServer(serverName: string): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const servers = config.get<any[]>('mcp.servers', []);

            const updatedServers = servers.filter(s => s.name !== serverName);
            await config.update('mcp.servers', updatedServers, vscode.ConfigurationTarget.Workspace);

            await this.loadMCPServers();
            await this.sendSettingsToWebview();
            vscode.window.showInformationMessage(`MCP server '${serverName}' deleted successfully`);
        } catch (error) {
            console.error('Error deleting MCP server:', error);
            vscode.window.showErrorMessage(`Failed to delete MCP server: ${error}`);
        }
    }

    private async refreshAllMcpServers(): Promise<void> {
        try {
            await this.loadMCPServers();
            await this.sendSettingsToWebview();
            vscode.window.showInformationMessage('MCP servers refreshed successfully');
        } catch (error) {
            console.error('Error refreshing MCP servers:', error);
            vscode.window.showErrorMessage(`Failed to refresh MCP servers: ${error}`);
        }
    }

    private async openMcpSettings(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'azureDevOps.ai.mcp');
        } catch (error) {
            console.error('Error opening MCP settings:', error);
            vscode.window.showErrorMessage(`Failed to open MCP settings: ${error}`);
        }
    }

    private async saveApiConfig(config: any): Promise<void> {
        try {
            const workspaceConfig = vscode.workspace.getConfiguration('azureDevOps.ai');

            await workspaceConfig.update('provider', config.provider, vscode.ConfigurationTarget.Workspace);
            if (config.apiKey) {
                await workspaceConfig.update('apiKey', config.apiKey, vscode.ConfigurationTarget.Workspace);
            }
            await workspaceConfig.update('model', config.model, vscode.ConfigurationTarget.Workspace);
            await workspaceConfig.update('temperature', config.temperature, vscode.ConfigurationTarget.Workspace);
            await workspaceConfig.update('maxTokens', config.maxTokens, vscode.ConfigurationTarget.Workspace);
            if (config.baseUrl) {
                await workspaceConfig.update('baseUrl', config.baseUrl, vscode.ConfigurationTarget.Workspace);
            }

            // Update API client with new config
            this.apiClient.updateConfig();

            vscode.window.showInformationMessage('API configuration saved successfully');
            await this.sendSettingsToWebview();
        } catch (error) {
            console.error('Error saving API config:', error);
            vscode.window.showErrorMessage(`Failed to save API configuration: ${error}`);
        }
    }

    private async updatePermissions(permissions: any): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');

            // Update each permission field
            if (permissions.autoApproveEnabled !== undefined) {
                await config.update('permissions.autoApproveEnabled', permissions.autoApproveEnabled, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.alwaysAllowReadOnly !== undefined) {
                await config.update('permissions.alwaysAllowReadOnly', permissions.alwaysAllowReadOnly, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.alwaysAllowWrite !== undefined) {
                await config.update('permissions.alwaysAllowWrite', permissions.alwaysAllowWrite, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.alwaysAllowBrowser !== undefined) {
                await config.update('permissions.alwaysAllowBrowser', permissions.alwaysAllowBrowser, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.alwaysAllowMcp !== undefined) {
                await config.update('permissions.alwaysAllowMcp', permissions.alwaysAllowMcp, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.alwaysAllowExecute !== undefined) {
                await config.update('permissions.alwaysAllowExecute', permissions.alwaysAllowExecute, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.alwaysAllowTodoList !== undefined) {
                await config.update('permissions.alwaysAllowTodoList', permissions.alwaysAllowTodoList, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.allowedCommands !== undefined) {
                await config.update('permissions.allowedCommands', permissions.allowedCommands, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.allowedMaxRequests !== undefined) {
                await config.update('permissions.allowedMaxRequests', permissions.allowedMaxRequests, vscode.ConfigurationTarget.Workspace);
            }
            if (permissions.allowedMaxCost !== undefined) {
                await config.update('permissions.allowedMaxCost', permissions.allowedMaxCost, vscode.ConfigurationTarget.Workspace);
            }

            await this.sendSettingsToWebview();
        } catch (error) {
            console.error('Error updating permissions:', error);
            vscode.window.showErrorMessage(`Failed to update permissions: ${error}`);
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
