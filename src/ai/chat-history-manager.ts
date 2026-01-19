import * as vscode from 'vscode';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatHistoryItem {
    id: number;
    timestamp: number;
    preview: string;
    messages: ChatMessage[];
}

export class ChatHistoryManager {
    private static instance: ChatHistoryManager;
    private readonly STORAGE_KEY = 'azuredevops.chatHistory';
    private readonly MAX_HISTORY = 20;
    private context: vscode.ExtensionContext;
    private webviews: Set<vscode.Webview> = new Set();

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public static getInstance(context: vscode.ExtensionContext): ChatHistoryManager {
        if (!ChatHistoryManager.instance) {
            ChatHistoryManager.instance = new ChatHistoryManager(context);
        }
        return ChatHistoryManager.instance;
    }

    public registerWebview(webview: vscode.Webview): void {
        this.webviews.add(webview);
    }

    public unregisterWebview(webview: vscode.Webview): void {
        this.webviews.delete(webview);
    }

    public async getHistory(): Promise<ChatHistoryItem[]> {
        return this.context.globalState.get<ChatHistoryItem[]>(this.STORAGE_KEY, []);
    }

    public async saveChat(chat: ChatHistoryItem): Promise<void> {
        const history = await this.getHistory();
        history.unshift(chat);
        
        if (history.length > this.MAX_HISTORY) {
            history.splice(this.MAX_HISTORY);
        }

        await this.context.globalState.update(this.STORAGE_KEY, history);
        this.broadcastHistoryUpdate(history);
    }

    public async clearHistory(): Promise<void> {
        await this.context.globalState.update(this.STORAGE_KEY, []);
        this.broadcastHistoryUpdate([]);
    }

    private broadcastHistoryUpdate(history: ChatHistoryItem[]): void {
        this.webviews.forEach(webview => {
            webview.postMessage({ type: 'historyUpdated', history });
        });
    }
}
