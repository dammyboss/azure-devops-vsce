import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import { AzureDevOpsAuthenticationProvider } from './azureDevOpsAuthProvider';

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
    private context: vscode.ExtensionContext;
    private config: AzureDevOpsConfig | null = null;
    private axiosInstance: AxiosInstance | null = null;
    private connectionStatus: ConnectionStatus = { isConnected: false };
    private authProvider: AzureDevOpsAuthenticationProvider;
    private currentSession: vscode.AuthenticationSession | null = null;
    private setupWizard: any = null; // Lazy loaded

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.authProvider = new AzureDevOpsAuthenticationProvider(context);
        context.subscriptions.push(this.authProvider);
        this.loadConfiguration().catch(() => {});
    }

    private async loadConfiguration(): Promise<void> {
        // Try to load from stored session first
        const sessions = await vscode.authentication.getSession('azure-devops', [], { createIfNone: false });
        if (sessions) {
            this.currentSession = sessions;
            const organizationUrl = sessions.account.id.replace(/\/+$/, '');
            const config = vscode.workspace.getConfiguration('azureDevOps');
            const defaultProject = config.get<string>('defaultProject', '');
            const defaultTeam = config.get<string>('defaultTeam', '');
            
            this.config = {
                organizationUrl,
                personalAccessToken: sessions.accessToken,
                defaultProject,
                defaultTeam
            };
            this.createAxiosInstance();
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
            // Get Microsoft session for auth using Azure DevOps app scope
            const session = await vscode.authentication.getSession('microsoft', [
                'https://app.vssps.visualstudio.com/.default'
            ], { createIfNone: true });
            
            if (!session) {
                vscode.window.showErrorMessage('Authentication cancelled.');
                return false;
            }

            // Store the Microsoft session
            this.currentSession = session;

            // Get config to see if we have saved org/project
            const config = vscode.workspace.getConfiguration('azureDevOps');
            const savedOrgUrl = config.get<string>('organizationUrl', '');
            const defaultProject = config.get<string>('defaultProject', '');
            const defaultTeam = config.get<string>('defaultTeam', '');

            // If we have saved config, use it. Otherwise, show wizard
            if (savedOrgUrl && defaultProject) {
                this.config = {
                    organizationUrl: savedOrgUrl,
                    personalAccessToken: session.accessToken,
                    defaultProject,
                    defaultTeam
                };
                
                this.createAxiosInstance();
                const connected = await this.autoConnect();

                if (connected) {
                    vscode.window.showInformationMessage(`✓ Connected to Azure DevOps`);
                    return true;
                } else {
                    vscode.window.showErrorMessage('Failed to verify connection. Configuration may have changed.');
                    return false;
                }
            } else {
                // No saved config, open setup wizard
                vscode.window.showInformationMessage('Opening Azure DevOps setup wizard...');
                await vscode.commands.executeCommand('azureDevOps.setupWizard');
                return false;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Connection error: ${error}`);
            return false;
        }
    }

    public async disconnect(): Promise<void> {
        // Clear all sessions from auth provider
        await this.authProvider.disconnect();
        this.currentSession = null;

        // Clear config
        this.config = null;
        this.axiosInstance = null;
        this.connectionStatus = { isConnected: false };
        
        // Clear workspace settings
        await vscode.workspace.getConfiguration('azureDevOps').update('defaultProject', '', true);
        await vscode.workspace.getConfiguration('azureDevOps').update('defaultTeam', '', true);

        vscode.window.showInformationMessage('Disconnected from Azure DevOps');
    }

    public async refreshConfiguration(): Promise<void> {
        const sessions = await vscode.authentication.getSession('azure-devops', [], { createIfNone: false });
        if (sessions) {
            this.currentSession = sessions;
            const organizationUrl = sessions.account.id.replace(/\/+$/, '');
            const config = vscode.workspace.getConfiguration('azureDevOps');
            const defaultProject = config.get<string>('defaultProject', '');
            const defaultTeam = config.get<string>('defaultTeam', '');
            
            this.config = {
                organizationUrl,
                personalAccessToken: sessions.accessToken,
                defaultProject,
                defaultTeam
            };
            this.createAxiosInstance();
            await this.autoConnect();
        }
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
            return response.data.authenticatedUser;
        } catch (error) {
            console.error('Failed to get current user:', error);
            throw error;
        }
    }
}
