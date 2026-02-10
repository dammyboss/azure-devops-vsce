import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';

export class BoardProvider implements vscode.TreeDataProvider<BoardTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BoardTreeItem | undefined | void> = new vscode.EventEmitter<BoardTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<BoardTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    private authenticationManager: AuthenticationManager;
    private boards: any[] = [];
    private boardColumns: Map<string, any[]> = new Map();
    private columnWorkItems: Map<string, any[]> = new Map();
    private teamIterations: Array<{name: string, path: string, timeFrame: string}> = [];
    private currentIterationPath: string | null = null;
    private selectedIterationFilter: string | null = null; // null = all, '@current' = current sprint, or specific path
    private teamMembers: Array<{displayName: string, uniqueName: string}> = [];
    private selectedAssigneeFilter: string | null = null; // null = all, '@me' = current user, or specific uniqueName
    private filtersExpanded: boolean = true; // Whether the Filters node is expanded

    constructor(context: vscode.ExtensionContext, authenticationManager: AuthenticationManager) {
        this.context = context;
        this.authenticationManager = authenticationManager;
    }

    refresh(): void {
        this.boardColumns.clear();
        this.columnWorkItems.clear();
        this._onDidChangeTreeData.fire();
    }

    private async loadBoards(): Promise<void> {
        if (!this.authenticationManager.isConnected()) {
            this.boards = [];
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config.defaultTeam) {
                this.boards = [];
                return;
            }

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards`
            );

            this.boards = response.data.value || [];

            // Load iterations and team members on first load
            if (this.teamIterations.length === 0) {
                await this.loadTeamIterations();
            }
            if (this.teamMembers.length === 0) {
                await this.loadTeamMembers();
            }
        } catch (error: any) {
            console.error('Failed to load boards:', error?.message || error);
            this.boards = [];
        }
    }

    /**
     * Load all team iterations from Azure DevOps API
     * API Reference: https://learn.microsoft.com/en-us/rest/api/azure/devops/work/iterations/list
     */
    private async loadTeamIterations(): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) {
                return;
            }

            // Get all team iterations
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations`,
                { params: { 'api-version': '7.1' } }
            );

            const iterations = response.data.value || [];
            this.teamIterations = iterations.map((iter: any) => ({
                name: iter.name,
                path: iter.path,
                timeFrame: iter.attributes?.timeFrame || 'unknown'
            }));

            // Find current iteration
            const currentIter = this.teamIterations.find(i => i.timeFrame === 'current');
            if (currentIter) {
                this.currentIterationPath = currentIter.path;
            }

            console.log('[BoardProvider] Loaded', this.teamIterations.length, 'team iterations');
        } catch (error: any) {
            console.error('Failed to load team iterations:', error?.message || error);
        }
    }

    /**
     * Load team members from Azure DevOps API
     */
    private async loadTeamMembers(): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) {
                return;
            }

            const response = await axiosInstance.get(
                `/_apis/projects/${encodeURIComponent(config.defaultProject)}/teams/${encodeURIComponent(config.defaultTeam)}/members`,
                { params: { 'api-version': '7.1' } }
            );

            const members = response.data.value || [];
            this.teamMembers = members.map((member: any) => ({
                displayName: member.identity.displayName,
                uniqueName: member.identity.uniqueName
            }));

            console.log('[BoardProvider] Loaded', this.teamMembers.length, 'team members');
        } catch (error: any) {
            console.error('Failed to load team members:', error?.message || error);
        }
    }

    public setIterationFilter(iterationFilter: string | null): void {
        this.selectedIterationFilter = iterationFilter;
        this.columnWorkItems.clear();
        this.refresh();
    }

    public getIterationFilter(): string | null {
        return this.selectedIterationFilter;
    }

    public getTeamIterations(): Array<{name: string, path: string, timeFrame: string}> {
        return this.teamIterations;
    }

    public setAssigneeFilter(assigneeFilter: string | null): void {
        this.selectedAssigneeFilter = assigneeFilter;
        this.columnWorkItems.clear();
        this.refresh();
    }

    public getAssigneeFilter(): string | null {
        return this.selectedAssigneeFilter;
    }

    public getTeamMembers(): Array<{displayName: string, uniqueName: string}> {
        return this.teamMembers;
    }

    public clearAllFilters(): void {
        this.selectedIterationFilter = null;
        this.selectedAssigneeFilter = null;
        this.columnWorkItems.clear();
        this.refresh();
    }

    public hasActiveFilters(): boolean {
        return this.selectedIterationFilter !== null || this.selectedAssigneeFilter !== null;
    }

    public getActiveFilterCount(): number {
        let count = 0;
        if (this.selectedIterationFilter) count++;
        if (this.selectedAssigneeFilter) count++;
        return count;
    }

    private async loadBoardColumns(boardId: string): Promise<any[]> {
        if (this.boardColumns.has(boardId)) {
            return this.boardColumns.get(boardId) || [];
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config.defaultTeam) {
                return [];
            }

            // Fetch board columns using the same endpoint as boardPanel.ts
            // This ensures column names match what System.BoardColumn stores
            // API Reference: https://learn.microsoft.com/en-us/rest/api/azure/devops/work/boards/get
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards/${boardId}/columns`
            );

            // Extract columns from response (includes id, name, columnType, itemLimit, stateMappings)
            const columns = response.data.value || [];

            console.log('[BoardProvider] Loaded', columns.length, 'columns for board', boardId);
            console.log('[BoardProvider] Column details:', columns.map((c: any) => ({
                id: c.id,
                name: c.name,
                columnType: c.columnType
            })));

            this.boardColumns.set(boardId, columns);
            return columns;
        } catch (error: any) {
            console.error('Failed to load board columns:', error?.message || error);
            return [];
        }
    }

    private async loadColumnWorkItems(boardId: string, columnName: string): Promise<any[]> {
        const key = `${boardId}:${columnName}`;
        if (this.columnWorkItems.has(key)) {
            return this.columnWorkItems.get(key) || [];
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) {
                return [];
            }

            // Find the board and column to get state mappings
            const board = this.boards.find(b => b.id === boardId);
            if (!board) return [];

            const columns = this.boardColumns.get(boardId) || [];
            const column = columns.find(c => c.name === columnName);

            console.log('[BoardProvider] Loading work items for column:', columnName);

            // Official Azure DevOps approach: Query by System.State (not System.BoardColumn)
            // System.BoardColumn is not documented as a standard queryable field
            // Reference: https://learn.microsoft.com/en-us/azure/devops/boards/queries/wiql-syntax

            if (!column?.stateMappings) {
                console.log('[BoardProvider] Column has no state mappings');
                this.columnWorkItems.set(key, []);
                return [];
            }

            // Build state-based WIQL query using column's state mappings
            // Extract states from stateMappings (maps work item type -> state)
            const states = Object.values(column.stateMappings);
            if (states.length === 0) {
                console.log('[BoardProvider] No states found in column state mappings');
                this.columnWorkItems.set(key, []);
                return [];
            }

            console.log('[BoardProvider] Column state mappings:', column.stateMappings);

            // Build state filter for WIQL
            const stateConditions = states
                .map((state: any) => `[System.State] = '${state.replace(/'/g, "''")}'`)
                .join(' OR ');

            // Build work item type filter from stateMappings keys
            const workItemTypes = Object.keys(column.stateMappings);
            const typeConditions = workItemTypes
                .map(type => `[System.WorkItemType] = '${type.replace(/'/g, "''")}'`)
                .join(' OR ');

            // Build iteration filter
            let iterationFilter = '';
            if (this.selectedIterationFilter) {
                if (this.selectedIterationFilter === '@current') {
                    if (this.currentIterationPath) {
                        iterationFilter = `AND [System.IterationPath] = '${this.currentIterationPath.replace(/'/g, "''")}'`;
                    }
                } else {
                    iterationFilter = `AND [System.IterationPath] = '${this.selectedIterationFilter.replace(/'/g, "''")}'`;
                }
            }

            // Build assignee filter
            let assigneeFilter = '';
            if (this.selectedAssigneeFilter) {
                if (this.selectedAssigneeFilter === '@me') {
                    assigneeFilter = `AND [System.AssignedTo] = @me`;
                } else {
                    assigneeFilter = `AND [System.AssignedTo] = '${this.selectedAssigneeFilter.replace(/'/g, "''")}'`;
                }
            }

            // Build WIQL query using official Azure DevOps syntax
            const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.IterationPath]
                          FROM WorkItems
                          WHERE [System.TeamProject] = @project
                          AND (${stateConditions})
                          AND (${typeConditions})
                          ${iterationFilter}
                          ${assigneeFilter}
                          ORDER BY [Microsoft.VSTS.Common.BacklogPriority] ASC`;

            console.log('[BoardProvider] WIQL query:', wiql);

            // Execute WIQL query
            const wiqlResponse = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql },
                { params: { 'api-version': '7.1' } }
            );

            const workItemRefs = wiqlResponse.data.workItems || [];
            console.log('[BoardProvider] WIQL query returned', workItemRefs.length, 'work item references');

            if (workItemRefs.length === 0) {
                this.columnWorkItems.set(key, []);
                return [];
            }

            // Fetch work item details (max 200 per request as per Azure DevOps limits)
            const workItemIds = workItemRefs.slice(0, 200).map((ref: any) => ref.id).join(',');
            const detailsResponse = await axiosInstance.get(`/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitems`, {
                params: {
                    'ids': workItemIds,
                    'api-version': '7.1'
                }
            });

            let filteredWorkItems = detailsResponse.data.value || [];
            console.log('[BoardProvider] Fetched details for', filteredWorkItems.length, 'work items');

            // Filter to match exact type+state combination for this column
            // This prevents showing items from other columns with overlapping states
            filteredWorkItems = filteredWorkItems.filter((item: any) => {
                const itemType = item.fields['System.WorkItemType'];
                const itemState = item.fields['System.State'];
                const expectedState = column.stateMappings[itemType];

                const matches = expectedState === itemState;
                if (!matches) {
                    console.log(`[BoardProvider] Filtered out item ${item.id}: type="${itemType}", state="${itemState}", expected="${expectedState}"`);
                }
                return matches;
            });

            console.log(`[BoardProvider] After type+state filtering: ${filteredWorkItems.length} work items for column "${columnName}"`);

            // Filters are already applied in the WIQL query
            this.columnWorkItems.set(key, filteredWorkItems);
            return filteredWorkItems;
        } catch (error: any) {
            console.error('Failed to load column work items:', error?.message || error);
            return [];
        }
    }

    getTreeItem(element: BoardTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BoardTreeItem): Promise<BoardTreeItem[]> {
        if (!this.authenticationManager.isConnected()) {
            return [];
        }

        const config = this.authenticationManager.getConfig();
        if (!config?.defaultProject || !config?.defaultTeam) {
            return [];
        }

        if (!element) {
            // Root level - show Filters node and boards
            await this.loadBoards();

            const items: BoardTreeItem[] = [];

            // Add collapsible Filters parent node
            const activeCount = this.getActiveFilterCount();
            const filterLabel = activeCount > 0 ? `Filters (${activeCount} active)` : 'Filters';
            const filtersNode = new BoardTreeItem(
                filterLabel,
                this.filtersExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
            );
            filtersNode.contextValue = 'filtersParent';
            filtersNode.iconPath = new vscode.ThemeIcon('filter');
            filtersNode.tooltip = 'Click to expand/collapse filters';
            items.push(filtersNode);

            if (this.boards.length === 0) {
                items.push(new BoardTreeItem('No boards found', vscode.TreeItemCollapsibleState.None));
                return items;
            }

            // Add boards
            this.boards.forEach(board => {
                const treeItem = new BoardTreeItem(
                    board.name,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                treeItem.contextValue = 'board';
                treeItem.iconPath = new vscode.ThemeIcon('project');
                treeItem.tooltip = board.description || `Board: ${board.name}`;
                treeItem.boardId = board.id;
                treeItem.boardName = board.name;
                items.push(treeItem);
            });

            return items;
        } else if (element.contextValue === 'filtersParent') {
            // Show individual filter items
            const items: BoardTreeItem[] = [];

            // Sprint/Iteration filter
            const sprintLabel = this.getSprintFilterLabel();
            const sprintItem = new BoardTreeItem(
                sprintLabel,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'azureDevOps.boards.changeIterationFilter',
                    title: 'Change Sprint Filter',
                    arguments: []
                }
            );
            sprintItem.contextValue = 'sprintFilter';
            sprintItem.iconPath = new vscode.ThemeIcon('calendar');
            sprintItem.tooltip = 'Click to change sprint/iteration filter';
            items.push(sprintItem);

            // Assigned To filter
            const assigneeLabel = this.getAssigneeFilterLabel();
            const assigneeItem = new BoardTreeItem(
                assigneeLabel,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'azureDevOps.boards.changeAssigneeFilter',
                    title: 'Change Assignee Filter',
                    arguments: []
                }
            );
            assigneeItem.contextValue = 'assigneeFilter';
            assigneeItem.iconPath = new vscode.ThemeIcon('person');
            assigneeItem.tooltip = 'Click to change assignee filter';
            items.push(assigneeItem);

            // Clear all filters button (only show if filters are active)
            if (this.hasActiveFilters()) {
                const clearItem = new BoardTreeItem(
                    'Clear All Filters',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'azureDevOps.boards.clearAllFilters',
                        title: 'Clear All Filters',
                        arguments: []
                    }
                );
                clearItem.contextValue = 'clearFilters';
                clearItem.iconPath = new vscode.ThemeIcon('clear-all');
                clearItem.tooltip = 'Remove all active filters';
                items.push(clearItem);
            }

            return items;
        } else if (element.contextValue === 'board') {
            // Show board columns
            const columns = await this.loadBoardColumns(element.boardId!);

            if (columns.length === 0) {
                return [new BoardTreeItem('No columns found', vscode.TreeItemCollapsibleState.None)];
            }

            return columns.map((column: any) => {
                const itemLimit = column.itemLimit ? `Limit: ${column.itemLimit}` : 'No limit';
                const treeItem = new BoardTreeItem(
                    column.name,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                treeItem.description = itemLimit;
                treeItem.contextValue = 'boardColumn';
                treeItem.iconPath = this.getColumnIcon(column.columnType);
                treeItem.tooltip = `${column.name}\n${itemLimit}`;
                treeItem.boardId = element.boardId;
                treeItem.columnName = column.name;
                return treeItem;
            });
        } else if (element.contextValue === 'boardColumn') {
            // Show work items in this column
            const workItems = await this.loadColumnWorkItems(element.boardId!, element.columnName!);

            if (workItems.length === 0) {
                return [new BoardTreeItem('No work items', vscode.TreeItemCollapsibleState.None)];
            }

            return workItems.map((item: any) => {
                const title = item.fields['System.Title'];
                const assignedTo = item.fields['System.AssignedTo']?.displayName || 'Unassigned';

                const treeItem = new BoardTreeItem(
                    `#${item.id}: ${title}`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'azureDevOps.viewWorkItemDetails',
                        title: 'View Work Item Details',
                        arguments: [item.id]
                    }
                );
                treeItem.description = assignedTo;
                treeItem.contextValue = 'workItem';
                treeItem.workItemId = item.id;
                treeItem.iconPath = new vscode.ThemeIcon('circle-filled');
                return treeItem;
            });
        }

        return [];
    }

    private getSprintFilterLabel(): string {
        if (!this.selectedIterationFilter) {
            return 'Sprint: All';
        } else if (this.selectedIterationFilter === '@current') {
            const currentIter = this.teamIterations.find(i => i.timeFrame === 'current');
            return `Sprint: ${currentIter?.name || 'Current'}`;
        } else {
            const selectedIter = this.teamIterations.find(i => i.path === this.selectedIterationFilter);
            return `Sprint: ${selectedIter?.name || 'Selected'}`;
        }
    }

    private getAssigneeFilterLabel(): string {
        if (!this.selectedAssigneeFilter) {
            return 'Assigned To: All';
        } else if (this.selectedAssigneeFilter === '@me') {
            return 'Assigned To: Me';
        } else {
            const member = this.teamMembers.find(m => m.uniqueName === this.selectedAssigneeFilter);
            return `Assigned To: ${member?.displayName || 'Selected'}`;
        }
    }

    private getColumnIcon(columnType: string): vscode.ThemeIcon {
        switch (columnType) {
            case 'incoming':
                return new vscode.ThemeIcon('inbox', new vscode.ThemeColor('charts.gray'));
            case 'inProgress':
                return new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.blue'));
            case 'outgoing':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            default:
                return new vscode.ThemeIcon('circle');
        }
    }
}

export class BoardTreeItem extends vscode.TreeItem {
    public boardId?: string;
    public boardName?: string;
    public columnName?: string;
    public workItemId?: number;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}
