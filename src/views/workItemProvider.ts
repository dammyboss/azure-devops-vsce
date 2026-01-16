import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem, WorkItemTypeEnum, WorkItemStateEnum } from '../models/workItem';

export class WorkItemProvider implements vscode.TreeDataProvider<WorkItemTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WorkItemTreeItem | undefined | void> = new vscode.EventEmitter<WorkItemTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<WorkItemTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    private authenticationManager: AuthenticationManager;
    private workItems: WorkItem[] = [];
    private filterState: string | null = null;
    private filterType: string | null = null;
    private filterAssignedToMe: boolean = false;

    constructor(context: vscode.ExtensionContext, authenticationManager: AuthenticationManager) {
        this.context = context;
        this.authenticationManager = authenticationManager;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setFilter(state: string | null, type: string | null, assignedToMe: boolean): void {
        this.filterState = state;
        this.filterType = type;
        this.filterAssignedToMe = assignedToMe;
        this.refresh();
    }

    private async loadWorkItems(): Promise<void> {
        if (!this.authenticationManager.isConnected()) {
            this.workItems = [];
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                this.workItems = [];
                return;
            }

            const config = this.authenticationManager.getConfig();
            if (!config?.defaultProject) {
                this.workItems = [];
                return;
            }

            const maxItems = vscode.workspace.getConfiguration('azureDevOps').get<number>('maxWorkItemsToLoad', 200);

            // Build WIQL query based on filters
            let wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.CreatedDate] FROM WorkItems WHERE [System.TeamProject] = @project`;

            if (this.filterState) {
                wiql += ` AND [System.State] = '${this.filterState}'`;
            }

            if (this.filterType) {
                wiql += ` AND [System.WorkItemType] = '${this.filterType}'`;
            }

            if (this.filterAssignedToMe) {
                try {
                    const currentUser = await this.authenticationManager.getCurrentUser();
                    if (currentUser?.uniqueName) {
                        wiql += ` AND [System.AssignedTo] = '${currentUser.uniqueName}'`;
                    }
                } catch (e) {
                    // If we can't get current user, skip this filter
                }
            }

            wiql += ` ORDER BY [System.ChangedDate] DESC`;

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql }
            );

            const workItemRefs = response.data.workItems || [];
            if (workItemRefs.length === 0) {
                this.workItems = [];
                return;
            }

            // Get detailed work item information (limit to maxItems)
            const workItemIds = workItemRefs.slice(0, maxItems).map((item: any) => item.id).join(',');
            const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: {
                    'ids': workItemIds,
                    '$expand': 'all'
                }
            });

            this.workItems = detailsResponse.data.value || [];
        } catch (error: any) {
            console.error('Failed to load work items:', error?.message || error);
            this.workItems = [];
        }
    }

    getTreeItem(element: WorkItemTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorkItemTreeItem): Promise<WorkItemTreeItem[]> {
        if (!this.authenticationManager.isConnected()) {
            return [];
        }

        if (!element) {
            // Root level - show work items grouped by type
            await this.loadWorkItems();

            if (this.workItems.length === 0) {
                return [new WorkItemTreeItem('No work items found', vscode.TreeItemCollapsibleState.None)];
            }

            // Group work items by type
            const groupedItems = this.workItems.reduce((groups, item) => {
                const type = item.fields['System.WorkItemType'];
                if (!groups[type]) {
                    groups[type] = [];
                }
                groups[type].push(item);
                return groups;
            }, {} as Record<string, WorkItem[]>);

            return Object.entries(groupedItems).map(([type, items]) => {
                const treeItem = new WorkItemTreeItem(
                    `${type} (${items.length})`,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                treeItem.contextValue = 'workItemType';
                treeItem.iconPath = this.getIconForWorkItemType(type);
                treeItem.workItemType = type;
                return treeItem;
            });
        } else if (element.contextValue === 'workItemType') {
            // Show work items of this type
            const type = element.workItemType;
            const itemsOfType = this.workItems.filter(item => item.fields['System.WorkItemType'] === type);

            return itemsOfType.map(item => {
                const title = item.fields['System.Title'];
                const state = item.fields['System.State'];
                const assignedTo = item.fields['System.AssignedTo']?.displayName || 'Unassigned';

                const treeItem = new WorkItemTreeItem(
                    `#${item.id}: ${title}`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'azureDevOps.viewWorkItemDetails',
                        title: 'View Work Item Details',
                        arguments: [item.id]
                    }
                );

                treeItem.description = `${state} • ${assignedTo}`;
                treeItem.contextValue = 'workItem';
                treeItem.tooltip = this.createWorkItemTooltip(item);
                treeItem.iconPath = this.getIconForWorkItemState(state);
                treeItem.workItemId = item.id;

                return treeItem;
            });
        }

        return [];
    }

    private getIconForWorkItemType(type: string): vscode.ThemeIcon {
        switch (type) {
            case WorkItemTypeEnum.UserStory:
                return new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue'));
            case WorkItemTypeEnum.Task:
                return new vscode.ThemeIcon('checklist', new vscode.ThemeColor('charts.yellow'));
            case WorkItemTypeEnum.Bug:
                return new vscode.ThemeIcon('bug', new vscode.ThemeColor('charts.red'));
            case WorkItemTypeEnum.Epic:
                return new vscode.ThemeIcon('rocket', new vscode.ThemeColor('charts.purple'));
            case WorkItemTypeEnum.Feature:
                return new vscode.ThemeIcon('star', new vscode.ThemeColor('charts.orange'));
            case WorkItemTypeEnum.Issue:
                return new vscode.ThemeIcon('issues', new vscode.ThemeColor('charts.green'));
            default:
                return new vscode.ThemeIcon('circle');
        }
    }

    private getIconForWorkItemState(state: string): vscode.ThemeIcon {
        switch (state) {
            case WorkItemStateEnum.New:
            case WorkItemStateEnum.ToDo:
                return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray'));
            case WorkItemStateEnum.Active:
            case WorkItemStateEnum.InProgress:
                return new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.blue'));
            case WorkItemStateEnum.Resolved:
            case WorkItemStateEnum.ReadyForReview:
                return new vscode.ThemeIcon('check-circle', new vscode.ThemeColor('charts.yellow'));
            case WorkItemStateEnum.Closed:
            case WorkItemStateEnum.Done:
                return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
            case WorkItemStateEnum.Removed:
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('circle');
        }
    }

    private createWorkItemTooltip(item: WorkItem): vscode.MarkdownString {
        const fields = item.fields;
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### #${item.id}: ${fields['System.Title']}\n\n`);
        md.appendMarkdown(`**Type:** ${fields['System.WorkItemType']}\n\n`);
        md.appendMarkdown(`**State:** ${fields['System.State']}\n\n`);
        md.appendMarkdown(`**Assigned To:** ${fields['System.AssignedTo']?.displayName || 'Unassigned'}\n\n`);
        md.appendMarkdown(`**Created:** ${new Date(fields['System.CreatedDate']).toLocaleDateString()}\n\n`);
        md.appendMarkdown(`**Updated:** ${new Date(fields['System.ChangedDate']).toLocaleDateString()}\n\n`);

        if (fields['Microsoft.VSTS.Common.Priority']) {
            md.appendMarkdown(`**Priority:** ${fields['Microsoft.VSTS.Common.Priority']}\n\n`);
        }

        if (fields['System.Tags']) {
            md.appendMarkdown(`**Tags:** ${fields['System.Tags']}\n\n`);
        }

        if (fields['System.Description']) {
            const desc = fields['System.Description'].replace(/<[^>]*>/g, '').substring(0, 200);
            md.appendMarkdown(`---\n${desc}${desc.length >= 200 ? '...' : ''}`);
        }

        return md;
    }

    async getWorkItemById(id: number): Promise<WorkItem | null> {
        if (!this.authenticationManager.isConnected()) {
            return null;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                return null;
            }

            const response = await axiosInstance.get(`/_apis/wit/workitems/${id}`, {
                params: { '$expand': 'all' }
            });
            return response.data;
        } catch (error) {
            console.error(`Failed to get work item ${id}:`, error);
            return null;
        }
    }

    async createWorkItem(type: string, title: string, description?: string): Promise<WorkItem | null> {
        if (!this.authenticationManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to Azure DevOps');
            return null;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                return null;
            }

            const patchDocument: any[] = [
                {
                    op: 'add',
                    path: '/fields/System.Title',
                    value: title
                }
            ];

            if (description) {
                patchDocument.push({
                    op: 'add',
                    path: '/fields/System.Description',
                    value: description
                });
            }

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitems/$${encodeURIComponent(type)}`,
                patchDocument,
                {
                    headers: {
                        'Content-Type': 'application/json-patch+json'
                    }
                }
            );

            this.refresh();
            return response.data;
        } catch (error) {
            console.error('Failed to create work item:', error);
            vscode.window.showErrorMessage(`Failed to create work item: ${error}`);
            return null;
        }
    }

    async updateWorkItem(id: number, updates: { title?: string; description?: string; state?: string; assignedTo?: string }): Promise<boolean> {
        if (!this.authenticationManager.isConnected()) {
            return false;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                return false;
            }

            const patchDocument: any[] = [];

            if (updates.title !== undefined) {
                patchDocument.push({ op: 'replace', path: '/fields/System.Title', value: updates.title });
            }
            if (updates.description !== undefined) {
                patchDocument.push({ op: 'replace', path: '/fields/System.Description', value: updates.description });
            }
            if (updates.state !== undefined) {
                patchDocument.push({ op: 'replace', path: '/fields/System.State', value: updates.state });
            }
            if (updates.assignedTo !== undefined) {
                if (updates.assignedTo) {
                    patchDocument.push({ op: 'replace', path: '/fields/System.AssignedTo', value: updates.assignedTo });
                } else {
                    patchDocument.push({ op: 'remove', path: '/fields/System.AssignedTo' });
                }
            }

            if (patchDocument.length > 0) {
                await axiosInstance.patch(
                    `/_apis/wit/workitems/${id}`,
                    patchDocument,
                    {
                        headers: { 'Content-Type': 'application/json-patch+json' }
                    }
                );
                this.refresh();
                return true;
            }

            return false;
        } catch (error) {
            console.error(`Failed to update work item ${id}:`, error);
            return false;
        }
    }
}

export class WorkItemTreeItem extends vscode.TreeItem {
    public workItemId?: number;
    public workItemType?: string;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}
