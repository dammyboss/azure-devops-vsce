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
            items.push(new ConnectionItem(
                'Not Connected',
                'Click to connect',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'azureDevOps.connect',
                    title: 'Connect to Azure DevOps'
                },
                '$(plug) Not Connected'
            ));
            return items;
        }

        // Organization
        if (status.organization) {
            const orgName = status.organization.replace('https://dev.azure.com/', '');
            items.push(new ConnectionItem(
                `$(organization) Organization`,
                orgName,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Azure DevOps Organization: ${orgName}`
            ));
        }

        // Current User
        if (status.user) {
            items.push(new ConnectionItem(
                `$(account) User`,
                status.user,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Signed in as: ${status.user}`
            ));
        }

        // Project
        if (config.defaultProject) {
            items.push(new ConnectionItem(
                `$(project) Project`,
                config.defaultProject,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Selected Project: ${config.defaultProject}`
            ));
        }

        // Team
        if (config.defaultTeam) {
            items.push(new ConnectionItem(
                `$(people) Team`,
                config.defaultTeam,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                `Selected Team: ${config.defaultTeam}`
            ));
        }

        // Disconnect button - with special styling
        const disconnectItem = new ConnectionItem(
            'Disconnect',
            'Sign out from Azure DevOps',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'azureDevOps.disconnect',
                title: 'Disconnect'
            },
            'Click to disconnect from Azure DevOps'
        );
        
        // Make disconnect button stand out with red color and icon
        disconnectItem.iconPath = new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('errorForeground'));
        disconnectItem.contextValue = 'disconnect-action';
        disconnectItem.resourceUri = vscode.Uri.parse('disconnect://action');
        
        items.push(disconnectItem);

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
