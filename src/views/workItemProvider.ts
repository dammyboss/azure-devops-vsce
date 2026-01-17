import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem, WorkItemTypeEnum, WorkItemStateEnum } from '../models/workItem';
import { CacheManager } from '../utils/cacheManager';

export type GroupByOption = 'type' | 'state' | 'assignedTo' | 'sprint' | 'none';

// Custom MIME type for work item drag and drop
const WORK_ITEM_MIME_TYPE = 'application/vnd.code.tree.azuredevopsworkitems';

export class WorkItemProvider implements vscode.TreeDataProvider<WorkItemTreeItem>, vscode.TreeDragAndDropController<WorkItemTreeItem> {

    // Drag and drop support
    dropMimeTypes = [WORK_ITEM_MIME_TYPE];
    dragMimeTypes = [WORK_ITEM_MIME_TYPE];
    private _onDidChangeTreeData: vscode.EventEmitter<WorkItemTreeItem | undefined | void> = new vscode.EventEmitter<WorkItemTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<WorkItemTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    private authenticationManager: AuthenticationManager;
    private workItems: WorkItem[] = [];
    private filterState: string | null = null;
    private filterType: string | null = null;
    private filterAssignedToMe: boolean = false;
    private groupBy: GroupByOption = 'state';
    private cacheManager: CacheManager = new CacheManager();

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
        this.cacheManager.invalidatePattern('workitems');
        this.refresh();
    }

    setGroupBy(groupBy: GroupByOption): void {
        this.groupBy = groupBy;
        this.refresh();
    }

    getGroupBy(): GroupByOption {
        return this.groupBy;
    }

    private async loadWorkItems(): Promise<void> {
        if (!this.authenticationManager.isConnected()) {
            this.workItems = [];
            return;
        }

        // Check cache first
        const cacheKey = `workitems:${this.filterState}:${this.filterType}:${this.filterAssignedToMe}`;
        const cached = this.cacheManager.get<WorkItem[]>(cacheKey);
        if (cached) {
            this.workItems = cached;
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
            
            // Cache the results
            this.cacheManager.set(cacheKey, this.workItems);
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
            await this.loadWorkItems();

            if (this.workItems.length === 0) {
                return [new WorkItemTreeItem('No work items found', vscode.TreeItemCollapsibleState.None)];
            }

            // Group based on selected option
            return this.groupWorkItems();
        } else if (element.contextValue === 'workItemGroup') {
            // Show work items in this group
            const items = this.getWorkItemsForGroup(element);

            return items.map(item => {
                const title = item.fields['System.Title'];
                const state = item.fields['System.State'];
                const assignedTo = item.fields['System.AssignedTo']?.displayName || 'Unassigned';

                // Check if item has children
                const hasChildren = item.relations?.some((rel: any) => 
                    rel.rel === 'System.LinkTypes.Hierarchy-Forward'
                ) || false;

                const treeItem = new WorkItemTreeItem(
                    `#${item.id}: ${title}`,
                    hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    hasChildren ? undefined : {
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
                treeItem.workItem = item;

                return treeItem;
            });
        } else if (element.contextValue === 'workItem' && element.workItemId) {
            // Show child work items
            return await this.getChildWorkItems(element.workItemId);
        }

        return [];
    }

    private groupWorkItems(): WorkItemTreeItem[] {
        if (this.groupBy === 'none') {
            return this.workItems.map(item => this.createWorkItemTreeItem(item));
        }

        const grouped: Record<string, WorkItem[]> = {};

        this.workItems.forEach(item => {
            let key: string;
            switch (this.groupBy) {
                case 'state':
                    key = item.fields['System.State'] || 'Unknown';
                    break;
                case 'type':
                    key = item.fields['System.WorkItemType'] || 'Unknown';
                    break;
                case 'assignedTo':
                    key = item.fields['System.AssignedTo']?.displayName || 'Unassigned';
                    break;
                case 'sprint':
                    key = item.fields['System.IterationPath']?.split('\\').pop() || 'No Sprint';
                    break;
                default:
                    key = 'All';
            }

            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        });

        // Sort groups by priority for state grouping
        const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
            if (this.groupBy === 'state') {
                const stateOrder = ['New', 'To Do', 'Active', 'In Progress', 'Resolved', 'Done', 'Closed'];
                return stateOrder.indexOf(a) - stateOrder.indexOf(b);
            }
            return a.localeCompare(b);
        });

        return sortedGroups.map(([groupName, items]) => {
            const treeItem = new WorkItemTreeItem(
                `${groupName} (${items.length})`,
                vscode.TreeItemCollapsibleState.Expanded
            );
            treeItem.contextValue = 'workItemGroup';
            treeItem.groupName = groupName;
            treeItem.groupType = this.groupBy;
            treeItem.iconPath = this.getIconForGroup(groupName, this.groupBy);
            return treeItem;
        });
    }

    private getWorkItemsForGroup(element: WorkItemTreeItem): WorkItem[] {
        return this.workItems.filter(item => {
            switch (element.groupType) {
                case 'state':
                    return item.fields['System.State'] === element.groupName;
                case 'type':
                    return item.fields['System.WorkItemType'] === element.groupName;
                case 'assignedTo':
                    return (item.fields['System.AssignedTo']?.displayName || 'Unassigned') === element.groupName;
                case 'sprint':
                    return (item.fields['System.IterationPath']?.split('\\').pop() || 'No Sprint') === element.groupName;
                default:
                    return true;
            }
        });
    }

    private createWorkItemTreeItem(item: WorkItem): WorkItemTreeItem {
        const title = item.fields['System.Title'];
        const state = item.fields['System.State'];
        const type = item.fields['System.WorkItemType'];
        const assignedTo = item.fields['System.AssignedTo']?.displayName || 'Unassigned';

        // Check if item has children
        const hasChildren = item.relations?.some((rel: any) => 
            rel.rel === 'System.LinkTypes.Hierarchy-Forward'
        ) || false;

        const treeItem = new WorkItemTreeItem(
            `#${item.id}: ${title}`,
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            hasChildren ? undefined : {
                command: 'azureDevOps.viewWorkItemDetails',
                title: 'View Work Item Details',
                arguments: [item.id]
            }
        );

        treeItem.description = `${type} • ${state}`;
        treeItem.contextValue = 'workItem';
        treeItem.tooltip = this.createWorkItemTooltip(item);
        treeItem.iconPath = this.getIconForWorkItemState(state);
        treeItem.workItemId = item.id;
        treeItem.workItem = item;

        return treeItem;
    }

    private async getChildWorkItems(parentId: number): Promise<WorkItemTreeItem[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return [];

            const response = await axiosInstance.get(`/_apis/wit/workitems/${parentId}`, {
                params: { '$expand': 'relations', 'api-version': '7.0' }
            });

            const relations = response.data.relations || [];
            const childIds: number[] = [];

            for (const relation of relations) {
                if (relation.rel === 'System.LinkTypes.Hierarchy-Forward' && relation.url) {
                    const match = relation.url.match(/workItems\/(\d+)/);
                    if (match) {
                        childIds.push(parseInt(match[1]));
                    }
                }
            }

            if (childIds.length === 0) return [];

            const childResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: { 'ids': childIds.join(','), '$expand': 'relations', 'api-version': '7.0' }
            });

            const children = childResponse.data.value || [];
            return children.map((child: any) => {
                const title = child.fields['System.Title'];
                const state = child.fields['System.State'];
                const type = child.fields['System.WorkItemType'];

                const hasChildren = child.relations?.some((rel: any) => 
                    rel.rel === 'System.LinkTypes.Hierarchy-Forward'
                ) || false;

                const treeItem = new WorkItemTreeItem(
                    `#${child.id}: ${title}`,
                    hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    hasChildren ? undefined : {
                        command: 'azureDevOps.viewWorkItemDetails',
                        title: 'View Work Item',
                        arguments: [child.id]
                    }
                );

                treeItem.description = `${type} • ${state}`;
                treeItem.contextValue = 'workItem';
                treeItem.workItemId = child.id;
                treeItem.iconPath = this.getIconForWorkItemState(state);

                return treeItem;
            });
        } catch (error) {
            console.error('Failed to load child work items:', error);
            return [];
        }
    }

    private getIconForGroup(groupName: string, groupType: GroupByOption): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
        if (groupType === 'state') {
            return this.getIconForWorkItemState(groupName);
        } else if (groupType === 'type') {
            return this.getIconForWorkItemType(groupName);
        } else if (groupType === 'assignedTo') {
            return new vscode.ThemeIcon('person');
        } else if (groupType === 'sprint') {
            return new vscode.ThemeIcon('calendar');
        }
        return new vscode.ThemeIcon('folder');
    }

    private getIconForWorkItemType(type: string): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
        switch (type) {
            case WorkItemTypeEnum.UserStory:
                return new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue'));
            case WorkItemTypeEnum.Task:
                const taskIconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'task-clipboard-yellow.svg');
                return { light: taskIconPath, dark: taskIconPath };
            case WorkItemTypeEnum.Bug:
                return new vscode.ThemeIcon('bug', new vscode.ThemeColor('charts.red'));
            case WorkItemTypeEnum.Epic:
                const epicIconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'epic-crown-orange.svg');
                return { light: epicIconPath, dark: epicIconPath };
            case WorkItemTypeEnum.Feature:
                return new vscode.ThemeIcon('star', new vscode.ThemeColor('charts.orange'));
            case WorkItemTypeEnum.Issue:
                const issueIconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'issue-clipboard-green.svg');
                return { light: issueIconPath, dark: issueIconPath };
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
                this.cacheManager.invalidatePattern('workitems');
                this.refresh();
                return true;
            }

            return false;
        } catch (error) {
            console.error(`Failed to update work item ${id}:`, error);
            return false;
        }
    }

    // ========== DRAG AND DROP SUPPORT ==========

    public async handleDrag(source: readonly WorkItemTreeItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        // Only allow dragging work items (not groups)
        const workItemsToMove = source.filter(item => item.contextValue === 'workItem' && item.workItemId);

        if (workItemsToMove.length === 0) {
            return;
        }

        // Store the work item IDs in the data transfer
        const dragData = workItemsToMove.map(item => ({
            id: item.workItemId,
            state: item.workItem?.fields['System.State'],
            type: item.workItem?.fields['System.WorkItemType']
        }));

        dataTransfer.set(WORK_ITEM_MIME_TYPE, new vscode.DataTransferItem(JSON.stringify(dragData)));
    }

    public async handleDrop(target: WorkItemTreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get(WORK_ITEM_MIME_TYPE);
        if (!transferItem) {
            return;
        }

        const dragData = JSON.parse(await transferItem.asString()) as Array<{ id: number; state: string; type: string }>;

        if (dragData.length === 0) {
            return;
        }

        // Determine what action to take based on drop target
        if (!target) {
            // Dropped on root - no action
            return;
        }

        if (target.contextValue === 'workItemGroup') {
            // Dropped on a group - update the work item's field to match the group
            await this.handleDropOnGroup(dragData, target);
        } else if (target.contextValue === 'workItem' && target.workItemId) {
            // Dropped on another work item - reorder (update backlog priority)
            await this.handleDropOnWorkItem(dragData, target);
        }
    }

    private async handleDropOnGroup(dragData: Array<{ id: number; state: string; type: string }>, targetGroup: WorkItemTreeItem): Promise<void> {
        const axiosInstance = this.authenticationManager.getAxiosInstance();
        if (!axiosInstance) return;

        const groupType = targetGroup.groupType;
        const groupName = targetGroup.groupName;

        if (!groupType || !groupName) return;

        // Determine which field to update based on group type
        let fieldPath: string | null = null;
        let fieldValue: string | null = groupName;

        switch (groupType) {
            case 'state':
                fieldPath = '/fields/System.State';
                break;
            case 'assignedTo':
                fieldPath = '/fields/System.AssignedTo';
                if (groupName === 'Unassigned') {
                    fieldValue = null; // Will use remove operation
                }
                break;
            case 'sprint':
                // Need to get the full iteration path
                fieldPath = '/fields/System.IterationPath';
                // For sprint, we need the full path, try to find it
                const config = this.authenticationManager.getConfig();
                if (config?.defaultProject && groupName !== 'No Sprint') {
                    try {
                        const iterResponse = await axiosInstance.get(
                            `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam || '')}/_apis/work/teamsettings/iterations`,
                            { params: { 'api-version': '7.0' } }
                        );
                        const iteration = (iterResponse.data.value || []).find((i: any) => i.name === groupName);
                        if (iteration) {
                            fieldValue = iteration.path;
                        }
                    } catch (e) {
                        console.error('Failed to get iteration path:', e);
                        return;
                    }
                } else if (groupName === 'No Sprint') {
                    fieldValue = null;
                }
                break;
            case 'type':
                // Cannot change work item type via simple field update
                vscode.window.showWarningMessage('Cannot change work item type via drag and drop');
                return;
            default:
                return;
        }

        if (!fieldPath) return;

        // Update each work item
        let successCount = 0;
        for (const item of dragData) {
            try {
                const patchOp = fieldValue !== null
                    ? { op: 'replace', path: fieldPath, value: fieldValue }
                    : { op: 'remove', path: fieldPath };

                await axiosInstance.patch(
                    `/_apis/wit/workitems/${item.id}`,
                    [patchOp],
                    { headers: { 'Content-Type': 'application/json-patch+json' } }
                );
                successCount++;
            } catch (error) {
                console.error(`Failed to update work item ${item.id}:`, error);
            }
        }

        if (successCount > 0) {
            vscode.window.showInformationMessage(`Updated ${successCount} work item(s)`);
            this.cacheManager.invalidatePattern('workitems');
            this.refresh();
        }
    }

    private async handleDropOnWorkItem(dragData: Array<{ id: number; state: string; type: string }>, targetItem: WorkItemTreeItem): Promise<void> {
        const axiosInstance = this.authenticationManager.getAxiosInstance();
        if (!axiosInstance || !targetItem.workItem) return;

        // Get target's backlog priority
        const targetFields = targetItem.workItem.fields as any;
        const targetPriority = targetFields['Microsoft.VSTS.Common.BacklogPriority'] ||
                              targetFields['Microsoft.VSTS.Common.StackRank'] || 0;

        // Set dragged items to have priority just before the target
        const newPriority = targetPriority - 0.001;

        let successCount = 0;
        for (const item of dragData) {
            if (item.id === targetItem.workItemId) continue; // Skip if dropping on itself

            try {
                // Try BacklogPriority first, then StackRank
                const patchDocument = [
                    { op: 'replace', path: '/fields/Microsoft.VSTS.Common.BacklogPriority', value: newPriority - (dragData.indexOf(item) * 0.0001) }
                ];

                await axiosInstance.patch(
                    `/_apis/wit/workitems/${item.id}`,
                    patchDocument,
                    { headers: { 'Content-Type': 'application/json-patch+json' } }
                );
                successCount++;
            } catch (error: any) {
                // If BacklogPriority doesn't exist, try StackRank
                if (error?.response?.status === 400) {
                    try {
                        await axiosInstance.patch(
                            `/_apis/wit/workitems/${item.id}`,
                            [{ op: 'replace', path: '/fields/Microsoft.VSTS.Common.StackRank', value: newPriority - (dragData.indexOf(item) * 0.0001) }],
                            { headers: { 'Content-Type': 'application/json-patch+json' } }
                        );
                        successCount++;
                    } catch (e2) {
                        console.error(`Failed to update priority for work item ${item.id}:`, e2);
                    }
                } else {
                    console.error(`Failed to update priority for work item ${item.id}:`, error);
                }
            }
        }

        if (successCount > 0) {
            vscode.window.showInformationMessage(`Reordered ${successCount} work item(s)`);
            this.cacheManager.invalidatePattern('workitems');
            this.refresh();
        }
    }
}

export class WorkItemTreeItem extends vscode.TreeItem {
    public workItemId?: number;
    public workItemType?: string;
    public workItem?: WorkItem;
    public groupName?: string;
    public groupType?: GroupByOption;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}
