import * as vscode from 'vscode';
import { Message, ContentBlock } from './api-client';

/**
 * Options for rewind operations
 */
export interface RewindOptions {
    includeTargetMessage?: boolean;
    skipCleanup?: boolean;
}

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
     * Rewind conversation to a specific timestamp
     * This is the core method for editing/deleting messages
     */
    async rewindToTimestamp(ts: number, options: RewindOptions = {}): Promise<void> {
        const { includeTargetMessage = false, skipCleanup = false } = options;

        this.outputChannel.appendLine(`[MessageManager] Rewinding to timestamp ${ts} (include: ${includeTargetMessage})`);

        const { uiIndex, apiIndex } = this.findMessageIndex(ts);

        if (uiIndex === -1) {
            throw new Error(`Message with timestamp ${ts} not found`);
        }

        // Calculate cutoff index
        const uiCutoff = includeTargetMessage ? uiIndex + 1 : uiIndex;
        const apiCutoff = includeTargetMessage ? apiIndex + 1 : apiIndex;

        // Truncate UI messages
        const removedUICount = this.uiMessages.length - uiCutoff;
        this.uiMessages = this.uiMessages.slice(0, uiCutoff);

        // Truncate API messages (if we found a corresponding index)
        if (apiIndex !== -1 && apiCutoff !== -1) {
            const removedAPICount = this.apiMessages.length - apiCutoff;
            this.apiMessages = this.apiMessages.slice(0, apiCutoff);
            this.outputChannel.appendLine(`[MessageManager] Removed ${removedAPICount} API messages`);
        } else {
            // Fallback: Remove all messages from target timestamp onwards
            this.apiMessages = this.apiMessages.filter((msg, idx) => idx < apiIndex || apiIndex === -1);
        }

        this.outputChannel.appendLine(`[MessageManager] Removed ${removedUICount} UI messages`);

        // Cleanup orphaned references if needed
        if (!skipCleanup) {
            await this.cleanupAfterTruncation();
        }
    }

    /**
     * Edit a message by timestamp
     * Follows Roo Code's pattern: rewind, then resubmit with new content
     */
    async editMessage(ts: number, newContent: string): Promise<void> {
        this.outputChannel.appendLine(`[MessageManager] Editing message (ts: ${ts})`);

        const { uiIndex } = this.findMessageIndex(ts);

        if (uiIndex === -1) {
            throw new Error(`Message with timestamp ${ts} not found`);
        }

        const targetMessage = this.uiMessages[uiIndex];

        if (targetMessage.role !== 'user') {
            throw new Error('Can only edit user messages');
        }

        // Find the nearest preceding user message to rewind to
        let rewindIndex = uiIndex;
        for (let i = uiIndex; i >= 0; i--) {
            if (this.uiMessages[i].role === 'user') {
                rewindIndex = i;
                break;
            }
        }

        const rewindTs = this.uiMessages[rewindIndex].ts;

        // Rewind to that message (excluding it)
        await this.rewindToTimestamp(rewindTs, { includeTargetMessage: false });

        // The new message will be added by the caller (APIClient)
        this.outputChannel.appendLine(`[MessageManager] Ready for resubmission of edited message`);
    }

    /**
     * Delete a message by timestamp
     */
    async deleteMessage(ts: number): Promise<void> {
        this.outputChannel.appendLine(`[MessageManager] Deleting message (ts: ${ts})`);

        const { uiIndex } = this.findMessageIndex(ts);

        if (uiIndex === -1) {
            throw new Error(`Message with timestamp ${ts} not found`);
        }

        // Rewind to before this message (excluding it)
        await this.rewindToTimestamp(ts, { includeTargetMessage: false });

        this.outputChannel.appendLine(`[MessageManager] Message deleted (ts: ${ts})`);
    }

    /**
     * Cleanup orphaned references after truncation
     */
    private async cleanupAfterTruncation(): Promise<void> {
        // In a more complex implementation, this would clean up:
        // - Orphaned tool results
        // - Broken message chains
        // - Summary references
        // For now, we keep it simple
        this.outputChannel.appendLine(`[MessageManager] Cleanup completed`);
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
