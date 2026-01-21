import * as vscode from 'vscode';
import { Message, ContentBlock } from './api-client';

/**
 * UI Message (what users see in chat)
 */
export interface UIMessage {
    ts: number; // Timestamp as unique identifier
    role: 'user' | 'assistant' | 'system';
    type: 'text' | 'error' | 'tool_use' | 'tool_result';
    text?: string;
    content?: ContentBlock[];
    partial?: boolean; // Still streaming
    inputTokens?: number;
    outputTokens?: number;
}

/**
 * Edit metadata for tracking edits
 */
export interface EditMetadata {
    originalTs: number;
    editedAt: number;
    editCount: number;
}

/**
 * Message Manager
 * Handles conversation history, message editing, and rewind operations
 * Based on Roo Code's implementation pattern
 */
export class MessageManager {
    private uiMessages: UIMessage[] = [];
    private apiMessages: Message[] = [];
    private outputChannel: vscode.OutputChannel;
    private messageCounter: number = 0;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Generate unique timestamp for new messages
     */
    private generateTimestamp(): number {
        return Date.now() + this.messageCounter++;
    }

    /**
     * Add a user message
     */
    addUserMessage(text: string): UIMessage {
        const ts = this.generateTimestamp();
        const uiMessage: UIMessage = {
            ts,
            role: 'user',
            type: 'text',
            text
        };

        const apiMessage: Message = {
            role: 'user',
            content: text
        };

        this.uiMessages.push(uiMessage);
        this.apiMessages.push(apiMessage);

        this.outputChannel.appendLine(`[MessageManager] Added user message (ts: ${ts})`);
        return uiMessage;
    }

    /**
     * Add an assistant message
     */
    addAssistantMessage(content: string | ContentBlock[], partial: boolean = false): UIMessage {
        const ts = this.generateTimestamp();
        const uiMessage: UIMessage = {
            ts,
            role: 'assistant',
            type: 'text',
            partial
        };

        if (typeof content === 'string') {
            uiMessage.text = content;
        } else {
            uiMessage.content = content;
        }

        const apiMessage: Message = {
            role: 'assistant',
            content
        };

        this.uiMessages.push(uiMessage);
        this.apiMessages.push(apiMessage);

        this.outputChannel.appendLine(`[MessageManager] Added assistant message (ts: ${ts}, partial: ${partial})`);
        return uiMessage;
    }

    /**
     * Update the last assistant message (for streaming)
     */
    updateLastAssistantMessage(content: string | ContentBlock[], partial: boolean = false): void {
        const lastMessage = this.uiMessages[this.uiMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            if (typeof content === 'string') {
                lastMessage.text = content;
            } else {
                lastMessage.content = content;
            }
            lastMessage.partial = partial;

            // Update API message too
            const lastApiMessage = this.apiMessages[this.apiMessages.length - 1];
            if (lastApiMessage && lastApiMessage.role === 'assistant') {
                lastApiMessage.content = content;
            }
        }
    }

    /**
     * Get all UI messages
     */
    getUIMessages(): UIMessage[] {
        return [...this.uiMessages];
    }

    /**
     * Get all API messages
     */
    getAPIMessages(): Message[] {
        return [...this.apiMessages];
    }

    /**
     * Find message index by timestamp
     */
    private findMessageIndex(ts: number): { uiIndex: number; apiIndex: number } {
        const uiIndex = this.uiMessages.findIndex(m => m.ts === ts);

        // For API messages, find the corresponding user message
        let apiIndex = -1;
        if (uiIndex !== -1) {
            const targetMessage = this.uiMessages[uiIndex];

            // Count how many user messages come before this one
            let userCount = 0;
            for (let i = 0; i < uiIndex; i++) {
                if (this.uiMessages[i].role === 'user') {
                    userCount++;
                }
            }

            // Find the corresponding API message
            let apiUserCount = 0;
            for (let i = 0; i < this.apiMessages.length; i++) {
                if (this.apiMessages[i].role === 'user') {
                    if (apiUserCount === userCount) {
                        apiIndex = i;
                        break;
                    }
                    apiUserCount++;
                }
            }
        }

        return { uiIndex, apiIndex };
    }


    /**
     * Clear all messages
     */
    clear(): void {
        this.uiMessages = [];
        this.apiMessages = [];
        this.messageCounter = 0;
        this.outputChannel.appendLine(`[MessageManager] All messages cleared`);
    }

    /**
     * Get statistics
     */
    getStats(): {
        uiMessageCount: number;
        apiMessageCount: number;
        userMessageCount: number;
        assistantMessageCount: number;
    } {
        const userMessageCount = this.uiMessages.filter(m => m.role === 'user').length;
        const assistantMessageCount = this.uiMessages.filter(m => m.role === 'assistant').length;

        return {
            uiMessageCount: this.uiMessages.length,
            apiMessageCount: this.apiMessages.length,
            userMessageCount,
            assistantMessageCount
        };
    }

    /**
     * Export messages for persistence
     */
    exportMessages(): { ui: UIMessage[]; api: Message[] } {
        return {
            ui: [...this.uiMessages],
            api: [...this.apiMessages]
        };
    }

    /**
     * Import messages from persistence
     */
    importMessages(data: { ui: UIMessage[]; api: Message[] }): void {
        this.uiMessages = data.ui;
        this.apiMessages = data.api;

        // Reset counter to max timestamp + 1
        const maxTs = Math.max(...this.uiMessages.map(m => m.ts), 0);
        this.messageCounter = maxTs + 1;

        this.outputChannel.appendLine(`[MessageManager] Imported ${this.uiMessages.length} UI messages, ${this.apiMessages.length} API messages`);
    }
}
