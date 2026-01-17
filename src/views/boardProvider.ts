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
        } catch (error: any) {
            console.error('Failed to load boards:', error?.message || error);
            this.boards = [];
        }
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

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards/${boardId}/columns`
            );

            const columns = response.data.value || [];
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

            // Find the board to get its work item type
            const board = this.boards.find(b => b.id === boardId);
            if (!board) return [];

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

            // Query work items in this column using WIQL with type filter
            const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo]
                          FROM WorkItems
                          WHERE [System.TeamProject] = @project
                          AND [System.BoardColumn] = '${columnName}'
                          ${workItemTypeFilter}
                          ORDER BY [Microsoft.VSTS.Common.BacklogPriority]`;

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql }
            );

            const workItemRefs = response.data.workItems || [];
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
            // Root level - show boards
            await this.loadBoards();

            if (this.boards.length === 0) {
                return [new BoardTreeItem('No boards found', vscode.TreeItemCollapsibleState.None)];
            }

            return this.boards.map(board => {
                const treeItem = new BoardTreeItem(
                    board.name,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                treeItem.contextValue = 'board';
                treeItem.iconPath = new vscode.ThemeIcon('project');
                treeItem.tooltip = board.description || `Board: ${board.name}`;
                treeItem.boardId = board.id;
                treeItem.boardName = board.name;
                return treeItem;
            });
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
