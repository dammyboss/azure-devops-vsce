import * as vscode from 'vscode';
import { APIClient, StreamCallbacks } from './api-client';
import { MCPClient } from './mcp-client';

export class AzureDevOpsChatParticipant {
    private apiClient: APIClient;
    private mcpClient: MCPClient;
    private outputChannel: vscode.OutputChannel;

    constructor(
        outputChannel: vscode.OutputChannel,
        context: vscode.ExtensionContext
    ) {
        this.outputChannel = outputChannel;
        this.apiClient = APIClient.getInstance(outputChannel, context);
        this.mcpClient = new MCPClient(outputChannel, context);
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
    }

    public async handleChatRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        this.outputChannel.appendLine(`[Chat] Received request: ${request.prompt}`);

        // Handle cancellation
        if (token.isCancellationRequested) {
            return;
        }

        // Create callbacks that stream to VSCode's chat UI
        const callbacks: StreamCallbacks = {
            onText: (text: string) => {
                if (token.isCancellationRequested) return;
                stream.markdown(text);
            },
            onToolUse: (toolName: string, toolInput: any) => {
                this.outputChannel.appendLine(`[Chat] Tool use: ${toolName}`);
                // VSCode will show this in the chat UI automatically
            },
            onToolResult: (toolName: string, result: string, isError: boolean) => {
                this.outputChannel.appendLine(`[Chat] Tool result: ${toolName} - ${isError ? 'ERROR' : 'SUCCESS'}`);
                // We don't show tool results directly in chat - the LLM will interpret them
            },
            onError: (error: string) => {
                stream.markdown(`\n\n⚠️ Error: ${error}\n\n`);
            },
            onComplete: (inputTokens: number, outputTokens: number) => {
                this.outputChannel.appendLine(`[Chat] Complete - Input: ${inputTokens}, Output: ${outputTokens} tokens`);
            },
            onPermissionPrompt: async (id: string, serverName: string, toolName: string, toolInput: any) => {
                // Show permission prompt using VSCode's UI
                await this.handlePermissionPrompt(id, serverName, toolName, toolInput, stream);
            }
        };

        // Register cancellation handler
        token.onCancellationRequested(() => {
            this.apiClient.stop();
        });

        try {
            // Send the message to the API client
            await this.apiClient.sendMessage(request.prompt, callbacks);
        } catch (error: any) {
            if (error.message !== 'AbortError') {
                stream.markdown(`\n\n⚠️ Error: ${error.message}\n\n`);
            }
        }
    }

    private async handlePermissionPrompt(
        id: string,
        serverName: string,
        toolName: string,
        toolInput: any,
        stream: vscode.ChatResponseStream
    ): Promise<void> {
        // Show a nice permission request in the chat
        stream.markdown(`\n\n🔐 **Permission Required**\n\n`);
        stream.markdown(`Tool: \`${toolName}\` on server \`${serverName}\`\n\n`);
        stream.markdown(`Input:\n\`\`\`json\n${JSON.stringify(toolInput, null, 2)}\n\`\`\`\n\n`);

        // Show VSCode quick pick for approval
        const options: vscode.QuickPickItem[] = [
            {
                label: '$(check) Allow Once',
                description: 'Allow this tool execution one time',
                detail: 'allow'
            },
            {
                label: '$(check-all) Always Allow',
                description: `Always allow ${toolName} on ${serverName}`,
                detail: 'allow-always'
            },
            {
                label: '$(x) Deny',
                description: 'Deny this tool execution',
                detail: 'deny'
            }
        ];

        const choice = await vscode.window.showQuickPick(options, {
            title: `Allow ${toolName} on ${serverName}?`,
            placeHolder: 'Select an option...',
            ignoreFocusOut: true
        });

        if (choice) {
            const action = choice.detail as 'allow' | 'allow-always' | 'deny';
            this.mcpClient.getPermissionsManager().respondToPermission(id, action);

            if (action === 'allow' || action === 'allow-always') {
                stream.markdown(`✅ Permission granted\n\n`);
            } else {
                stream.markdown(`❌ Permission denied\n\n`);
            }
        } else {
            // User cancelled the prompt
            this.mcpClient.getPermissionsManager().respondToPermission(id, 'deny');
            stream.markdown(`❌ Permission denied\n\n`);
        }
    }

    public getMCPClient(): MCPClient {
        return this.mcpClient;
    }
}
