import * as vscode from 'vscode';
import { AuthenticationManager } from './authenticationManager';

/**
 * Shows connection status in a tree view with a beautiful, professional UI
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
            // Show a beautiful "Not Connected" state
            items.push(new ConnectionItem(
                '$(plug) Connect to Azure DevOps',
                'Click to get started',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'azureDevOps.connect',
                    title: 'Connect to Azure DevOps'
                },
                'connectAction'
            ));

            items.push(new ConnectionItem(
                '$(info) Setup Wizard',
                'Configure your connection',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'azureDevOps.setupWizard',
                    title: 'Open Setup Wizard'
                },
                'setupWizard'
            ));

            return items;
        }

        // Connected state - show status header
        items.push(new ConnectionItem(
            '$(check) Connected',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'connectedStatus'
        ));

        // Separator
        items.push(new ConnectionItem(
            '─────────────────',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'separator'
        ));

        // Organization
        if (status.organization) {
            const orgName = status.organization.replace('https://dev.azure.com/', '');
            items.push(new ConnectionItem(
                'Organization',
                orgName,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'vscode.open',
                    title: 'Open in Browser',
                    arguments: [vscode.Uri.parse(status.organization)]
                },
                'organization',
                `Organization: ${orgName}\nClick to open in browser`
            ));
        }

        // Current User
        if (status.user) {
            items.push(new ConnectionItem(
                'Signed in as',
                status.user,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'user',
                `Signed in as: ${status.user}`
            ));
        }

        // Separator
        items.push(new ConnectionItem(
            '─────────────────',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'separator'
        ));

        // Project
        if (config.defaultProject) {
            const projectUrl = status.organization
                ? `${status.organization}/${encodeURIComponent(config.defaultProject)}`
                : '';
            items.push(new ConnectionItem(
                'Project',
                config.defaultProject,
                vscode.TreeItemCollapsibleState.None,
                projectUrl ? {
                    command: 'vscode.open',
                    title: 'Open Project in Browser',
                    arguments: [vscode.Uri.parse(projectUrl)]
                } : undefined,
                'project',
                `Project: ${config.defaultProject}\n${projectUrl ? 'Click to open in browser' : ''}`
            ));
        }

        // Team
        if (config.defaultTeam) {
            items.push(new ConnectionItem(
                'Team',
                config.defaultTeam,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'team',
                `Team: ${config.defaultTeam}`
            ));
        }

        // Separator
        items.push(new ConnectionItem(
            '─────────────────',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'separator'
        ));

        // Quick actions
        items.push(new ConnectionItem(
            '$(gear) Settings',
            'Configure connection',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'azureDevOps.setupWizard',
                title: 'Open Settings'
            },
            'settings'
        ));

        items.push(new ConnectionItem(
            '$(refresh) Refresh',
            'Refresh all',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'azureDevOps.refresh',
                title: 'Refresh All'
            },
            'refresh'
        ));

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

        // Add icons and styling based on type
        switch (type) {
            case 'connectAction':
                this.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.blue'));
                break;
            case 'setupWizard':
                this.iconPath = new vscode.ThemeIcon('settings-gear', new vscode.ThemeColor('charts.purple'));
                break;
            case 'connectedStatus':
                this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'organization':
                this.iconPath = new vscode.ThemeIcon('home', new vscode.ThemeColor('charts.blue'));
                break;
            case 'user':
                this.iconPath = new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.green'));
                break;
            case 'project':
                this.iconPath = new vscode.ThemeIcon('project', new vscode.ThemeColor('charts.orange'));
                break;
            case 'team':
                this.iconPath = new vscode.ThemeIcon('organization', new vscode.ThemeColor('charts.red'));
                break;
            case 'settings':
                this.iconPath = new vscode.ThemeIcon('gear', new vscode.ThemeColor('descriptionForeground'));
                break;
            case 'refresh':
                this.iconPath = new vscode.ThemeIcon('refresh', new vscode.ThemeColor('descriptionForeground'));
                break;
            case 'separator':
                // No icon for separator
                this.iconPath = undefined;
                this.contextValue = 'separator';
                break;
            case 'notConnected':
                this.iconPath = new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('errorForeground'));
                break;
        }

        if (command) {
            this.command = command;
        }

        this.contextValue = type;
    }
}
