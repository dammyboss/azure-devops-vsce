import * as vscode from 'vscode';
import { AuthenticationManager } from './authenticationManager';

class ConnectionStatusItem extends vscode.TreeItem {
    constructor(
        label: string,
        description?: string,
        command?: vscode.Command,
        iconPath?: vscode.ThemeIcon
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.command = command;
        this.iconPath = iconPath;
    }
}

export class ConnectionStatusProvider implements vscode.TreeDataProvider<ConnectionStatusItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionStatusItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private authManager: AuthenticationManager, private context: vscode.ExtensionContext) {
        this.authManager.onDidChangeSession(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConnectionStatusItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConnectionStatusItem): Promise<ConnectionStatusItem[]> {
        if (element) {
            return [];
        }

        const items: ConnectionStatusItem[] = [];
        const session = await this.authManager.getSession();

        if (!session) {
            items.push(
                new ConnectionStatusItem(
                    'Sign In',
                    'Click here to authenticate',
                    {
                        command: 'azureDevOps.connect',
                        title: 'Sign In'
                    },
                    new vscode.ThemeIcon('sign-in', new vscode.ThemeColor('charts.blue'))
                )
            );
        } else {
            const userInfo = await this.authManager.getUserInfo();
            const config = this.authManager.getConfig();
            const status = this.authManager.getConnectionStatus();

            items.push(
                new ConnectionStatusItem(
                    userInfo?.name || 'Signed in',
                    userInfo?.email || '',
                    undefined,
                    new vscode.ThemeIcon('account', new vscode.ThemeColor('notificationsInfoIcon.foreground'))
                )
            );

            if (config?.organizationUrl) {
                const orgName = config.organizationUrl.replace('https://dev.azure.com/', '').replace(/\/$/, '');
                items.push(
                    new ConnectionStatusItem(
                        orgName,
                        'Organization',
                        {
                            command: 'azureDevOps.setupWizard',
                            title: 'Change Organization'
                        },
                        new vscode.ThemeIcon('organization', new vscode.ThemeColor('charts.purple'))
                    )
                );
            } else {
                items.push(
                    new ConnectionStatusItem(
                        'No organization selected',
                        'Click to select',
                        {
                            command: 'azureDevOps.setupWizard',
                            title: 'Select Organization'
                        },
                        new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground'))
                    )
                );
            }

            if (config?.defaultProject) {
                items.push(
                    new ConnectionStatusItem(
                        config.defaultProject,
                        'Project',
                        {
                            command: 'azureDevOps.setupWizard',
                            title: 'Change Project'
                        },
                        new vscode.ThemeIcon('project', new vscode.ThemeColor('charts.green'))
                    )
                );
            }

            items.push(
                new ConnectionStatusItem(
                    '───────────────',
                    '',
                    undefined,
                    undefined
                )
            );

            items.push(
                new ConnectionStatusItem(
                    'Change Organization/Project',
                    '',
                    {
                        command: 'azureDevOps.setupWizard',
                        title: 'Change Organization/Project'
                    },
                    new vscode.ThemeIcon('gear', new vscode.ThemeColor('charts.blue'))
                )
            );

            items.push(
                new ConnectionStatusItem(
                    'Sign Out',
                    '',
                    {
                        command: 'azureDevOps.disconnect',
                        title: 'Sign Out'
                    },
                    new vscode.ThemeIcon('sign-out', new vscode.ThemeColor('charts.red'))
                )
            );
        }

        return items;
    }
}
