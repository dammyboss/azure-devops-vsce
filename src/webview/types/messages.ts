export type MessageRole = 'user' | 'assistant';

export type MessageType =
  | 'text'
  | 'permission_request'
  | 'tool_use'
  | 'error';

export interface BaseMessage {
  id: string;
  timestamp: number;
  role: MessageRole;
  type: MessageType;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
  isStreaming?: boolean;
}

export interface PermissionRequest extends BaseMessage {
  type: 'permission_request';
  serverName: string;
  toolName: string;
  toolInput: any;
  status: 'pending' | 'approved' | 'denied';
  alwaysAllow?: boolean;
  result?: string;  // Tool execution result
  error?: string;   // Tool execution error
}

export interface ToolUseMessage extends BaseMessage {
  type: 'tool_use';
  toolName: string;
  toolInput: any;
  status: 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  error: string;
}

export type ChatMessage = TextMessage | PermissionRequest | ToolUseMessage | ErrorMessage;

export interface ExtensionMessage {
  type: string;
  [key: string]: any;
}
