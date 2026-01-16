import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';

export class SprintProvider implements vscode.TreeDataProvider<SprintTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SprintTreeItem | undefined | void> = new vscode.EventEmitter<SprintTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SprintTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    private authenticationManager: AuthenticationManager;
    private sprints: any[] = [];
    private sprintWorkItems: Map<string, any[]> = new Map();
    private sprintCapacities: Map<string, any> = new Map();

    constructor(context: vscode.ExtensionContext, authenticationManager: AuthenticationManager) {
        this.context = context;
        this.authenticationManager = authenticationManager;
    }

    refresh(): void {
        this.sprintWorkItems.clear();
        this.sprintCapacities.clear();
        this._onDidChangeTreeData.fire();
    }

    private async loadSprints(): Promise<void> {
        if (!this.authenticationManager.isConnected()) {
            this.sprints = [];
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config.defaultTeam) {
                this.sprints = [];
                return;
            }

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations`
            );

            this.sprints = response.data.value || [];

            // Sort sprints by start date (most recent first), with current sprint at top
            const now = new Date();
            this.sprints.sort((a, b) => {
                const aStart = new Date(a.attributes?.startDate || 0);
                const aEnd = new Date(a.attributes?.finishDate || 0);
                const bStart = new Date(b.attributes?.startDate || 0);
                const bEnd = new Date(b.attributes?.finishDate || 0);

                // Check if sprints are current
                const aIsCurrent = aStart <= now && aEnd >= now;
                const bIsCurrent = bStart <= now && bEnd >= now;

                if (aIsCurrent && !bIsCurrent) return -1;
                if (!aIsCurrent && bIsCurrent) return 1;

                return bStart.getTime() - aStart.getTime();
            });
        } catch (error: any) {
            console.error('Failed to load sprints:', error?.message || error);
            this.sprints = [];
        }
    }

    private async loadSprintWorkItems(sprintId: string): Promise<any[]> {
        if (this.sprintWorkItems.has(sprintId)) {
            return this.sprintWorkItems.get(sprintId) || [];
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config.defaultTeam) {
                return [];
            }

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations/${sprintId}/workitems`
            );

            const workItemRefs = response.data.workItemRelations || [];

            if (workItemRefs.length === 0) {
                this.sprintWorkItems.set(sprintId, []);
                return [];
            }

            const workItemIds = workItemRefs.map((item: any) => item.target.id).join(',');
            const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: {
                    'ids': workItemIds,
                    '$expand': 'all'
                }
            });

            const workItems = detailsResponse.data.value || [];
            this.sprintWorkItems.set(sprintId, workItems);
            return workItems;
        } catch (error: any) {
            console.error('Failed to get sprint work items:', error?.message || error);
            return [];
        }
    }

    private async loadSprintCapacity(sprintId: string): Promise<any> {
        if (this.sprintCapacities.has(sprintId)) {
            return this.sprintCapacities.get(sprintId);
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config.defaultTeam) {
                return null;
            }

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations/${sprintId}/capacities`
            );

            const capacity = response.data;
            this.sprintCapacities.set(sprintId, capacity);
            return capacity;
        } catch (error: any) {
            console.error('Failed to get sprint capacity:', error?.message || error);
            return null;
        }
    }

    getTreeItem(element: SprintTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SprintTreeItem): Promise<SprintTreeItem[]> {
        if (!this.authenticationManager.isConnected()) {
            return [];
        }

        const config = this.authenticationManager.getConfig();
        if (!config?.defaultProject || !config?.defaultTeam) {
            return [];
        }

        if (!element) {
            // Root level - show sprints
            await this.loadSprints();

            if (this.sprints.length === 0) {
                return [new SprintTreeItem('No sprints found', vscode.TreeItemCollapsibleState.None)];
            }

            const now = new Date();

            return this.sprints.map(sprint => {
                const sprintName = sprint.name;
                const attributes = sprint.attributes || {};
                const startDate = attributes.startDate ? new Date(attributes.startDate) : null;
                const finishDate = attributes.finishDate ? new Date(attributes.finishDate) : null;

                const isCurrent = startDate && finishDate && startDate <= now && finishDate >= now;
                const isPast = finishDate && finishDate < now;

                const dateRange = startDate && finishDate
                    ? `${startDate.toLocaleDateString()} - ${finishDate.toLocaleDateString()}`
                    : 'No dates set';

                const treeItem = new SprintTreeItem(
                    isCurrent ? `${sprintName} (Current)` : sprintName,
                    vscode.TreeItemCollapsibleState.Collapsed
                );

                treeItem.description = dateRange;
                treeItem.contextValue = 'sprint';
                treeItem.iconPath = isCurrent
                    ? new vscode.ThemeIcon('calendar', new vscode.ThemeColor('charts.green'))
                    : isPast
                        ? new vscode.ThemeIcon('calendar', new vscode.ThemeColor('charts.gray'))
                        : new vscode.ThemeIcon('calendar', new vscode.ThemeColor('charts.blue'));
                treeItem.tooltip = this.createSprintTooltip(sprint);
                treeItem.sprintId = sprint.id;
                treeItem.sprintPath = sprint.path;

                return treeItem;
            });
        } else if (element.contextValue === 'sprint') {
            // Show sprint sections
            return [
                this.createSectionItem('Work Items', 'sprintWorkItems', element.sprintId!, 'tasklist'),
                this.createSectionItem('Capacity', 'sprintCapacity', element.sprintId!, 'person'),
                this.createSectionItem('Open in Browser', 'sprintOpen', element.sprintId!, 'link-external', element.sprintPath)
            ];
        } else if (element.contextValue === 'sprintWorkItems') {
            // Show work items grouped by type
            const workItems = await this.loadSprintWorkItems(element.sprintId!);

            if (workItems.length === 0) {
                return [new SprintTreeItem('No work items in this sprint', vscode.TreeItemCollapsibleState.None)];
            }

            // Group by work item type
            const groupedItems = workItems.reduce((groups: Record<string, any[]>, item: any) => {
                const type = item.fields['System.WorkItemType'];
                if (!groups[type]) {
                    groups[type] = [];
                }
                groups[type].push(item);
                return groups;
            }, {});

            return Object.entries(groupedItems).map(([type, items]) => {
                const treeItem = new SprintTreeItem(
                    `${type} (${items.length})`,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                treeItem.contextValue = 'sprintWorkItemType';
                treeItem.iconPath = this.getWorkItemTypeIcon(type);
                treeItem.sprintId = element.sprintId;
                treeItem.workItemType = type;
                return treeItem;
            });
        } else if (element.contextValue === 'sprintWorkItemType') {
            // Show individual work items of this type
            const workItems = await this.loadSprintWorkItems(element.sprintId!);
            const itemsOfType = workItems.filter((item: any) =>
                item.fields['System.WorkItemType'] === element.workItemType
            );

            return itemsOfType.map((item: any) => {
                const title = item.fields['System.Title'];
                const state = item.fields['System.State'];
                const assignedTo = item.fields['System.AssignedTo']?.displayName || 'Unassigned';

                const treeItem = new SprintTreeItem(
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
                treeItem.workItemId = item.id;
                return treeItem;
            });
        } else if (element.contextValue === 'sprintCapacity') {
            // Show team capacity
            const capacity = await this.loadSprintCapacity(element.sprintId!);

            if (!capacity || !capacity.value || capacity.value.length === 0) {
                return [new SprintTreeItem('No capacity data available', vscode.TreeItemCollapsibleState.None)];
            }

            return capacity.value.map((member: any) => {
                const displayName = member.teamMember?.displayName || 'Unknown';
                const totalCapacity = member.activities?.reduce((sum: number, act: any) =>
                    sum + (act.capacityPerDay || 0), 0) || 0;

                const treeItem = new SprintTreeItem(
                    displayName,
                    vscode.TreeItemCollapsibleState.None
                );
                treeItem.description = `${totalCapacity} hours/day`;
                treeItem.iconPath = new vscode.ThemeIcon('person');
                treeItem.contextValue = 'capacityMember';
                return treeItem;
            });
        } else if (element.contextValue === 'sprintOpen') {
            // This should open in browser, not show children
            if (config) {
                const sprintUrl = `${config.organizationUrl}/${encodeURIComponent(config.defaultProject)}/_sprints/taskboard/${encodeURIComponent(config.defaultTeam)}/${encodeURIComponent(element.sprintPath || '')}`;
                vscode.env.openExternal(vscode.Uri.parse(sprintUrl));
            }
            return [];
        }

        return [];
    }

    private createSectionItem(label: string, contextValue: string, sprintId: string, icon: string, sprintPath?: string): SprintTreeItem {
        const isOpenAction = contextValue === 'sprintOpen';
        const treeItem = new SprintTreeItem(
            label,
            isOpenAction ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
            isOpenAction ? {
                command: 'azureDevOps.openSprint',
                title: 'Open Sprint in Browser',
                arguments: [{ sprintPath: sprintPath }]
            } : undefined
        );
        treeItem.contextValue = contextValue;
        treeItem.iconPath = new vscode.ThemeIcon(icon);
        treeItem.sprintId = sprintId;
        treeItem.sprintPath = sprintPath;
        return treeItem;
    }

    private createSprintTooltip(sprint: any): vscode.MarkdownString {
        const attributes = sprint.attributes || {};
        const startDate = attributes.startDate ? new Date(attributes.startDate).toLocaleDateString() : 'Not set';
        const finishDate = attributes.finishDate ? new Date(attributes.finishDate).toLocaleDateString() : 'Not set';
        const timeFrame = attributes.timeFrame || 'Not specified';

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${sprint.name}\n\n`);
        md.appendMarkdown(`**Start Date:** ${startDate}\n\n`);
        md.appendMarkdown(`**End Date:** ${finishDate}\n\n`);
        md.appendMarkdown(`**Time Frame:** ${timeFrame}\n\n`);
        md.appendMarkdown(`**Path:** ${sprint.path}\n\n`);

        return md;
    }

    private getWorkItemTypeIcon(type: string): vscode.ThemeIcon {
        switch (type.toLowerCase()) {
            case 'user story':
                return new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue'));
            case 'task':
                return new vscode.ThemeIcon('checklist', new vscode.ThemeColor('charts.yellow'));
            case 'bug':
                return new vscode.ThemeIcon('bug', new vscode.ThemeColor('charts.red'));
            case 'epic':
                return new vscode.ThemeIcon('rocket', new vscode.ThemeColor('charts.purple'));
            case 'feature':
                return new vscode.ThemeIcon('star', new vscode.ThemeColor('charts.orange'));
            default:
                return new vscode.ThemeIcon('circle');
        }
    }
}

export class SprintTreeItem extends vscode.TreeItem {
    public sprintId?: string;
    public sprintPath?: string;
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
