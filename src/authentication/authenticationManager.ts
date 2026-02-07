import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

export interface AzureDevOpsConfig {
    organizationUrl: string;
    personalAccessToken: string;
    defaultProject?: string;
    defaultTeam?: string;
}

export interface ConnectionStatus {
    isConnected: boolean;
    organization?: string;
    project?: string;
    user?: string;
}

export class AuthenticationManager {
    private static readonly SCOPES = [
        '499b84ac-1321-427f-aa17-267ca6975798/.default' // Azure DevOps scope
    ];

    private context: vscode.ExtensionContext;
    private config: AzureDevOpsConfig | null = null;
    private axiosInstance: AxiosInstance | null = null;
    private connectionStatus: ConnectionStatus = { isConnected: false };
    private session: vscode.AuthenticationSession | undefined;
    private readonly onDidChangeSessionEmitter = new vscode.EventEmitter<vscode.AuthenticationSession | undefined>();
    public readonly onDidChangeSession = this.onDidChangeSessionEmitter.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadConfiguration().catch(() => {});
    }

    private async loadConfiguration(): Promise<void> {
        try {
            const storedSessionId = await this.context.secrets.get('ado-session-id');
            if (storedSessionId) {
                // Include tenant scope if user previously switched tenants
                const storedTenantId = await this.context.secrets.get('ado-tenant-id');
                const scopes = storedTenantId
                    ? [...AuthenticationManager.SCOPES, `VSCODE_TENANT:${storedTenantId}`]
                    : AuthenticationManager.SCOPES;

                const session = await vscode.authentication.getSession(
                    'microsoft',
                    scopes,
                    { silent: true }
                );

                if (session) {
                    this.session = session;
                    const config = vscode.workspace.getConfiguration('azureDevOps');
                    const organizationUrl = config.get<string>('organizationUrl', '');
                    const defaultProject = config.get<string>('defaultProject', '');
                    const defaultTeam = config.get<string>('defaultTeam', '');
                    
                    if (organizationUrl) {
                        this.config = {
                            organizationUrl: organizationUrl.replace(/\/+$/, ''),
                            personalAccessToken: session.accessToken,
                            defaultProject,
                            defaultTeam
                        };
                        this.createAxiosInstance();
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    }

    private createAxiosInstance(): void {
        if (!this.config) {
            return;
        }

        this.axiosInstance = axios.create({
            baseURL: this.config.organizationUrl,
            headers: {
                'Authorization': `Bearer ${this.config.personalAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor to ensure api-version is always added
        this.axiosInstance.interceptors.request.use(
            (config) => {
                // Debug log
                console.log('[Azure DevOps] Request URL:', (config.baseURL || '') + (config.url || ''));
                
                // Ensure api-version is in params for every request
                if (!config.params) {
                    config.params = {};
                }
                if (!config.params['api-version']) {
                    // Use version 7.1 for Azure DevOps Services
                    config.params['api-version'] = '7.1';
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Add response interceptor for error handling
        this.axiosInstance.interceptors.response.use(
            response => response,
            error => {
                if (error.response?.status === 401) {
                    vscode.window.showErrorMessage('Azure DevOps authentication failed. Please check your Personal Access Token.');
                    this.connectionStatus.isConnected = false;
                } else if (error.response?.status === 400) {
                    console.error('Bad request:', error.response?.data);
                } else if (error.response?.status === 404) {
                    console.error('Resource not found:', error.config?.url);
                }
                return Promise.reject(error);
            }
        );
    }

    public async autoConnect(): Promise<boolean> {
        if (!this.config || !this.axiosInstance) {
            return false;
        }

        try {
            // Test connection by getting projects
            const projectsResponse = await this.axiosInstance.get('/_apis/projects', {
                params: { '$top': 1, 'api-version': '7.1-preview.4' }
            });

            if (projectsResponse.data) {
                // Try to get user info
                try {
                    const connectionResponse = await this.axiosInstance.get('/_apis/connectionData', {
                        params: { 'api-version': '7.1-preview.1' }
                    });
                    const user = connectionResponse.data?.authenticatedUser?.providerDisplayName ||
                                 connectionResponse.data?.authenticatedUser?.displayName ||
                                 'Connected';
                    
                    this.connectionStatus = {
                        isConnected: true,
                        organization: this.config.organizationUrl,
                        user: user
                    };
                } catch {
                    // If we can't get user info, still mark as connected
                    this.connectionStatus = {
                        isConnected: true,
                        organization: this.config.organizationUrl,
                        user: 'Connected'
                    };
                }
                return true;
            }
        } catch (error: any) {
            console.error('Auto-connect failed:', error.message || error);
            this.connectionStatus.isConnected = false;
        }

        return false;
    }

    public async connect(): Promise<boolean> {
        try {
            // Step 1: Get Microsoft session with account picker
            const session = await vscode.authentication.getSession(
                'microsoft',
                AuthenticationManager.SCOPES,
                {
                    clearSessionPreference: true,
                    forceNewSession: true
                }
            );

            if (!session) {
                throw new Error('Failed to create authentication session');
            }

            // Step 2: Ask if user wants to switch tenant
            const switchTenant = await vscode.window.showQuickPick(
                [
                    { label: 'Use primary tenant', value: false },
                    { label: 'Switch to different tenant', value: true }
                ],
                { placeHolder: 'Do you want to switch to a different tenant?' }
            );

            if (!switchTenant || !switchTenant.value) {
                // Use current session
                this.session = session;
                await this.context.secrets.store('ado-session-id', this.session.id);
                this.onDidChangeSessionEmitter.fire(this.session);
                vscode.commands.executeCommand('setContext', 'azureDevOps.signedIn', true);
                vscode.window.showInformationMessage('Successfully signed in! Opening setup wizard...');
                
                // Show setup wizard to configure organization and project
                await vscode.commands.executeCommand('azureDevOps.setupWizard');
                return true;
            }

            // Step 3: Show input box to enter tenant ID
            const tenantId = await vscode.window.showInputBox({
                prompt: 'Enter Tenant ID (you can find this in Azure Portal)',
                placeHolder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                validateInput: (value) => {
                    if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
                        return 'Please enter a valid tenant ID (GUID format)';
                    }
                    return null;
                }
            });

            if (!tenantId) {
                throw new Error('Tenant selection cancelled');
            }

            // Step 4: Re-authenticate with selected tenant
            this.session = await vscode.authentication.getSession(
                'microsoft',
                [`${AuthenticationManager.SCOPES[0]}`, `VSCODE_TENANT:${tenantId}`],
                { forceNewSession: true }
            );

            if (this.session) {
                await this.context.secrets.store('ado-session-id', this.session.id);
                await this.context.secrets.store('ado-tenant-id', tenantId);
                this.onDidChangeSessionEmitter.fire(this.session);
                vscode.commands.executeCommand('setContext', 'azureDevOps.signedIn', true);
                vscode.window.showInformationMessage('Successfully signed in! Opening setup wizard...');
                
                // Show setup wizard to configure organization and project
                await vscode.commands.executeCommand('azureDevOps.setupWizard');
                return true;
            }

            throw new Error('Failed to create authentication session');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to sign in: ${errorMessage}`);
            return false;
        }
    }

    public async disconnect(): Promise<void> {
        console.log('[AuthManager] Disconnecting...');
        if (this.session) {
            await this.context.secrets.delete('ado-session-id');
            await this.context.secrets.delete('ado-tenant-id');
            this.session = undefined;
            this.onDidChangeSessionEmitter.fire(undefined);
        }

        this.config = null;
        this.axiosInstance = null;
        this.connectionStatus = { isConnected: false };
        
        await vscode.workspace.getConfiguration('azureDevOps').update('organizationUrl', '', true);
        await vscode.workspace.getConfiguration('azureDevOps').update('defaultProject', '', true);
        await vscode.workspace.getConfiguration('azureDevOps').update('defaultTeam', '', true);

        vscode.commands.executeCommand('setContext', 'azureDevOps.signedIn', false);
        vscode.commands.executeCommand('setContext', 'azureDevOps.connected', false);
        console.log('[AuthManager] Disconnected - azureDevOps.signedIn = false');
        vscode.window.showInformationMessage('Successfully signed out from Azure DevOps');
    }

    public async refreshConfiguration(): Promise<void> {
        await this.loadConfiguration();
        if (this.config && this.axiosInstance) {
            await this.autoConnect();
        }
    }

    public async getSession(): Promise<vscode.AuthenticationSession | undefined> {
        if (this.session) {
            return this.session;
        }

        try {
            const storedSessionId = await this.context.secrets.get('ado-session-id');
            if (storedSessionId) {
                // Include tenant scope if user previously switched tenants
                const storedTenantId = await this.context.secrets.get('ado-tenant-id');
                const scopes = storedTenantId
                    ? [...AuthenticationManager.SCOPES, `VSCODE_TENANT:${storedTenantId}`]
                    : AuthenticationManager.SCOPES;

                const session = await vscode.authentication.getSession(
                    'microsoft',
                    scopes,
                    { silent: true }
                );

                if (session) {
                    this.session = session;
                    this.onDidChangeSessionEmitter.fire(this.session);
                    return this.session;
                }
            }
        } catch (error) {
            console.error('Failed to restore session:', error);
        }

        return undefined;
    }

    public async initialize(): Promise<void> {
        try {
            const session = await this.getSession();
            console.log('[AuthManager] Initialize - Session exists:', !!session);
            if (session) {
                vscode.commands.executeCommand('setContext', 'azureDevOps.signedIn', true);
                console.log('[AuthManager] Set azureDevOps.signedIn = true');
            } else {
                vscode.commands.executeCommand('setContext', 'azureDevOps.signedIn', false);
                console.log('[AuthManager] Set azureDevOps.signedIn = false');
            }
        } catch (error) {
            console.error('Failed to initialize authentication:', error);
            vscode.commands.executeCommand('setContext', 'azureDevOps.signedIn', false);
        }
    }

    public registerListeners(): vscode.Disposable[] {
        return [
            vscode.authentication.onDidChangeSessions(async (e) => {
                if (e.provider.id === 'microsoft') {
                    const session = await this.getSession();
                    this.onDidChangeSessionEmitter.fire(session);
                }
            })
        ];
    }

    public async getUserInfo(): Promise<{ name: string; email: string; id: string } | undefined> {
        const session = await this.getSession();
        if (!session) {
            return undefined;
        }

        return {
            name: session.account.label,
            email: session.account.id,
            id: session.account.id
        };
    }

    public getAxiosInstance(): AxiosInstance | null {
        return this.axiosInstance;
    }

    public getConfig(): AzureDevOpsConfig | null {
        return this.config;
    }

    public getConnectionStatus(): ConnectionStatus {
        return this.connectionStatus;
    }

    public isConnected(): boolean {
        return this.connectionStatus.isConnected;
    }

    public async getProjects(): Promise<any[]> {
        if (!this.axiosInstance) {
            throw new Error('Not connected to Azure DevOps');
        }

        try {
            const response = await this.axiosInstance.get('/_apis/projects', {
                params: { 'api-version': '7.1-preview.4' }
            });
            return response.data.value || [];
        } catch (error) {
            console.error('Failed to get projects:', error);
            throw error;
        }
    }

    public async getTeams(projectId: string): Promise<any[]> {
        if (!this.axiosInstance) {
            throw new Error('Not connected to Azure DevOps');
        }

        try {
            const response = await this.axiosInstance.get(`/_apis/projects/${encodeURIComponent(projectId)}/teams`, {
                params: { 'api-version': '7.1-preview.3' }
            });
            return response.data.value || [];
        } catch (error) {
            console.error('Failed to get teams:', error);
            throw error;
        }
    }

    public setConfig(config: AzureDevOpsConfig): void {
        this.config = config;
        this.createAxiosInstance();
    }

    public async getCurrentUser(): Promise<any> {
        if (!this.axiosInstance) {
            throw new Error('Not connected to Azure DevOps');
        }

        try {
            const response = await this.axiosInstance.get('/_apis/connectionData', {
                params: { 'api-version': '7.1-preview.1' }
            });
            console.log('[AuthManager] getCurrentUser response:', JSON.stringify(response.data.authenticatedUser));
            console.log('[AuthManager] User displayName:', response.data.authenticatedUser?.displayName);
            return response.data.authenticatedUser;
        } catch (error) {
            console.error('[AuthManager] Failed to get current user:', error);
            throw error;
        }
    }
}
