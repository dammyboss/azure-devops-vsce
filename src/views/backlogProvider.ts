import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';

export class BacklogProvider implements vscode.TreeDataProvider<BacklogTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BacklogTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private context: vscode.ExtensionContext,
        private authenticationManager: AuthenticationManager
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BacklogTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BacklogTreeItem): Promise<BacklogTreeItem[]> {
        if (!this.authenticationManager.isConnected()) {
            return [];
        }

        const config = this.authenticationManager.getConfig();
        if (!config?.defaultProject || !config?.defaultTeam) {
            return [];
        }

        const axiosInstance = this.authenticationManager.getAxiosInstance();
        if (!axiosInstance) return [];

        try {
            if (!element) {
                // Get backlog levels
                const response = await axiosInstance.get(
                    `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/backlogs`,
                    { params: { 'api-version': '7.0' } }
                );
                
                const backlogs = response.data.value || [];
                return backlogs.map((backlog: any) => {
                    const item = new BacklogTreeItem(
                        backlog.name,
                        vscode.TreeItemCollapsibleState.Collapsed
                    );
                    item.backlogId = backlog.id;
                    item.contextValue = 'backlog';
                    item.iconPath = new vscode.ThemeIcon('list-tree');
                    return item;
                });
            } else if (element.contextValue === 'backlog') {
                // Get work items for this backlog
                const response = await axiosInstance.get(
                    `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/backlogs/${element.backlogId}/workItems`,
                    { params: { 'api-version': '7.0' } }
                );

                const workItemRefs = response.data.workItems || [];
                if (workItemRefs.length === 0) {
                    return [new BacklogTreeItem('No work items', vscode.TreeItemCollapsibleState.None)];
                }

                const workItemIds = workItemRefs.slice(0, 100).map((wi: any) => wi.target.id).join(',');
                const detailsResponse = await axiosInstance.get(`/_apis/wit/workitems`, {
                    params: { ids: workItemIds, 'api-version': '7.0' }
                });

                const workItems = detailsResponse.data.value || [];
                return workItems.map((item: any) => {
                    const title = item.fields['System.Title'];
                    const state = item.fields['System.State'];
                    const type = item.fields['System.WorkItemType'];

                    const treeItem = new BacklogTreeItem(
                        `#${item.id}: ${title}`,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'azureDevOps.viewWorkItemDetails',
                            title: 'View Work Item',
                            arguments: [item.id]
                        }
                    );
                    treeItem.description = `${type} • ${state}`;
                    treeItem.contextValue = 'workItem';
                    treeItem.workItemId = item.id;
                    return treeItem;
                });
            }
        } catch (error) {
            console.error('Failed to load backlogs:', error);
        }

        return [];
    }
}

export class BacklogTreeItem extends vscode.TreeItem {
    public backlogId?: string;
    public workItemId?: number;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}
