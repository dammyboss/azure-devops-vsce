import * as vscode from 'vscode';
import * as cp from 'child_process';

export interface MCPServerConfig {
    name: string;
    type: 'local' | 'remote';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
}

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
    serverName: string;
}

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

class MCPServerConnection {
    private process: cp.ChildProcess | null = null;
    private requestId = 0;
    private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    private buffer = '';
    private tools: MCPTool[] = [];
    private config: MCPServerConfig;
    private outputChannel: vscode.OutputChannel;
    private isConnected = false;

    constructor(config: MCPServerConfig, outputChannel: vscode.OutputChannel) {
        this.config = config;
        this.outputChannel = outputChannel;
    }

    async connect(): Promise<void> {
        if (this.config.type === 'remote' && this.config.url) {
            await this.connectRemote();
        } else if (this.config.type === 'local' && this.config.command) {
            await this.connectLocal();
        } else {
            throw new Error(`Invalid MCP server config: ${this.config.name}`);
        }
    }

    private async connectLocal(): Promise<void> {
        return new Promise((resolve, reject) => {
            const env = { ...process.env, ...this.config.env };

            this.outputChannel.appendLine(`[${this.config.name}] Starting local MCP server: ${this.config.command} ${(this.config.args || []).join(' ')}`);

            this.process = cp.spawn(this.config.command!, this.config.args || [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env
            });

            this.process.stdout?.on('data', (data) => {
                this.handleData(data.toString());
            });

            this.process.stderr?.on('data', (data) => {
                this.outputChannel.appendLine(`[${this.config.name}] stderr: ${data.toString()}`);
            });

            this.process.on('error', (error) => {
                this.outputChannel.appendLine(`[${this.config.name}] Process error: ${error.message}`);
                vscode.window.showErrorMessage(`MCP server '${this.config.name}' error: ${error.message}`);
                reject(error);
            });

            this.process.on('close', (code) => {
                this.outputChannel.appendLine(`[${this.config.name}] Process closed with code ${code}`);
                this.isConnected = false;
            });

            setTimeout(async () => {
                try {
                    await this.initialize();
                    this.isConnected = true;
                    this.outputChannel.appendLine(`[${this.config.name}] Connected with ${this.tools.length} tools`);
                    vscode.window.showInformationMessage(`MCP server '${this.config.name}' connected (${this.tools.length} tools)`);
                    resolve();
                } catch (error: any) {
                    this.outputChannel.appendLine(`[${this.config.name}] Init failed: ${error.message}`);
                    vscode.window.showErrorMessage(`MCP server '${this.config.name}' init failed: ${error.message}`);
                    reject(error);
                }
            }, 500);
        });
    }

    private async connectRemote(): Promise<void> {
        try {
            const response = await fetch(this.config.url!, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2024-11-05',
                        capabilities: {},
                        clientInfo: { name: 'azure-devops-vscode', version: '1.0.0' }
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';
            let result: any;

            if (contentType.includes('text/event-stream')) {
                const text = await response.text();
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        result = JSON.parse(line.substring(6));
                        break;
                    }
                }
            } else {
                result = await response.json();
            }

            if (result.error) {
                throw new Error(result.error.message);
            }

            const toolsResponse = await fetch(this.config.url!, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/list',
                    params: {}
                })
            });

            const toolsContentType = toolsResponse.headers.get('content-type') || '';
            let toolsResult: any;

            if (toolsContentType.includes('text/event-stream')) {
                const toolsText = await toolsResponse.text();
                const toolsLines = toolsText.split('\n');
                for (const line of toolsLines) {
                    if (line.startsWith('data: ')) {
                        toolsResult = JSON.parse(line.substring(6));
                        break;
                    }
                }
            } else {
                toolsResult = await toolsResponse.json();
            }

            if (toolsResult.result?.tools) {
                this.tools = toolsResult.result.tools.map((tool: any) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    serverName: this.config.name
                }));
            }

            this.isConnected = true;
            this.outputChannel.appendLine(`[${this.config.name}] Connected to remote MCP server with ${this.tools.length} tools`);
            vscode.window.showInformationMessage(`MCP server '${this.config.name}' connected (${this.tools.length} tools)`);
        } catch (error: any) {
            this.outputChannel.appendLine(`[${this.config.name}] Remote connection failed: ${error.message}`);
            vscode.window.showErrorMessage(`MCP server '${this.config.name}' connection failed: ${error.message}`);
            throw error;
        }
    }

    private async initialize(): Promise<void> {
        const initResult = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'azure-devops-vscode', version: '1.0.0' }
        });

        this.outputChannel.appendLine(`[${this.config.name}] Initialized: ${JSON.stringify(initResult)}`);
        this.sendNotification('notifications/initialized', {});

        const toolsResult = await this.sendRequest('tools/list', {});
        if (toolsResult?.tools) {
            this.tools = toolsResult.tools.map((tool: any) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                serverName: this.config.name
            }));
        }
    }

    private handleData(data: string): void {
        this.buffer += data;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const message = JSON.parse(line);
                this.handleMessage(message);
            } catch (error) {
                this.outputChannel.appendLine(`[${this.config.name}] Parse error: ${line}`);
            }
        }
    }

    private handleMessage(message: JsonRpcResponse): void {
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
            const { resolve, reject } = this.pendingRequests.get(message.id)!;
            this.pendingRequests.delete(message.id);

            if (message.error) {
                reject(new Error(message.error.message));
            } else {
                resolve(message.result);
            }
        }
    }

    private sendRequest(method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

            this.pendingRequests.set(id, { resolve, reject });

            const message = JSON.stringify(request) + '\n';
            this.process?.stdin?.write(message);

            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }

    private sendNotification(method: string, params: any): void {
        const notification = { jsonrpc: '2.0', method, params };
        const message = JSON.stringify(notification) + '\n';
        this.process?.stdin?.write(message);
    }

    async callTool(toolName: string, args: any): Promise<any> {
        if (this.config.type === 'remote' && this.config.url) {
            const response = await fetch(this.config.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: ++this.requestId,
                    method: 'tools/call',
                    params: { name: toolName, arguments: args }
                })
            });

            const contentType = response.headers.get('content-type') || '';
            let result: any;

            if (contentType.includes('text/event-stream')) {
                const text = await response.text();
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        result = JSON.parse(line.substring(6));
                        break;
                    }
                }
            } else {
                result = await response.json();
            }

            if (result.error) {
                throw new Error(result.error.message);
            }
            return result.result;
        } else {
            return this.sendRequest('tools/call', { name: toolName, arguments: args });
        }
    }

    getTools(): MCPTool[] {
        return this.tools;
    }

    isActive(): boolean {
        return this.isConnected;
    }

    disconnect(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.isConnected = false;
    }
}

export class MCPClient {
    private servers = new Map<string, MCPServerConnection>();
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    async loadServers(configs: MCPServerConfig[]): Promise<void> {
        for (const [name, server] of this.servers) {
            server.disconnect();
        }
        this.servers.clear();

        for (const config of configs) {
            try {
                const server = new MCPServerConnection(config, this.outputChannel);
                await server.connect();
                this.servers.set(config.name, server);
            } catch (error: any) {
                this.outputChannel.appendLine(`Failed to connect to MCP server ${config.name}: ${error.message}`);
            }
        }
    }

    async connectServer(config: MCPServerConfig): Promise<boolean> {
        try {
            if (this.servers.has(config.name)) {
                this.servers.get(config.name)?.disconnect();
            }

            const server = new MCPServerConnection(config, this.outputChannel);
            await server.connect();
            this.servers.set(config.name, server);
            return true;
        } catch (error: any) {
            this.outputChannel.appendLine(`Failed to connect to MCP server ${config.name}: ${error.message}`);
            return false;
        }
    }

    disconnectServer(name: string): void {
        const server = this.servers.get(name);
        if (server) {
            server.disconnect();
            this.servers.delete(name);
        }
    }

    getAllTools(): MCPTool[] {
        const tools: MCPTool[] = [];
        for (const [_, server] of this.servers) {
            if (server.isActive()) {
                tools.push(...server.getTools());
            }
        }
        return tools;
    }

    getToolsForAPI(format: 'anthropic' | 'azure'): any[] {
        const mcpTools = this.getAllTools();

        if (format === 'anthropic') {
            return mcpTools.map(tool => ({
                name: `mcp_${tool.serverName}_${tool.name}`.substring(0, 64),
                description: `[MCP: ${tool.serverName}] ${tool.description}`,
                input_schema: tool.inputSchema
            }));
        } else {
            return mcpTools.map(tool => ({
                type: 'function',
                function: {
                    name: `mcp_${tool.serverName}_${tool.name}`.substring(0, 64),
                    description: `[MCP: ${tool.serverName}] ${tool.description}`,
                    parameters: tool.inputSchema
                }
            }));
        }
    }

    async callTool(fullToolName: string, args: any): Promise<{ success: boolean; result: string; error?: string }> {
        const allTools = this.getAllTools();
        const tool = allTools.find(t => {
            const name = `mcp_${t.serverName}_${t.name}`.substring(0, 64);
            return fullToolName === name;
        });

        if (!tool) {
            return { success: false, result: '', error: `MCP tool not found: ${fullToolName}` };
        }

        const server = this.servers.get(tool.serverName);
        if (!server || !server.isActive()) {
            return { success: false, result: '', error: `MCP server not connected: ${tool.serverName}` };
        }

        try {
            const result = await server.callTool(tool.name, args);
            let content = '';
            if (result?.content) {
                for (const block of result.content) {
                    if (block.type === 'text') {
                        content += block.text;
                    }
                }
            }
            return { success: true, result: content || JSON.stringify(result) };
        } catch (error: any) {
            return { success: false, result: '', error: error.message };
        }
    }

    getActiveServers(): string[] {
        const active: string[] = [];
        for (const [name, server] of this.servers) {
            if (server.isActive()) {
                active.push(name);
            }
        }
        return active;
    }

    disconnectAll(): void {
        for (const [_, server] of this.servers) {
            server.disconnect();
        }
        this.servers.clear();
    }
}
