import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as http from 'http';

export class AzureDevOpsAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
    private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    private _disposable: vscode.Disposable;
    private _sessions: vscode.AuthenticationSession[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._disposable = vscode.Disposable.from(
            vscode.authentication.registerAuthenticationProvider('azure-devops', 'Azure DevOps', this, { supportsMultipleAccounts: false })
        );
        this.loadSessions();
    }

    get onDidChangeSessions() {
        return this._sessionChangeEmitter.event;
    }

    async getSessions(scopes?: string[]): Promise<vscode.AuthenticationSession[]> {
        return this._sessions;
    }

    async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
        // Get organization URL first
        const orgUrlInput = await vscode.window.showInputBox({
            prompt: 'Enter your Azure DevOps organization URL (without project)',
            placeHolder: 'https://dev.azure.com/your-organization',
            validateInput: (value) => {
                if (!value || !value.startsWith('http')) {
                    return 'Please enter a valid URL';
                }
                // Check if URL contains a project (has more than 4 parts)
                const parts = value.replace(/\/+$/, '').split('/');
                if (parts.length > 4) {
                    return 'Please enter only the organization URL (e.g., https://dev.azure.com/your-org), not including the project';
                }
                return null;
            }
        });

        if (!orgUrlInput) {
            throw new Error('Organization URL is required');
        }

        // Extract just the organization URL (remove any project path)
        const urlParts = orgUrlInput.replace(/\/+$/, '').split('/');
        const orgUrl = urlParts.slice(0, 4).join('/'); // https://dev.azure.com/org-name

        // Use Microsoft account authentication with Azure DevOps resource
        try {
            const msSession = await vscode.authentication.getSession('microsoft', [
                '499b84ac-1321-427f-aa17-267ca6975798/.default'
            ], { createIfNone: true });

            if (!msSession) {
                throw new Error('Microsoft authentication failed');
            }

            const session: vscode.AuthenticationSession = {
                id: `azure-devops-${Date.now()}`,
                accessToken: msSession.accessToken,
                account: {
                    id: orgUrl,
                    label: msSession.account.label
                },
                scopes: scopes
            };

            this._sessions.push(session);
            await this.storeSessions();
            this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });

            return session;
        } catch (error) {
            vscode.window.showErrorMessage(`Authentication failed: ${error}`);
            throw error;
        }
    }

    async removeSession(sessionId: string): Promise<void> {
        const sessionIndex = this._sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex > -1) {
            const session = this._sessions[sessionIndex];
            this._sessions.splice(sessionIndex, 1);
            await this.storeSessions();
            this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
        }
    }

    public async disconnect(): Promise<void> {
        // Clear all sessions
        for (const session of this._sessions) {
            this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
        }
        this._sessions = [];
        await this.storeSessions();
    }

    private async storeSessions(): Promise<void> {
        await this.context.secrets.store('azure-devops-sessions', JSON.stringify(this._sessions));
    }

    private async loadSessions(): Promise<void> {
        const stored = await this.context.secrets.get('azure-devops-sessions');
        if (stored) {
            this._sessions = JSON.parse(stored);
        }
    }

    dispose() {
        this._disposable.dispose();
    }
}
