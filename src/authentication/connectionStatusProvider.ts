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
                '',
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'notConnected'
            ));
            return items;
        }

        // Organization
        if (status.organization) {
            items.push(new ConnectionItem(
                'Organization',
                status.organization.replace('https://dev.azure.com/', ''),
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'organization'
            ));
        }

        // Current User
        if (status.user) {
            items.push(new ConnectionItem(
                'User',
                status.user,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'user'
            ));
        }

        // Project
        if (config.defaultProject) {
            items.push(new ConnectionItem(
                'Project',
                config.defaultProject,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'project'
            ));
        }

        // Team
        if (config.defaultTeam) {
            items.push(new ConnectionItem(
                'Team',
                config.defaultTeam,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'team'
            ));
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
        type?: string,
        tooltip?: string
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = tooltip || `${label}${description ? ': ' + description : ''}`;
        
        // Add icons and colors based on type
        if (type === 'organization') {
            this.iconPath = new vscode.ThemeIcon('home', new vscode.ThemeColor('charts.blue'));
        } else if (type === 'user') {
            this.iconPath = new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.green'));
        } else if (type === 'project') {
            this.iconPath = new vscode.ThemeIcon('layers', new vscode.ThemeColor('charts.orange'));
        } else if (type === 'team') {
            this.iconPath = new vscode.ThemeIcon('organization', new vscode.ThemeColor('charts.red'));
        } else if (type === 'notConnected') {
            this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        }
        
        if (command) {
            this.command = command;
        }
    }
}

