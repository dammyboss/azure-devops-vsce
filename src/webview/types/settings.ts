/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  name: string;
  type: 'local' | 'remote';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

/**
 * MCP Server Status
 */
export enum MCPServerStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
  Reconnecting = 'reconnecting'
}

/**
 * MCP Server with Status (for UI display)
 */
export interface MCPServerWithStatus extends MCPServerConfig {
  status: MCPServerStatus;
  toolCount: number;
  lastError?: string;
  uptime?: number;
  tools?: MCPTool[];
}

/**
 * MCP Tool
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
  alwaysAllow?: boolean;
}

/**
 * AI Provider Configuration
 */
export type AIProvider =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'openrouter'
  | 'ollama'
  | 'azure';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  customHeaders?: Record<string, string>;
}

/**
 * Permissions Configuration
 */
export interface PermissionsConfig {
  autoApproveEnabled: boolean;
  alwaysAllowReadOnly: boolean;
  alwaysAllowWrite: boolean;
  alwaysAllowBrowser: boolean;
  alwaysAllowMcp: boolean;
  alwaysAllowExecute: boolean;
  alwaysAllowTodoList: boolean;
  allowedCommands: string[];
  allowedMaxRequests?: number;
  allowedMaxCost?: number;
}

/**
 * Extension Settings
 */
export interface ExtensionSettings {
  aiProvider: AIProviderConfig;
  mcpServers: MCPServerConfig[];
  mcpEnabled: boolean;
  permissions: PermissionsConfig;
}
