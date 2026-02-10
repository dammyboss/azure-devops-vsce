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

            // Fetch full board details (includes columns with state mappings)
            // API Reference: https://learn.microsoft.com/en-us/rest/api/azure/devops/work/boards/get
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards/${boardId}`
            );

            // Extract columns from board response (includes id, name, columnType, itemLimit, stateMappings)
            const columns = response.data.columns || [];

            console.log('[BoardProvider] Loaded', columns.length, 'columns for board', boardId);

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

            // Get backlog work item types for this specific board
            let allowedWorkItemTypes: string[] = [];
            try {
                const backlogsResponse = await axiosInstance.get(
                    `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/backlogs`
                );

                const backlogs = backlogsResponse.data.value || [];
                const matchingBacklog = backlogs.find((b: any) =>
                    b.name === board.name || b.id === boardId
                );

                if (matchingBacklog && matchingBacklog.workItemTypes) {
                    allowedWorkItemTypes = matchingBacklog.workItemTypes.map((wit: any) => wit.name);
                }
            } catch (error) {
                console.error('Failed to load backlog configuration:', error);
            }

            // Build work item type filter
            let workItemTypeFilter = '';
            if (allowedWorkItemTypes.length > 0) {
                const typeConditions = allowedWorkItemTypes
                    .map(t => `[System.WorkItemType] = '${t.replace(/'/g, "''")}'`)
                    .join(' OR ');
                workItemTypeFilter = `AND (${typeConditions})`;
            }

            // Build iteration filter
            let iterationFilter = '';
            if (this.selectedIterationFilter) {
                if (this.selectedIterationFilter === '@current') {
                    // Filter by current iteration
                    if (this.currentIterationPath) {
                        iterationFilter = `AND [System.IterationPath] = '${this.currentIterationPath.replace(/'/g, "''")}'`;
                    }
                } else {
                    // Filter by specific iteration path
                    iterationFilter = `AND [System.IterationPath] = '${this.selectedIterationFilter.replace(/'/g, "''")}'`;
                }
            }

            // Build assignee filter
            let assigneeFilter = '';
            if (this.selectedAssigneeFilter) {
                if (this.selectedAssigneeFilter === '@me') {
                    // Filter by current user using WIQL @me macro
                    assigneeFilter = `AND [System.AssignedTo] = @me`;
                } else {
                    // Filter by specific user
                    assigneeFilter = `AND [System.AssignedTo] = '${this.selectedAssigneeFilter.replace(/'/g, "''")}'`;
                }
            }

            // Strategy 1: Try querying by System.BoardColumn first
            let wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo]
                        FROM WorkItems
                        WHERE [System.TeamProject] = @project
                        AND [System.BoardColumn] = '${columnName.replace(/'/g, "''")}'
                        ${workItemTypeFilter}
                        ${iterationFilter}
                        ${assigneeFilter}
                        ORDER BY [Microsoft.VSTS.Common.BacklogPriority]`;

            console.log('[BoardProvider] Trying System.BoardColumn query for column:', columnName);
            if (iterationFilter) {
                console.log('[BoardProvider] With iteration filter:', this.selectedIterationFilter);
            }
            if (assigneeFilter) {
                console.log('[BoardProvider] With assignee filter:', this.selectedAssigneeFilter);
            }

            let response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql }
            );

            let workItemRefs = response.data.workItems || [];

            // Strategy 2: If no results and column has state mappings, fall back to state-based query
            if (workItemRefs.length === 0 && column?.stateMappings) {
                console.log('[BoardProvider] System.BoardColumn returned 0 results, trying state-based query');

                const states = Object.values(column.stateMappings);

                if (states.length > 0) {
                    // Build state filter
                    const stateConditions = states
                        .map((state: any) => `[System.State] = '${state.replace(/'/g, "''")}'`)
                        .join(' OR ');

                    wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo]
                            FROM WorkItems
                            WHERE [System.TeamProject] = @project
                            AND (${stateConditions})
                            ${workItemTypeFilter}
                            ${iterationFilter}
                            ${assigneeFilter}
                            ORDER BY [Microsoft.VSTS.Common.BacklogPriority]`;

                    console.log('[BoardProvider] Using state-based query with states:', states);

                    response = await axiosInstance.post(
                        `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                        { query: wiql }
                    );

                    workItemRefs = response.data.workItems || [];
                    console.log('[BoardProvider] State-based query returned', workItemRefs.length, 'work items');
                }
            }

            if (workItemRefs.length === 0) {
                this.columnWorkItems.set(key, []);
                return [];
            }

            const workItemIds = workItemRefs.slice(0, 50).map((item: any) => item.id).join(',');
            const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: { 'ids': workItemIds }
            });

            const workItems = detailsResponse.data.value || [];
            this.columnWorkItems.set(key, workItems);
            return workItems;
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
