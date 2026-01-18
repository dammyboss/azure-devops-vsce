import * as vscode from 'vscode';
import { AuthenticationManager } from './authenticationManager';

/**
 * Shows connection status in a tree view
 */
export class ConnectionStatusProvider implements vscode.TreeDataProvider<ConnectionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConnectionItem | undefined | null | void> = 
        new vscode.EventEmitter<ConnectionItem | undefined | null | void>();
    
    readonly onDidChangeTreeData: vscode.Event<ConnectionItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(private authManager: AuthenticationManager, private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: ConnectionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConnectionItem): Promise<ConnectionItem[]> {
        if (!element) {
            // Root level items
            return this.getRootItems();
        }

        // No children for now
        return [];
    }

    private async getRootItems(): Promise<ConnectionItem[]> {
        const status = this.authManager.getConnectionStatus();
        const config = this.authManager.getConfig();
        const items: ConnectionItem[] = [];

        if (!status.isConnected || !config) {
            const notConnectedItem = new ConnectionItem(
                'Not Connected',
                'Click to connect',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'azureDevOps.connect',
                    title: 'Connect to Azure DevOps'
                },
                'Not Connected'
            );
            notConnectedItem.iconPath = new vscode.ThemeIcon('plug');
            items.push(notConnectedItem);
            return items;
        }

        // Organization
        if (status.organization) {
            const orgName = status.organization.replace('https://dev.azure.com/', '');
            const orgItem = new ConnectionItem(
                'Organization',
                orgName,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Azure DevOps Organization: ${orgName}`
            );
            orgItem.iconPath = new vscode.ThemeIcon('home');
            items.push(orgItem);
        }

        // Current User
        if (status.user) {
            const userItem = new ConnectionItem(
                'User',
                status.user,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Signed in as: ${status.user}`
            );
            userItem.iconPath = new vscode.ThemeIcon('account');
            items.push(userItem);
        }

        // Project
        if (config.defaultProject) {
            const projectItem = new ConnectionItem(
                'Project',
                config.defaultProject,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Selected Project: ${config.defaultProject}`
            );
            projectItem.iconPath = new vscode.ThemeIcon('project');
            items.push(projectItem);
        }

        // Team
        if (config.defaultTeam) {
            const teamItem = new ConnectionItem(
                'Team',
                config.defaultTeam,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Selected Team: ${config.defaultTeam}`
            );
            teamItem.iconPath = new vscode.ThemeIcon('organization');
            items.push(teamItem);
        }

        return items;
    }
}

class ConnectionItem extends vscode.TreeItem {
    constructor(
        label: string,
        description: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        command?: vscode.Command,
        tooltip?: string
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = tooltip || `${label}: ${description}`;
        if (command) {
            this.command = command;
        }
    }
}
