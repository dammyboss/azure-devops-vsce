import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItemEventManager } from '../events/workItemEventManager';

interface BoardColumn {
    id: string;
    name: string;
    itemLimit: number;
    stateMappings: Record<string, string>;
    isSplit: boolean;
    description: string;
    columnType: 'incoming' | 'inProgress' | 'outgoing';
}

interface BoardWorkItem {
    id: number;
    title: string;
    state: string;
    type: string;
    assignedTo?: {
        displayName: string;
        uniqueName: string;
        imageUrl?: string;
    };
    priority?: number;
    tags?: string;
    areaPath?: string;
    boardColumn?: string;
    children?: {
        id: number;
        title: string;
        state: string;
        type: string;
    }[];
}

interface Board {
    id: string;
    name: string;
    columns: BoardColumn[];
    workItems: Map<string, BoardWorkItem[]>;
}

interface AvailableBoard {
    id: string;
    name: string;
}

export class BoardPanel {
    public static currentPanel: BoardPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private authenticationManager: AuthenticationManager;
    private currentBoard: Board | null = null;
    private availableBoards: AvailableBoard[] = [];
    private boardId: string;
    private boardName: string;
    private _refreshInterval: NodeJS.Timeout | undefined;
    private _lastRefreshTime: number = 0;
    private eventManager = WorkItemEventManager.getInstance();
    private eventSubscription: vscode.Disposable | null = null;
    private _tagColors: Map<string, string> = new Map();
    private _cardStyleRules: Array<{name: string, filter: string, settings: any}> = [];
    private _projectWorkItemTypes: string[] = [];
    private _pendingMoves: Set<number> = new Set();

    public static createOrShow(
        extensionUri: vscode.Uri,
        authenticationManager: AuthenticationManager,
        boardId: string,
        boardName: string
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel for this board, show it
        if (BoardPanel.currentPanel && BoardPanel.currentPanel.boardId === boardId) {
            BoardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'azureDevOpsBoard',
            `Board: ${boardName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        BoardPanel.currentPanel = new BoardPanel(panel, extensionUri, authenticationManager, boardId, boardName);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        authenticationManager: AuthenticationManager,
        boardId: string,
        boardName: string
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.authenticationManager = authenticationManager;
        this.boardId = boardId;
        this.boardName = boardName;

        // Set initial loading state
        this._panel.webview.html = this._getLoadingHtml();

        // Subscribe to work item updates from other views
        this.eventSubscription = this.eventManager.onWorkItemUpdated(() => {
            // Don't refresh if we have pending moves (to avoid race conditions)
            if (this._pendingMoves.size === 0) {
                this._loadAndRender();
            }
        });

        // Load board data and update
        this._loadAndRender();

        // Start auto-refresh (every 30 seconds)
        this._startAutoRefresh();

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'moveWorkItem':
                        await this._moveWorkItem(message.workItemId, message.targetColumn, message.targetState);
                        break;
                    case 'openWorkItem':
                        vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', message.workItemId);
                        break;
                    case 'refresh':
                        await this._loadAndRender();
                        break;
                    case 'openInBrowser':
                        this._openBoardInBrowser();
                        break;
                    case 'createWorkItem':
                        await this._createWorkItem(message.columnName, message.title, message.workItemType);
                        break;
                    case 'assignToMe':
                        await this._assignToMe(message.workItemId);
                        break;
                    case 'changeState':
                        await this._changeState(message.workItemId, message.state);
                        break;
                    case 'addComment':
                        await this._addComment(message.workItemId);
                        break;
                    case 'copyId':
                        await vscode.env.clipboard.writeText(message.workItemId.toString());
                        vscode.window.showInformationMessage(`Copied #${message.workItemId} to clipboard`);
                        break;
                    case 'copyUrl':
                        await this._copyWorkItemUrl(message.workItemId);
                        break;
                    case 'openWorkItemInBrowser':
                        this._openWorkItemInBrowser(message.workItemId);
                        break;
                    case 'createBranch':
                        vscode.commands.executeCommand('azureDevOps.createBranchFromWorkItem', message.workItemId);
                        break;
                    case 'switchBoard':
                        await this._switchBoard(message.boardId, message.boardName);
                        break;
                    case 'showError':
                        vscode.window.showErrorMessage(message.text);
                        break;
                    case 'showInfo':
                        vscode.window.showInformationMessage(message.text);
                        break;
                    case 'getCurrentUser':
                        const currentUser = await this.authenticationManager.getCurrentUser();
                        this._panel.webview.postMessage({
                            command: 'setCurrentUser',
                            email: currentUser?.uniqueName || currentUser?.emailAddress || ''
                        });
                        break;
                    case 'updateWorkItemTitle':
                        await this._updateWorkItemTitle(message.workItemId, message.title);
                        break;
                    case 'updateWorkItemEffort':
                        await this._updateWorkItemEffort(message.workItemId, message.effort);
                        break;
                    case 'changeAssignee':
                        await this._changeAssignee(message.workItemId);
                        break;
                    case 'confirmDeleteWorkItem':
                        await this._confirmDeleteWorkItem(message.workItemId);
                        break;
                    case 'deleteWorkItem':
                        await this._deleteWorkItem(message.workItemId);
                        break;
                    case 'moveToColumn':
                        await this._showMoveToColumnPicker(message.workItemId);
                        break;
                    case 'moveToIteration':
                        await this._showMoveToIterationPicker(message.workItemId);
                        break;
                    case 'addChildWorkItem':
                        await this._addChildWorkItem(message.workItemId, message.workItemType);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private _teamMembers: Array<{displayName: string, uniqueName: string}> = [];

    private async _loadAndRender() {
        try {
            // Update last refresh time
            this._lastRefreshTime = Date.now();

            // Load available boards for the dropdown
            this.availableBoards = await this._getAvailableBoards();
            // Load tag colors from Azure DevOps
            await this._getTagColors();
            // Fetch all work item types from the project
            await this._fetchProjectWorkItemTypes();
            // Load team members for filter
            this._teamMembers = await this._getTeamMembers();
            await this._loadBoardData();

            // Add any assignees from work items that aren't in team members
            if (this.currentBoard) {
                const uniqueAssignees = new Map<string, {displayName: string, uniqueName: string}>();
                
                // First add existing team members
                this._teamMembers.forEach(m => uniqueAssignees.set(m.uniqueName.toLowerCase(), m));

                // Then add from work items
                this.currentBoard.workItems.forEach(items => {
                    items.forEach(item => {
                        const assignee = item.assignedTo as any;
                        if (assignee) {
                            // Handle if assignee is a complex object (standard)
                            if (assignee.uniqueName && assignee.displayName) {
                                const key = assignee.uniqueName.toLowerCase();
                                if (!uniqueAssignees.has(key)) {
                                    uniqueAssignees.set(key, {
                                        displayName: assignee.displayName,
                                        uniqueName: assignee.uniqueName
                                    });
                                }
                            }
                            // Handle edge case if assignee is just a string (sometimes happens in older API versions or specific configs)
                            else if (typeof assignee === 'string') {
                                // Use the string as both uniqueName and displayName if we can't do better
                                const key = assignee.toLowerCase();
                                // Try to ignore if it looks like an email but we already have it
                                let exists = false;
                                for (const existing of uniqueAssignees.values()) {
                                    if (existing.uniqueName.toLowerCase() === key || existing.displayName.toLowerCase() === key) {
                                        exists = true;
                                        break;
                                    }
                                }
                                
                                if (!exists) {
                                    uniqueAssignees.set(key, {
                                        displayName: assignee,
                                        uniqueName: assignee
                                    });
                                }
                            }
                        }
                    });
                });

                // Update team members list
                this._teamMembers = Array.from(uniqueAssignees.values())
                    .sort((a, b) => a.displayName.localeCompare(b.displayName));
            }

            this._panel.webview.html = this._getHtmlForWebview();
        } catch (error) {
            console.error('Failed to load board:', error);
            this._panel.webview.html = this._getErrorHtml('Failed to load board data');
        }
    }

    private async _loadBoardData(): Promise<void> {
        const axiosInstance = this.authenticationManager.getAxiosInstance();
        const config = this.authenticationManager.getConfig();

        if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) {
            throw new Error('Not connected to Azure DevOps');
        }

        // Get the backlog work item types for this specific board
        // First, get the team's backlog configuration to map board names to work item types
        let allowedWorkItemTypes: string[] = [];

        try {
            // Get team settings which includes backlog configuration
            const backlogsResponse = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/backlogs`
            );

            const backlogs = backlogsResponse.data.value || [];
            // Find the backlog that matches this board's name
            const matchingBacklog = backlogs.find((b: any) =>
                b.name === this.boardName || b.id === this.boardId
            );

            if (matchingBacklog && matchingBacklog.workItemTypes) {
                // workItemTypes is an array of { name: "Epic" } objects
                allowedWorkItemTypes = matchingBacklog.workItemTypes.map((wit: any) => wit.name);
            }
        } catch (error) {
            console.error('Failed to load backlog configuration:', error);
            // Continue without filtering - will show all items
        }

        // Load board columns
        const columnsResponse = await axiosInstance.get(
            `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards/${this.boardId}/columns`
        );

        const columns: BoardColumn[] = (columnsResponse.data.value || []).map((col: any) => ({
            id: col.id || col.name,
            name: col.name,
            itemLimit: col.itemLimit || 0,
            stateMappings: col.stateMappings || {},
            isSplit: col.isSplit || false,
            description: col.description || '',
            columnType: col.columnType || 'inProgress'
        }));

        // Load work items for the board using WIQL
        const workItemsMap = new Map<string, BoardWorkItem[]>();

        // Initialize empty arrays for each column
        for (const column of columns) {
            workItemsMap.set(column.name, []);
        }

        // Build work item type filter for WIQL
        let workItemTypeFilter = '';
        if (allowedWorkItemTypes.length > 0) {
            const typeConditions = allowedWorkItemTypes
                .map(t => `[System.WorkItemType] = '${t.replace(/'/g, "''")}'`)
                .join(' OR ');
            workItemTypeFilter = `AND (${typeConditions})`;
        }

        // Query work items for all columns
        for (const column of columns) {
            try {
                const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [Microsoft.VSTS.Common.Priority], [System.Tags], [System.AreaPath]
                              FROM WorkItems
                              WHERE [System.TeamProject] = @project
                              AND [System.BoardColumn] = '${column.name.replace(/'/g, "''")}'
                              ${workItemTypeFilter}
                              ORDER BY [Microsoft.VSTS.Common.BacklogPriority]`;

                const wiqlResponse = await axiosInstance.post(
                    `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                    { query: wiql }
                );

                const workItemRefs = wiqlResponse.data.workItems || [];

                if (workItemRefs.length > 0) {
                    const workItemIds = workItemRefs.slice(0, 100).map((item: any) => item.id).join(',');
                    const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                        params: {
                            'ids': workItemIds,
                            '$expand': 'relations',
                            'api-version': '7.1'
                        }
                    });

                    const workItems: BoardWorkItem[] = (detailsResponse.data.value || []).map((item: any) => {
                        const workItem: any = {
                            id: item.id,
                            title: item.fields['System.Title'],
                            state: item.fields['System.State'],
                            type: item.fields['System.WorkItemType'],
                            assignedTo: item.fields['System.AssignedTo'],
                            priority: item.fields['Microsoft.VSTS.Common.Priority'],
                            tags: item.fields['System.Tags'],
                            areaPath: item.fields['System.AreaPath'],
                            boardColumn: item.fields['System.BoardColumn'] || column.name
                        };
                        // Store relations temporarily for child work items loading
                        if (item.relations) {
                            workItem._tempRelations = item.relations;
                        }
                        return workItem;
                    });

                    workItemsMap.set(column.name, workItems);
                }
            } catch (error) {
                console.error(`Failed to load work items for column ${column.name}:`, error);
            }
        }

        // Fetch all child work items in a single batch
        try {
            await this._loadChildWorkItems(workItemsMap, axiosInstance);
        } catch (error) {
            console.error('Failed to load child work items:', error);
        }

        this.currentBoard = {
            id: this.boardId,
            name: this.boardName,
            columns,
            workItems: workItemsMap
        };
    }

    private async _loadChildWorkItems(workItemsMap: Map<string, BoardWorkItem[]>, axiosInstance: any): Promise<void> {
        try {
            // Collect all child work item IDs from all parent work items
            const allChildIds = new Set<string>();
            const parentToChildMap = new Map<number, string[]>(); // Maps parent ID to array of child IDs

            // Iterate through all work items to find children
            for (const [, workItems] of workItemsMap.entries()) {
                for (const workItem of workItems) {
                    const relations = (workItem as any)._tempRelations || [];
                    const childRelations = relations.filter((rel: any) =>
                        rel.rel === 'System.LinkTypes.Hierarchy-Forward' && rel.url
                    );

                    if (childRelations.length > 0) {
                        const childIds: string[] = [];
                        for (const rel of childRelations) {
                            const match = rel.url.match(/\/(\d+)$/);
                            if (match && match[1]) {
                                const childId = match[1];
                                allChildIds.add(childId);
                                childIds.push(childId);
                            }
                        }
                        if (childIds.length > 0) {
                            parentToChildMap.set(workItem.id, childIds);
                        }
                    }
                }
            }

            // If we have child IDs, fetch them all in one batch
            if (allChildIds.size > 0) {
                const childIdsString = Array.from(allChildIds).join(',');

                const childrenResponse = await axiosInstance.get('/_apis/wit/workitems', {
                    params: {
                        'ids': childIdsString,
                        'fields': 'System.Id,System.Title,System.State,System.WorkItemType',
                        'api-version': '7.1'
                    }
                });

                // Create a map of child ID to child data for quick lookup
                const childDataMap = new Map<number, any>();
                if (childrenResponse.data.value) {
                    for (const child of childrenResponse.data.value) {
                        childDataMap.set(child.id, {
                            id: child.id,
                            title: child.fields['System.Title'],
                            state: child.fields['System.State'],
                            type: child.fields['System.WorkItemType']
                        });
                    }
                }

                // Now assign children back to their parent work items
                for (const [, workItems] of workItemsMap.entries()) {
                    for (const workItem of workItems) {
                        const childIds = parentToChildMap.get(workItem.id);
                        if (childIds) {
                            workItem.children = childIds
                                .map(id => childDataMap.get(parseInt(id)))
                                .filter(child => child !== undefined);
                        }
                        // Clean up the temporary relations property
                        delete (workItem as any)._tempRelations;
                    }
                }
            } else {
                // Clean up relations from all work items even if no children
                for (const [, workItems] of workItemsMap.entries()) {
                    for (const workItem of workItems) {
                        delete (workItem as any)._tempRelations;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load child work items:', error);
            // Clean up relations even on error
            for (const [, workItems] of workItemsMap.entries()) {
                for (const workItem of workItems) {
                    delete (workItem as any)._tempRelations;
                }
            }
        }
    }

    private async _moveWorkItem(workItemId: number, targetColumn: string, targetState: string): Promise<void> {
        // Track this move as pending to prevent race conditions with refresh
        this._pendingMoves.add(workItemId);

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                throw new Error('Not connected');
            }

            // Update work item state
            await axiosInstance.patch(
                `/_apis/wit/workitems/${workItemId}`,
                [
                    { op: 'replace', path: '/fields/System.State', value: targetState }
                ],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            // Broadcast state change to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId,
                updateType: 'state-change',
                changes: [{ field: '/fields/System.State', newValue: targetState }]
            });

            // Send success message to webview (no full refresh needed - card already moved visually)
            this._panel.webview.postMessage({
                command: 'moveSuccess',
                workItemId,
                targetState
            });

            vscode.window.showInformationMessage(`Moved #${workItemId} to ${targetColumn}`);

            // Remove from pending moves after a short delay to ensure backend has propagated
            setTimeout(() => {
                this._pendingMoves.delete(workItemId);
            }, 1000);

        } catch (error: any) {
            // Remove from pending moves immediately on error
            this._pendingMoves.delete(workItemId);

            // Send failure message to webview for rollback
            this._panel.webview.postMessage({
                command: 'moveFailed',
                workItemId,
                message: error?.message || 'Failed to move work item'
            });

            vscode.window.showErrorMessage(`Failed to move work item: ${error?.message || error}`);
        }
    }

    private async _createWorkItem(columnName: string, title: string, workItemType?: string): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            // Find the state for this column
            const column = this.currentBoard?.columns.find(c => c.name === columnName);
            const stateMappings = column?.stateMappings || {};
            const state = Object.values(stateMappings)[0] || 'New';

            // Use provided type, or derive from board name, or fall back to config default
            const type = workItemType || this._getDefaultWorkItemType();

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitems/$${encodeURIComponent(type)}`,
                [
                    { op: 'add', path: '/fields/System.Title', value: title },
                    { op: 'add', path: '/fields/System.State', value: state }
                ],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            // Broadcast work item creation to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId: response.data.id,
                updateType: 'create',
                changes: [
                    { field: '/fields/System.Title', newValue: title },
                    { field: '/fields/System.State', newValue: state }
                ]
            });

            vscode.window.showInformationMessage(`Created ${type} #${response.data.id}`);

            // Refresh the board
            await this._loadAndRender();

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create work item: ${error?.message || error}`);
        }
    }

    private async _assignToMe(workItemId: number): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                throw new Error('Not connected');
            }

            const currentUser = await this.authenticationManager.getCurrentUser();
            if (!currentUser?.uniqueName) {
                throw new Error('Could not get current user');
            }

            await axiosInstance.patch(
                `/_apis/wit/workitems/${workItemId}`,
                [{ op: 'replace', path: '/fields/System.AssignedTo', value: currentUser.uniqueName }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            // Broadcast assignment to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId,
                updateType: 'assign',
                changes: [{ field: '/fields/System.AssignedTo', newValue: currentUser.uniqueName }]
            });

            // Send update to webview to update assignee avatar
            this._panel.webview.postMessage({
                command: 'updateAssignee',
                workItemId,
                assignee: currentUser
            });

            vscode.window.showInformationMessage(`Assigned #${workItemId} to you`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to assign: ${error?.message || error}`);
        }
    }

    private _openBoardInBrowser(): void {
        const config = this.authenticationManager.getConfig();
        if (config) {
            const url = `${config.organizationUrl}/${config.defaultProject}/_boards/board/t/${config.defaultTeam}/${this.boardName}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    private _openWorkItemInBrowser(workItemId: number): void {
        const config = this.authenticationManager.getConfig();
        if (config) {
            const url = `${config.organizationUrl}/${config.defaultProject}/_workitems/edit/${workItemId}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    private async _copyWorkItemUrl(workItemId: number): Promise<void> {
        const config = this.authenticationManager.getConfig();
        if (config) {
            const url = `${config.organizationUrl}/${config.defaultProject}/_workitems/edit/${workItemId}`;
            await vscode.env.clipboard.writeText(url);
            vscode.window.showInformationMessage('Work item URL copied to clipboard');
        }
    }

    private async _changeState(workItemId: number, newState: string): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                throw new Error('Not connected');
            }

            await axiosInstance.patch(
                `/_apis/wit/workitems/${workItemId}`,
                [{ op: 'replace', path: '/fields/System.State', value: newState }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            // Broadcast state change to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId,
                updateType: 'state-change',
                changes: [{ field: '/fields/System.State', newValue: newState }]
            });

            // Send update to webview to update state badge
            this._panel.webview.postMessage({
                command: 'updateState',
                workItemId,
                state: newState
            });

            vscode.window.showInformationMessage(`Changed #${workItemId} state to ${newState}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to change state: ${error?.message || error}`);
        }
    }

    private async _addComment(workItemId: number): Promise<void> {
        const comment = await vscode.window.showInputBox({
            prompt: `Add comment to work item #${workItemId}`,
            placeHolder: 'Enter your comment...',
            validateInput: (value) => value?.trim() ? null : 'Comment cannot be empty'
        });

        if (!comment) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${workItemId}/comments`,
                { text: comment },
                { params: { 'api-version': '7.1-preview.3' } }
            );

            vscode.window.showInformationMessage(`Comment added to #${workItemId}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to add comment: ${error?.message || error}`);
        }
    }

    private async _updateWorkItemTitle(workItemId: number, title: string): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            await axiosInstance.patch(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${workItemId}`,
                [
                    {
                        op: 'replace',
                        path: '/fields/System.Title',
                        value: title
                    }
                ],
                {
                    params: { 'api-version': '7.1' },
                    headers: { 'Content-Type': 'application/json-patch+json' }
                }
            );

            // No need for full refresh - webview already updated the title
            vscode.window.showInformationMessage(`Updated title for #${workItemId}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to update title: ${error?.message || error}`);
        }
    }

    private async _updateWorkItemEffort(workItemId: number, effort: number | null): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            const fieldName = 'Microsoft.VSTS.Scheduling.Effort';
            const patchOp = effort !== null
                ? { op: 'replace', path: `/fields/${fieldName}`, value: effort }
                : { op: 'remove', path: `/fields/${fieldName}` };

            await axiosInstance.patch(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${workItemId}`,
                [patchOp],
                {
                    params: { 'api-version': '7.1' },
                    headers: { 'Content-Type': 'application/json-patch+json' }
                }
            );

            // No need for full refresh - webview already updated the effort
            vscode.window.showInformationMessage(`Updated effort for #${workItemId}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to update effort: ${error?.message || error}`);
        }
    }

    private async _changeAssignee(workItemId: number): Promise<void> {
        const teamMembers = await this._getTeamMembers();

        const items = [
            { label: 'Unassigned', description: 'Remove assignee', uniqueName: '' },
            ...teamMembers.map(m => ({
                label: m.displayName,
                description: m.uniqueName,
                uniqueName: m.uniqueName
            }))
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select assignee'
        });

        if (!selected) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            const patchOp = selected.uniqueName
                ? { op: 'replace', path: '/fields/System.AssignedTo', value: selected.uniqueName }
                : { op: 'remove', path: '/fields/System.AssignedTo' };

            await axiosInstance.patch(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${workItemId}`,
                [patchOp],
                {
                    params: { 'api-version': '7.1' },
                    headers: { 'Content-Type': 'application/json-patch+json' }
                }
            );

            // Broadcast assignment to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId,
                updateType: 'assign',
                changes: [{ field: '/fields/System.AssignedTo', newValue: selected.uniqueName }]
            });

            // Send update to webview to update assignee avatar
            this._panel.webview.postMessage({
                command: 'updateAssignee',
                workItemId,
                assignee: selected.uniqueName ? {
                    uniqueName: selected.uniqueName,
                    displayName: selected.label
                } : null
            });

            vscode.window.showInformationMessage(`Updated assignee for #${workItemId}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to update assignee: ${error?.message || error}`);
        }
    }

    private async _confirmDeleteWorkItem(workItemId: number): Promise<void> {
        const answer = await vscode.window.showWarningMessage(
            `Are you sure you want to delete work item #${workItemId}?`,
            { modal: true },
            'Delete',
            'Cancel'
        );

        if (answer === 'Delete') {
            await this._deleteWorkItem(workItemId);
        }
    }

    private async _deleteWorkItem(workItemId: number): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            await axiosInstance.delete(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${workItemId}`,
                {
                    params: { 'api-version': '7.1' }
                }
            );

            // Broadcast deletion to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId,
                updateType: 'delete'
            });

            await this._loadAndRender();
            vscode.window.showInformationMessage(`Deleted work item #${workItemId}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to delete work item: ${error?.message || error}`);
        }
    }

    private async _addChildWorkItem(parentWorkItemId: number, workItemType: string): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            // Ask for the title
            const title = await vscode.window.showInputBox({
                prompt: `Enter title for new ${workItemType}`,
                placeHolder: 'Work item title'
            });

            if (!title) {
                return; // User cancelled
            }

            // Create the work item
            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitems/$${encodeURIComponent(workItemType)}`,
                [
                    { op: 'add', path: '/fields/System.Title', value: title },
                    { op: 'add', path: '/fields/System.State', value: 'To Do' }
                ],
                {
                    headers: { 'Content-Type': 'application/json-patch+json' },
                    params: { 'api-version': '7.1' }
                }
            );

            const newWorkItemId = response.data.id;

            // Add parent-child relationship
            await axiosInstance.patch(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitems/${newWorkItemId}`,
                [
                    {
                        op: 'add',
                        path: '/relations/-',
                        value: {
                            rel: 'System.LinkTypes.Hierarchy-Reverse',
                            url: `${axiosInstance.defaults.baseURL}/_apis/wit/workitems/${parentWorkItemId}`,
                            attributes: {
                                comment: 'Child work item'
                            }
                        }
                    }
                ],
                {
                    headers: { 'Content-Type': 'application/json-patch+json' },
                    params: { 'api-version': '7.1' }
                }
            );

            vscode.window.showInformationMessage(`Created ${workItemType} #${newWorkItemId} as child of #${parentWorkItemId}`);

            // Refresh the board
            await this._loadAndRender();

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create child work item: ${error?.message || error}`);
        }
    }

    private async _showMoveToColumnPicker(workItemId: number): Promise<void> {
        if (!this.currentBoard) return;

        // Get available columns and their states
        const columnItems = this.currentBoard.columns.map(col => {
            const states = Object.values(col.stateMappings);
            return {
                label: col.name,
                description: states.join(', '),
                column: col
            };
        });

        const selected = await vscode.window.showQuickPick(columnItems, {
            placeHolder: 'Select target column'
        });

        if (!selected) return;

        // Get the first state in the column's state mappings
        const targetState = Object.values(selected.column.stateMappings)[0];
        if (targetState) {
            await this._moveWorkItem(workItemId, selected.column.name, targetState);
        }
    }

    private async _showMoveToIterationPicker(workItemId: number): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) {
                throw new Error('Not connected or team not configured');
            }

            // Get iterations for the team
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations`,
                { params: { 'api-version': '7.1-preview.1' } }
            );

            const iterations = response.data.value || [];
            if (iterations.length === 0) {
                vscode.window.showInformationMessage('No iterations found');
                return;
            }

            interface IterationItem extends vscode.QuickPickItem {
                iterationPath: string;
            }

            const items: IterationItem[] = iterations.map((iteration: any) => ({
                label: iteration.name,
                description: iteration.path,
                iterationPath: iteration.path
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select target iteration'
            });

            if (!selected) return;

            // Update the work item's iteration path
            await axiosInstance.patch(
                `/_apis/wit/workitems/${workItemId}`,
                [{ op: 'replace', path: '/fields/System.IterationPath', value: selected.iterationPath }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            // Broadcast update to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId,
                updateType: 'update',
                changes: [{ field: '/fields/System.IterationPath', newValue: selected.iterationPath }]
            });

            vscode.window.showInformationMessage(`Moved #${workItemId} to ${selected.label}`);
            await this._loadAndRender();

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to move to iteration: ${error?.message || error}`);
        }
    }

    private async _getTeamMembers(): Promise<Array<{displayName: string, uniqueName: string}>> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                console.log('Cannot get team members: missing config');
                return [];
            }

            const members: Array<{displayName: string, uniqueName: string}> = [];

            // Try to get team members if team is configured
            if (config.defaultTeam) {
                try {
                    const teamResponse = await axiosInstance.get(
                        `/_apis/projects/${encodeURIComponent(config.defaultProject)}/teams/${encodeURIComponent(config.defaultTeam)}/members`,
                        { params: { 'api-version': '7.0' } }
                    );

                    const teamMembers = (teamResponse.data.value || []).map((member: any) => ({
                        displayName: member.identity?.displayName || '',
                        uniqueName: member.identity?.uniqueName || ''
                    })).filter((m: any) => m.displayName && m.uniqueName);

                    members.push(...teamMembers);
                    console.log(`Loaded ${teamMembers.length} team members`);
                } catch (teamError) {
                    console.error('Failed to load team members:', teamError);
                }
            }

            // Also get all project users as a fallback/supplement
            try {
                const identitiesResponse = await axiosInstance.get(
                    `/_apis/projects/${encodeURIComponent(config.defaultProject)}/teams`,
                    { params: { 'api-version': '7.0' } }
                );

                // Get members from all teams in the project
                const teams = identitiesResponse.data.value || [];
                // Increase limit to scan more teams (was 5)
                for (const team of teams.slice(0, 20)) { 
                    try {
                        const teamMembersResponse = await axiosInstance.get(
                            `/_apis/projects/${encodeURIComponent(config.defaultProject)}/teams/${encodeURIComponent(team.id)}/members`,
                            { params: { 'api-version': '7.0' } }
                        );

                        const additionalMembers = (teamMembersResponse.data.value || []).map((member: any) => ({
                            displayName: member.identity?.displayName || '',
                            uniqueName: member.identity?.uniqueName || ''
                        })).filter((m: any) => m.displayName && m.uniqueName);

                        // Add unique members
                        additionalMembers.forEach((newMember: {displayName: string, uniqueName: string}) => {
                            if (!members.find(m => m.uniqueName === newMember.uniqueName)) {
                                members.push(newMember);
                            }
                        });
                    } catch (e) {
                        // Skip this team if error
                    }
                }
            } catch (projectError) {
                console.error('Failed to load project users:', projectError);
            }

            console.log(`Total unique members: ${members.length}`);
            return members.sort((a, b) => a.displayName.localeCompare(b.displayName));
        } catch (error) {
            console.error('Failed to get team members:', error);
            return [];
        }
    }

    private async _switchBoard(boardId: string, boardName: string): Promise<void> {
        this.boardId = boardId;
        this.boardName = boardName;
        this._panel.title = `Board: ${boardName}`;
        await this._loadAndRender();
    }

    private async _getAvailableBoards(): Promise<Array<{id: string, name: string}>> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) {
                return [];
            }

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards`
            );

            return (response.data.value || []).map((b: any) => ({
                id: b.id,
                name: b.name
            }));
        } catch (error) {
            return [];
        }
    }

    private async _getTagColors(): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) {
                return;
            }

            // Clear existing colors and rules
            this._tagColors.clear();
            this._cardStyleRules = [];

            // Fetch tag colors and card styling rules from card rule settings API
            try {
                const ruleResponse = await axiosInstance.get(
                    `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards/${encodeURIComponent(this.boardId)}/cardrulesettings`,
                    {
                        params: {
                            'api-version': '7.1'
                        }
                    }
                );

                // Check for tag colors and card styling rules
                if (ruleResponse.data && ruleResponse.data.rules) {
                    const rules = ruleResponse.data.rules;

                    // Look for tagStyle in rules - it's an array of tag style objects
                    if (rules.tagStyle && Array.isArray(rules.tagStyle)) {
                        rules.tagStyle.forEach((tagStyle: any) => {
                            // Each tagStyle has: name, isEnabled, settings { "background-color": "#HEX" }
                            if (tagStyle.name && tagStyle.settings && tagStyle.settings['background-color']) {
                                const tagName = tagStyle.name;
                                const tagColor = tagStyle.settings['background-color'];
                                this._tagColors.set(tagName.toLowerCase(), tagColor);
                            }
                        });
                    }

                    // Look for fill (card background) styling rules
                    if (rules.fill && Array.isArray(rules.fill)) {
                        rules.fill.forEach((fillRule: any) => {
                            // Each fillRule has: name, isEnabled, filter, settings { "background-color": "#HEX" }
                            if (fillRule.isEnabled && fillRule.filter && fillRule.settings && fillRule.settings['background-color']) {
                                this._cardStyleRules.push({
                                    name: fillRule.name,
                                    filter: fillRule.filter,
                                    settings: fillRule.settings
                                });
                            }
                        });
                    }
                }
            } catch (error) {
                // Silently fail if card rule settings are not available
                console.error('Failed to fetch card rule settings:', error);
            }
        } catch (error) {
            console.error('Failed to fetch tag colors:', error);
        }
    }

    private _hasIconForWorkItemType(type: string): boolean {
        // List of work item types we have icons for
        const supportedTypes = [
            'User Story',
            'Product Backlog Item',
            'Requirement',
            'Feature',
            'Epic',
            'Task',
            'Issue',
            'Bug',
            'Test Case'
        ];
        return supportedTypes.includes(type);
    }

    private async _fetchProjectWorkItemTypes(): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                return;
            }

            // Fetch all work item types from the project
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitemtypes`,
                {
                    params: {
                        'api-version': '7.1'
                    }
                }
            );

            if (response.data && response.data.value) {
                // Extract work item type names, filter to only supported types with icons, and sort
                this._projectWorkItemTypes = response.data.value
                    .map((wit: any) => wit.name)
                    .filter((name: string) => name && this._hasIconForWorkItemType(name))
                    .sort();
            }

            // If no supported types found, use fallback
            if (this._projectWorkItemTypes.length === 0) {
                this._projectWorkItemTypes = ['User Story', 'Bug', 'Task', 'Issue', 'Feature', 'Epic'];
            }
        } catch (error) {
            console.error('Failed to fetch project work item types:', error);
            // Fallback to common types if API fails
            this._projectWorkItemTypes = ['User Story', 'Bug', 'Task', 'Issue', 'Feature', 'Epic'];
        }
    }

    private _getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading Board...</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .loader {
            text-align: center;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--vscode-input-border);
            border-top-color: var(--vscode-focusBorder);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <p>Loading board...</p>
    </div>
</body>
</html>`;
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .error {
            text-align: center;
            padding: 20px;
        }
        .error-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        button {
            margin-top: 16px;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="error">
        <div class="error-icon">⚠️</div>
        <p>${this._escapeHtml(message)}</p>
        <button onclick="location.reload()">Retry</button>
    </div>
</body>
</html>`;
    }

    private _getHtmlForWebview(): string {
        if (!this.currentBoard) {
            return this._getErrorHtml('No board data available');
        }

        const columns = this.currentBoard.columns;
        const workItems = this.currentBoard.workItems;
        const boardsJson = JSON.stringify(this.availableBoards);

        // Extract unique types from work items on the board
        const uniqueTypes = new Set<string>();
        workItems.forEach((items) => {
            items.forEach(item => {
                if (item.type) {
                    uniqueTypes.add(item.type);
                }
            });
        });
        const boardTypes = Array.from(uniqueTypes).sort();

        // Extract unique priorities from work items on the board
        const uniquePriorities = new Set<number>();
        workItems.forEach((items) => {
            items.forEach(item => {
                if (item.priority !== undefined && item.priority !== null) {
                    uniquePriorities.add(item.priority);
                }
            });
        });
        const boardPriorities = Array.from(uniquePriorities).sort((a, b) => a - b);

        // Priority labels mapping
        const priorityLabels: Record<number, string> = {
            1: '1 - Critical',
            2: '2 - High',
            3: '3 - Medium',
            4: '4 - Low'
        };

        // Extract unique states from work items on the board
        const uniqueStates = new Set<string>();
        workItems.forEach((items) => {
            items.forEach(item => {
                if (item.state) {
                    uniqueStates.add(item.state);
                }
            });
        });
        const boardStates = Array.from(uniqueStates).sort();

        // Extract unique areas from work items on the board
        const uniqueAreas = new Set<string>();
        workItems.forEach((items) => {
            items.forEach(item => {
                if (item.areaPath) {
                    uniqueAreas.add(item.areaPath);
                }
            });
        });
        const boardAreas = Array.from(uniqueAreas).sort();

        // Derive default work item type from board name
        const defaultWorkItemType = this._getDefaultWorkItemType();

        // Use project work item types fetched from Azure DevOps API
        // Combine with board types to ensure all types on current board are included
        const allWorkItemTypes = Array.from(new Set([...boardTypes, ...this._projectWorkItemTypes])).sort();

        // Get the codicon font URI from VSCode
        const codiconFontUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Board: ${this._escapeHtml(this.boardName)}</title>
    <style>
        @font-face {
            font-family: 'codicon';
            font-display: block;
            src: url('${codiconFontUri}') format('truetype');
        }
    </style>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            overflow-x: auto;
            min-height: 100vh;
        }

        /* Codicon Icons */
        .codicon {
            font-family: 'codicon';
            font-size: 16px;
            display: inline-block;
            line-height: 1;
            text-align: center;
            vertical-align: middle;
        }

        /* Board Header */
        .board-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .board-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .board-selector {
            position: relative;
        }

        .board-selector-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            color: var(--vscode-dropdown-foreground);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }

        .board-selector-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .board-selector-btn::after {
            content: '▼';
            font-size: 10px;
            opacity: 0.7;
        }

        .board-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            min-width: 200px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 200;
            margin-top: 4px;
        }

        .board-dropdown.show {
            display: block;
        }

        .board-dropdown-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.1s;
        }

        .board-dropdown-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .board-dropdown-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .board-icon {
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }

        .board-icon svg {
            display: block;
        }

        .board-name {
            flex: 1;
        }

        .board-actions {
            display: flex;
            gap: 8px;
        }

        .btn {
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.15s ease;
        }

        .btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .btn:active {
            transform: scale(0.95);
        }

        .btn.icon-btn {
            padding: 6px 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .btn.icon-btn svg {
            width: 16px;
            height: 16px;
        }

        .btn.icon-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        /* Board Container */
        .board-container {
            display: flex;
            gap: 0;
            min-height: calc(100vh - 120px);
            overflow-x: auto;
        }

        /* Columns */
        .column {
            flex: 0 0 320px;
            min-width: 320px;
            background: var(--vscode-editor-background);
            border-right: 3px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
        }

        .column.collapsed {
            flex: 0 0 48px;
            min-width: 48px;
        }

        .column.collapsed .column-body,
        .column.collapsed .add-item-header-btn,
        .column.collapsed .add-item-form-container {
            display: none;
        }

        .column.collapsed .column-header {
            writing-mode: vertical-rl;
            text-orientation: mixed;
            padding: 12px 8px;
            height: 100%;
        }

        .column.collapsed .column-title {
            transform: rotate(180deg);
        }

        .column.drag-over {
            /* No visual change */
        }

        .column.keyboard-focus {
            /* Removed box-shadow */
        }

        .column-header {
            padding: 12px 14px;
            border-bottom: 3px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
            cursor: pointer;
        }

        .column-header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .collapse-btn {
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 12px;
            transition: all 0.1s;
        }

        .collapse-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
            color: var(--vscode-foreground);
        }

        .column-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .column-header-right {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .add-item-header-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: transparent;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .add-item-header-btn:hover {
            background: var(--vscode-list-hoverBackground);
            color: var(--vscode-foreground);
            border-color: var(--vscode-focusBorder);
        }

        .add-item-header-btn:active {
            transform: scale(0.95);
        }

        .add-item-header-btn svg {
            width: 14px;
            height: 14px;
        }

        .add-item-form-container {
            padding: 0 12px;
            border-bottom: 1px solid transparent;
            background: var(--vscode-editor-background);
            height: 0;
            opacity: 0;
            transform: translateY(-10px);
            transition: height 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                        transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                        padding 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                        border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            z-index: 100;
        }

        .add-item-form-container.active {
            height: 44px;
            padding: 8px 12px;
            opacity: 1;
            transform: translateY(0);
            border-bottom-color: var(--vscode-panel-border);
        }

        .add-item-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .add-item-type-selector {
            flex-shrink: 0;
        }

        .add-item-type-select {
            padding: 6px 28px 6px 8px;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            min-width: 120px;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M2 4l4 4 4-4z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 8px center;
        }

        .add-item-type-select:hover {
            border-color: var(--vscode-focusBorder);
        }

        .add-item-type-select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .add-item-form-container .add-item-input {
            flex: 1;
            min-width: 0;
            margin-bottom: 0;
        }

        .add-item-submit {
            flex-shrink: 0;
            white-space: nowrap;
        }

        /* Custom Type Dropdown - Icon Only */
        .add-item-type-dropdown {
            position: relative;
            flex-shrink: 0;
        }

        .add-item-type-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 8px;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .add-item-type-btn:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }

        .add-item-type-btn .type-icon {
            font-size: 16px;
            line-height: 1;
        }

        .add-item-type-btn .dropdown-arrow {
            opacity: 0.7;
            transition: transform 0.2s ease;
        }

        .add-item-type-dropdown.open .add-item-type-btn .dropdown-arrow {
            transform: rotate(180deg);
        }

        .add-item-type-menu {
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            z-index: 10000;
            display: flex;
            flex-direction: row;
            gap: 2px;
            padding: 6px;
            opacity: 0;
            transform: translateY(-8px) scale(0.95);
            pointer-events: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .add-item-type-dropdown.open .add-item-type-menu {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }

        .type-menu-item {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .type-menu-item:hover {
            background: var(--vscode-list-hoverBackground);
            transform: scale(1.1);
        }

        .type-menu-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
        }

        .type-menu-item .type-icon {
            font-size: 18px;
            line-height: 1;
        }

        .wip-badge {
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .wip-badge.warning {
            background: #f59e0b;
            color: #000;
        }

        .wip-badge.danger {
            background: #ef4444;
            color: #fff;
        }

        .column-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .column-body.scrollbar-thin {
            scrollbar-width: thin;
            scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
        }

        /* Drop Placeholder */
        .drop-placeholder {
            display: none;
        }

        /* Work Item Cards - MODERN DESIGN */
        .card {
            background: var(--vscode-editor-background);
            border: 2px solid rgba(128, 128, 128, 0.45);
            border-left: 6px solid var(--card-type-color, #4396C2);
            border-radius: 6px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
            color: #ffffff;
        }

        .card.has-children {
            padding-bottom: 36px;
        }

        .card:hover {
            background: var(--vscode-list-hoverBackground);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .card.dragging {
            opacity: 0.5;
        }

        .card.keyboard-moving {
            outline: 2px solid var(--card-type-color, #4396C2);
            box-shadow: 0 0 0 4px rgba(67, 150, 194, 0.2);
        }

        /* Work Item Type Colors - Azure DevOps Standard */
        .card[data-type="User Story"] { --card-type-color: #4396C2; }
        .card[data-type="Product Backlog Item"] { --card-type-color: #4396C2; }
        .card[data-type="Requirement"] { --card-type-color: #4396C2; }
        .card[data-type="Feature"] { --card-type-color: #773b93; }
        .card[data-type="Epic"] { --card-type-color: #ff7b00; }
        .card[data-type="Bug"] { --card-type-color: #cc293d; }
        .card[data-type="Task"] { --card-type-color: #f2cb1d; }
        .card[data-type="Issue"] { --card-type-color: #207752; }
        .card[data-type="Impediment"] { --card-type-color: #b4009e; }
        .card[data-type="Risk"] { --card-type-color: #ff9d00; }
        .card[data-type="Change Request"] { --card-type-color: #b4009e; }
        .card[data-type="Review"] { --card-type-color: #773b93; }
        .card[data-type="Test Case"] { --card-type-color: #004b50; }
        .card[data-type="Test Plan"] { --card-type-color: #004b50; }
        .card[data-type="Test Suite"] { --card-type-color: #004b50; }

        /* Card Type Icon */
        .card-type-icon {
            width: 18px;
            height: 18px;
            font-size: 16px;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .card-header {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 8px;
            position: relative;
        }

        .card-header-content {
            flex: 1;
            min-width: 0;
        }

        .card-menu-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 16px;
            line-height: 1;
            opacity: 0;
            transition: all 0.2s;
        }

        .card:hover .card-menu-btn {
            opacity: 0.6;
        }

        .card-menu-btn:hover {
            opacity: 1 !important;
            background: var(--vscode-toolbar-hoverBackground);
        }

        .card-id-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }

        .card-id {
            font-size: 13px;
            font-weight: 600;
            color: #ffffff;
            cursor: pointer;
        }

        .card-id:hover {
            text-decoration: underline;
        }

        .card-title {
            font-size: 13px;
            color: #ffffff;
            line-height: 1.4;
            word-wrap: break-word;
        }

        .card-title-editable {
            width: 100%;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 13px;
            color: var(--vscode-input-foreground);
            font-family: inherit;
        }

        .card-title-editable:focus {
            outline: none;
        }

        /* Status Indicator */
        .card-status {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        .status-dot.todo {
            background: #71717a;
        }

        .status-dot.doing {
            background: #3b82f6;
        }

        .status-dot.done {
            background: #22c55e;
        }

        .status-label {
            font-size: 12px;
            color: #ffffff;
        }

        /* Assignee */
        .card-assignee {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            cursor: pointer;
            padding: 4px;
            margin: 0 -4px 8px -4px;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .card-assignee:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .card-avatar {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 500;
            /* Colors set dynamically via JavaScript based on user */
        }

        .card-avatar.unassigned {
            background: rgba(139, 139, 139, 0.3);
            color: #8b8b8b;
        }

        .card-assignee-name {
            font-size: 12px;
            color: #ffffff;
        }

        .card-assignee-name.unassigned-text {
            color: #ffffff;
            opacity: 0.6;
            font-style: italic;
        }

        /* Tags */
        .card-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .tag {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            border: 1px solid;
            white-space: nowrap;
        }

        /* Card Footer */
        .card-footer {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        /* Child work items indicator */
        .child-indicators-container {
            position: absolute;
            bottom: 8px;
            left: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .child-indicator-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: #ffffff;
            font-weight: 500;
        }

        .child-indicator-item svg {
            flex-shrink: 0;
        }

        .child-indicator-item.completed {
            text-decoration: line-through;
        }

        .child-count {
            line-height: 1;
        }

        .card-effort-toggle {
            background: transparent;
            border: 1px solid var(--vscode-input-border);
            color: #ffffff;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.2s;
            width: 100%;
            justify-content: center;
        }

        .card-effort-toggle:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .effort-icon {
            font-size: 10px;
            opacity: 0.7;
        }

        .effort-value {
            font-weight: 500;
        }

        /* Card Menu Dropdown */
        .card-menu {
            position: fixed;
            min-width: 180px;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            padding: 4px 0;
            opacity: 0;
            transform: translateY(-10px);
            pointer-events: none;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .card-menu.show {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }

        .card-menu-item {
            padding: 8px 16px;
            cursor: pointer;
            font-size: 13px;
            color: var(--vscode-menu-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }

        .card-menu-item .menu-icon {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            filter: brightness(0) saturate(100%) invert(var(--vscode-icon-foreground-opacity, 0.8));
        }

        .card-menu-item .menu-icon.test-icon {
            width: 23px;
            height: 23px;
        }

        .card-menu-item:hover .menu-icon {
            filter: brightness(0) saturate(100%) invert(1);
        }

        .card-menu-item:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        .card-menu-item.danger:hover {
            background: rgba(209, 52, 56, 0.2);
            color: #d13438;
        }

        .card-menu-separator {
            height: 1px;
            background: var(--vscode-menu-separatorBackground);
            margin: 4px 0;
        }

        /* Context Menu */
        .context-menu {
            display: none;
            position: fixed;
            min-width: 180px;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            padding: 4px 0;
        }

        .context-menu.show {
            display: block;
        }

        .context-menu-item {
            padding: 8px 16px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--vscode-menu-foreground);
            transition: background 0.1s;
        }

        .context-menu-item:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        .context-menu-item .icon {
            width: 16px;
            text-align: center;
        }

        .context-menu-separator {
            height: 1px;
            background: var(--vscode-menu-separatorBackground);
            margin: 4px 0;
        }

        .context-menu-submenu {
            position: relative;
        }

        .context-menu-submenu::after {
            content: '▶';
            font-size: 10px;
            margin-left: auto;
        }

        .submenu {
            display: none;
            position: absolute;
            left: 100%;
            top: 0;
            min-width: 150px;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            padding: 4px 0;
        }

        .context-menu-submenu:hover .submenu {
            display: block;
        }

        /* Add New Item Input */
        .add-item-input {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 13px;
            margin-bottom: 8px;
        }

        .add-item-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .add-item-actions {
            display: flex;
            gap: 8px;
        }

        /* Toast */
        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: var(--vscode-notifications-background);
            border: 1px solid var(--vscode-notifications-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            display: none;
            animation: slideIn 0.2s ease;
        }

        .toast.show {
            display: block;
        }

        .toast.success {
            border-left: 4px solid #10b981;
        }

        .toast.error {
            border-left: 4px solid #ef4444;
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        /* Keyboard Help */
        .keyboard-help {
            position: fixed;
            bottom: 20px;
            left: 20px;
            padding: 8px 12px;
            background: var(--vscode-notifications-background);
            border: 1px solid var(--vscode-notifications-border);
            border-radius: 6px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: none;
        }

        .keyboard-help.show {
            display: block;
        }

        .keyboard-help kbd {
            background: var(--vscode-button-secondaryBackground);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
            margin: 0 2px;
        }

        /* Empty Column */
        .empty-column {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        /* Filter Bar */
        .filter-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 20px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }

        .filter-bar.collapsed {
            display: none;
        }

        .filter-search {
            flex: 1;
            min-width: 200px;
            max-width: 300px;
            position: relative;
        }

        .filter-search-input {
            width: 100%;
            padding: 6px 32px 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 12px;
        }

        .filter-search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .filter-search-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .filter-search-clear {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 14px;
            display: none;
        }

        .filter-search-input:not(:placeholder-shown) + .filter-search-clear {
            display: block;
        }

        .filter-clear-btn {
            width: 100%;
            padding: 6px 12px;
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            cursor: pointer;
            text-align: right;
            transition: all 0.15s;
        }

        .filter-clear-btn:not(:disabled) {
            color: var(--vscode-foreground);
        }

        .filter-clear-btn:not(:disabled):hover {
            background: var(--vscode-list-hoverBackground);
        }

        .filter-clear-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .filter-select {
            padding: 5px 24px 5px 8px;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 6px center;
        }

        .filter-select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .filter-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 10px;
            background: transparent;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-foreground);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }

        .filter-toggle:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .filter-toggle.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }

        .filter-toggle-icon {
            font-size: 14px;
        }

        .filter-divider {
            width: 1px;
            height: 24px;
            background: var(--vscode-panel-border);
        }

        .filter-clear-all {
            padding: 5px 10px;
            background: transparent;
            border: none;
            color: var(--vscode-textLink-foreground);
            font-size: 12px;
            cursor: pointer;
            text-decoration: underline;
        }

        .filter-clear-all:hover {
            color: var(--vscode-textLink-activeForeground);
        }

        .filter-count {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-left: auto;
        }

        .filter-count strong {
            color: var(--vscode-foreground);
        }

        /* Hidden card when filtered */
        .card.filtered-out {
            display: none;
        }

        /* Column hidden indicator when all items filtered */
        .column-filtered-info {
            text-align: center;
            padding: 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            font-style: italic;
        }

        /* Filter Dropdown Styles */
        .filter-dropdown {
            position: relative;
        }

        .filter-dropdown-btn {
            padding: 5px 16px 5px 8px;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            min-width: 100px;
            text-align: left;
            position: relative;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: all 0.15s ease;
        }

        .filter-dropdown-btn:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .filter-dropdown-btn:active {
            transform: scale(0.97);
        }

        .filter-dropdown-btn::after {
            content: '\u276F';
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%) rotate(90deg);
            font-size: 10px;
            opacity: 0.7;
        }

        .filter-dropdown-content {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            min-width: 200px;
            max-height: 300px;
            overflow-y: auto;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            z-index: 1000;
            margin-top: 4px;
            padding: 4px 0;
        }

        .filter-dropdown-content.show {
            display: block;
        }

        .filter-checkbox-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
            color: var(--vscode-dropdown-foreground);
            user-select: none;
        }
        
        .filter-checkbox-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .filter-checkbox-item input[type="checkbox"] {
            margin: 0;
            cursor: pointer;
            width: 14px;
            height: 14px;
            /* Ensure it uses VS Code colors */
            accent-color: var(--vscode-button-background);
            border: 1px solid var(--vscode-checkbox-border);
            background: var(--vscode-checkbox-background);
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: transparent;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="board-header">
        <div class="board-title">
            <div class="board-selector">
                <button class="board-selector-btn" onclick="toggleBoardDropdown()">
                    <span class="board-icon">${this._getBoardIcon(this.boardName)}</span>
                    <span class="board-name">${this._escapeHtml(this.boardName)}</span>
                </button>
                <div class="board-dropdown" id="boardDropdown">
                    ${this.availableBoards.map(board => `
                        <div class="board-dropdown-item ${board.id === this.boardId ? 'active' : ''}"
                             onclick="switchBoard('${board.id}', '${this._escapeHtml(board.name)}')">
                            <span class="board-icon">${this._getBoardIcon(board.name)}</span>
                            <span class="board-name">${this._escapeHtml(board.name)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        <div class="board-actions">
            <button class="btn icon-btn" onclick="toggleFilterBar()" title="Toggle filters (F)" id="filterToggleBtn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg>
            </button>
            <button class="btn icon-btn" onclick="refresh()" title="Refresh (R)">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>
            </button>
            <button class="btn icon-btn" onclick="openInBrowser()" title="Open in browser">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
            </button>
            <button class="btn icon-btn" onclick="toggleKeyboardHelp()" title="Keyboard shortcuts (?)">?</button>
        </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar" id="filterBar">
        <div class="filter-search">
            <input type="text"
                   class="filter-search-input"
                   id="searchInput"
                   placeholder="Search by ID or title..."
                   oninput="applyFilters()"
                   onkeydown="if(event.key==='Escape'){this.value='';applyFilters();}">
            <button class="filter-search-clear" onclick="clearSearch()">×</button>
        </div>

        <div class="filter-divider"></div>

        <div class="filter-dropdown" id="assigneeDropdown">
            <button class="filter-dropdown-btn" id="assigneeDropdownBtn" onclick="toggleDropdown('assigneeDropdownContent')">Assigned to</button>
            <div class="filter-dropdown-content" id="assigneeDropdownContent">
                <label class="filter-checkbox-item"><input type="checkbox" name="assignee" value="me" onchange="handleFilterChange('assignee', this)"> @Me</label>
                <label class="filter-checkbox-item"><input type="checkbox" name="assignee" value="unassigned" onchange="handleFilterChange('assignee', this)"> Unassigned</label>
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                ${this._teamMembers.map(m => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="assignee" value="${this._escapeHtml(m.uniqueName)}" onchange="handleFilterChange('assignee', this)">
                        ${this._escapeHtml(m.displayName)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="assigneeClearBtn" onclick="clearFilter('assignee')" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="typeDropdown">
            <button class="filter-dropdown-btn" id="typeDropdownBtn" onclick="toggleDropdown('typeDropdownContent')">Type</button>
            <div class="filter-dropdown-content" id="typeDropdownContent">
                ${boardTypes.map(type => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="type" value="${this._escapeHtml(type)}" onchange="handleFilterChange('type', this)">
                        ${this._escapeHtml(type)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="typeClearBtn" onclick="clearFilter('type')" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="priorityDropdown">
            <button class="filter-dropdown-btn" id="priorityDropdownBtn" onclick="toggleDropdown('priorityDropdownContent')">Priority</button>
            <div class="filter-dropdown-content" id="priorityDropdownContent">
                ${boardPriorities.map(priority => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="priority" value="${priority}" onchange="handleFilterChange('priority', this)">
                        ${priorityLabels[priority] || priority}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="priorityClearBtn" onclick="clearFilter('priority')" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="stateDropdown">
            <button class="filter-dropdown-btn" id="stateDropdownBtn" onclick="toggleDropdown('stateDropdownContent')">States</button>
            <div class="filter-dropdown-content" id="stateDropdownContent">
                ${boardStates.map(state => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="state" value="${this._escapeHtml(state)}" onchange="handleFilterChange('state', this)">
                        ${this._escapeHtml(state)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="stateClearBtn" onclick="clearFilter('state')" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="areaDropdown">
            <button class="filter-dropdown-btn" id="areaDropdownBtn" onclick="toggleDropdown('areaDropdownContent')">Area</button>
            <div class="filter-dropdown-content" id="areaDropdownContent">
                ${boardAreas.map(area => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="area" value="${this._escapeHtml(area)}" onchange="handleFilterChange('area', this)">
                        ${this._escapeHtml(area)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="areaClearBtn" onclick="clearFilter('area')" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-divider"></div>

        <button class="filter-toggle" id="hideDoneToggle" onclick="toggleHideDone()">
            <span class="filter-toggle-icon">✓</span>
            Hide Done
        </button>

        <button class="filter-toggle" id="myItemsToggle" onclick="toggleMyItems()">
            <span class="filter-toggle-icon">👤</span>
            My Items
        </button>

        <button class="filter-clear-all" onclick="clearAllFilters()" id="clearFiltersBtn" style="display:none;">
            Clear all filters
        </button>

        <div class="filter-count" id="filterCount">
            Showing <strong id="visibleCount">0</strong> of <strong id="totalCount">0</strong> items
        </div>
    </div>

    <div class="board-container" id="boardContainer">
        ${columns.map((column, colIndex) => {
            const items = workItems.get(column.name) || [];
            const itemCount = items.length;
            const wipClass = column.itemLimit > 0
                ? (itemCount >= column.itemLimit ? 'danger' : (itemCount >= column.itemLimit * 0.8 ? 'warning' : ''))
                : '';

            const stateMappings = column.stateMappings || {};
            const targetState = Object.values(stateMappings)[0] || column.name;

            return `
            <div class="column"
                 data-column="${this._escapeHtml(column.name)}"
                 data-state="${this._escapeHtml(String(targetState))}"
                 data-limit="${column.itemLimit}"
                 data-index="${colIndex}"
                 tabindex="0"
                 ondragover="handleDragOver(event)"
                 ondragleave="handleDragLeave(event)"
                 ondrop="handleDrop(event)">
                <div class="column-header" onclick="toggleColumn(this.parentElement)">
                    <div class="column-header-left">
                        <button class="collapse-btn" onclick="event.stopPropagation(); toggleColumn(this.closest('.column'))">◀</button>
                        <span class="column-title">${this._escapeHtml(column.name)}</span>
                    </div>
                    <div class="column-header-right">
                        ${colIndex === 0 ? `
                        <button class="add-item-header-btn" onclick="event.stopPropagation(); showAddForm('${this._escapeHtml(column.name)}')" title="New item">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                            New item
                        </button>
                        ` : ''}
                        <span class="wip-badge ${wipClass}">
                            ${itemCount}${column.itemLimit > 0 ? '/' + column.itemLimit : ''}
                        </span>
                    </div>
                </div>
                ${colIndex === 0 ? `
                <div class="add-item-form-container" id="add-form-${this._escapeHtml(column.name).replace(/\s/g, '-')}">
                    <div class="add-item-row">
                        <div class="add-item-type-dropdown" id="add-item-type-dropdown">
                            <button class="add-item-type-btn" id="add-item-type-btn" onclick="toggleTypeDropdown(event)" title="${this._escapeHtml(defaultWorkItemType)}">
                                <span class="type-icon">${this._getTypeIcon(defaultWorkItemType)}</span>
                                <svg class="dropdown-arrow" width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg>
                            </button>
                            <div class="add-item-type-menu" id="add-item-type-menu">
                                ${allWorkItemTypes.map(type => `
                                    <div class="type-menu-item ${type === defaultWorkItemType ? 'selected' : ''}" data-type="${this._escapeHtml(type)}" onclick="selectWorkItemType('${this._escapeHtml(type)}')" title="${this._escapeHtml(type)}">
                                        <span class="type-icon">${this._getTypeIcon(type)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <input type="hidden" id="add-item-type-value" value="${this._escapeHtml(defaultWorkItemType)}" />
                        <input type="text" class="add-item-input" id="add-item-title-input" placeholder="Enter title..."
                               onkeydown="handleAddKeydown(event, '${this._escapeHtml(column.name)}')" />
                        <button class="btn btn-primary add-item-submit" onclick="createItem('${this._escapeHtml(column.name)}')">Add to top</button>
                    </div>
                </div>
                ` : ''}
                <div class="column-body">
                    ${items.map((item, itemIndex) => this._renderCard(item, colIndex, itemIndex)).join('')}
                    ${items.length === 0 ? '<div class="empty-column">No items</div>' : ''}
                    <div class="drop-placeholder"></div>
                </div>
            </div>
            `;
        }).join('')}
    </div>

    <!-- Context Menu -->
    <div class="context-menu" id="contextMenu">
        <div class="context-menu-item" onclick="contextMenuAction('open')">
            <span class="icon">📄</span> Open Details
        </div>
        <div class="context-menu-item" onclick="contextMenuAction('openBrowser')">
            <span class="icon">🌐</span> Open in Browser
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" onclick="contextMenuAction('assignToMe')">
            <span class="icon">👤</span> Assign to Me
        </div>
        <div class="context-menu-item context-menu-submenu">
            <span class="icon">📊</span> Change State
            <div class="submenu" id="stateSubmenu">
                ${columns.map(col => {
                    const state = Object.values(col.stateMappings || {})[0] || col.name;
                    return `<div class="context-menu-item" onclick="contextMenuAction('changeState', '${this._escapeHtml(String(state))}')">${this._escapeHtml(String(state))}</div>`;
                }).join('')}
            </div>
        </div>
        <div class="context-menu-item" onclick="contextMenuAction('addComment')">
            <span class="icon">💬</span> Add Comment
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" onclick="contextMenuAction('createBranch')">
            <span class="icon">🔀</span> Create Branch
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" onclick="contextMenuAction('copyId')">
            <span class="icon">📋</span> Copy ID
        </div>
        <div class="context-menu-item" onclick="contextMenuAction('copyUrl')">
            <span class="icon">🔗</span> Copy URL
        </div>
    </div>

    <!-- Card Menu -->
    <div class="card-menu" id="cardMenu">
        <div class="card-menu-item" onclick="cardMenuAction('open')">
            <img src="https://img.icons8.com/pastel-glyph/128/external-link--v2.png" class="menu-icon" alt="open"> Open
        </div>
        <div class="card-menu-item" onclick="cardMenuAction('editTitle')">
            <img src="https://img.icons8.com/ios/50/edit--v1.png" class="menu-icon" alt="edit"> Edit title
        </div>
        <div class="card-menu-separator"></div>
        <div class="card-menu-item" onclick="cardMenuAction('moveToColumn')">
            <img src="https://img.icons8.com/ios/50/resize-horizontal.png" class="menu-icon" alt="move column"> Move to column
        </div>
        <div class="card-menu-item" onclick="cardMenuAction('moveToIteration')">
            <img src="https://img.icons8.com/ios/50/resize-horizontal.png" class="menu-icon" alt="move iteration"> Move to iteration
        </div>
        <div class="card-menu-separator"></div>
        <div class="card-menu-item" onclick="cardMenuAction('addTask')">
            <img src="https://img.icons8.com/ios/50/plus--v1.png" class="menu-icon" alt="add task"> Add Task
        </div>
        <div class="card-menu-item" onclick="cardMenuAction('addTest')">
            <img src="https://img.icons8.com/carbon-copy/100/test-tube.png" class="menu-icon test-icon" alt="add test"> Add Test
        </div>
        <div class="card-menu-separator"></div>
        <div class="card-menu-item" onclick="cardMenuAction('createBranch')">
            <img src="https://img.icons8.com/ios/50/merge-git.png" class="menu-icon" alt="branch"> New branch...
        </div>
        <div class="card-menu-separator"></div>
        <div class="card-menu-item danger" onclick="cardMenuAction('delete')">
            <img src="https://img.icons8.com/ios/50/trash--v1.png" class="menu-icon" alt="delete"> Delete
        </div>
    </div>

    <!-- Keyboard Help -->
    <div class="keyboard-help" id="keyboardHelp">
        <strong>Keyboard Shortcuts:</strong><br>
        <kbd>↑</kbd><kbd>↓</kbd> Navigate cards &nbsp;
        <kbd>←</kbd><kbd>→</kbd> Navigate columns<br>
        <kbd>M</kbd> Move mode &nbsp;
        <kbd>Enter</kbd> Open details &nbsp;
        <kbd>R</kbd> Refresh<br>
        <kbd>F</kbd> Toggle filters &nbsp;
        <kbd>?</kbd> Toggle this help &nbsp;
        <kbd>Esc</kbd> Cancel
    </div>

    <div class="toast" id="toast"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const availableBoards = ${boardsJson};
        let draggedCard = null;
        let originalColumn = null;
        let selectedCard = null;
        let keyboardMoveMode = false;
        let contextMenuWorkItemId = null;

        // Avatar color utility - generates consistent colors based on display name
        function getAvatarColor(displayName) {
            if (!displayName || displayName === 'Unassigned') {
                return { bg: 'rgba(139, 139, 139, 0.3)', fg: '#8b8b8b' };
            }

            // Hash the display name to get a consistent number
            let hash = 0;
            for (let i = 0; i < displayName.length; i++) {
                hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
            }

            // Predefined pleasant color palette
            const colors = [
                { bg: 'rgba(34, 197, 94, 0.3)', fg: '#22c55e' },   // Green
                { bg: 'rgba(59, 130, 246, 0.3)', fg: '#3b82f6' },  // Blue
                { bg: 'rgba(168, 85, 247, 0.3)', fg: '#a855f7' },  // Purple
                { bg: 'rgba(236, 72, 153, 0.3)', fg: '#ec4899' },  // Pink
                { bg: 'rgba(251, 146, 60, 0.3)', fg: '#fb923c' },  // Orange
                { bg: 'rgba(14, 165, 233, 0.3)', fg: '#0ea5e9' },  // Cyan
                { bg: 'rgba(244, 63, 94, 0.3)', fg: '#f43f5e' },   // Red
                { bg: 'rgba(234, 179, 8, 0.3)', fg: '#eab308' },   // Yellow
                { bg: 'rgba(20, 184, 166, 0.3)', fg: '#14b8a6' },  // Teal
                { bg: 'rgba(139, 92, 246, 0.3)', fg: '#8b5cf6' },  // Violet
            ];

            const index = Math.abs(hash) % colors.length;
            return colors[index];
        }

        // Apply avatar colors after DOM is loaded
        function applyAvatarColors() {
            document.querySelectorAll('.card-avatar').forEach(avatar => {
                const card = avatar.closest('.card');
                if (card) {
                    const displayName = card.getAttribute('data-assignee-name');
                    if (!avatar.classList.contains('unassigned')) {
                        const color = getAvatarColor(displayName);
                        avatar.style.background = color.bg;
                        avatar.style.color = color.fg;
                    }
                }
            });
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            document.addEventListener('keydown', handleGlobalKeydown);
            document.addEventListener('click', hideContextMenu);
            applyAvatarColors();
        });

        // Keyboard Navigation
        function handleGlobalKeydown(event) {
            // Ignore if typing in input
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (event.key) {
                case '?':
                    toggleKeyboardHelp();
                    break;
                case 'r':
                case 'R':
                    if (!event.ctrlKey && !event.metaKey) {
                        refresh();
                    }
                    break;
                case 'Escape':
                    if (keyboardMoveMode) {
                        cancelKeyboardMove();
                    }
                    hideContextMenu();
                    break;
                case 'm':
                case 'M':
                    if (selectedCard && !keyboardMoveMode) {
                        startKeyboardMove();
                    }
                    break;
                case 'Enter':
                    if (keyboardMoveMode) {
                        confirmKeyboardMove();
                    } else if (selectedCard) {
                        openWorkItem(parseInt(selectedCard.dataset.id));
                    }
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    navigateCards(-1);
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    navigateCards(1);
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    if (keyboardMoveMode) {
                        moveCardToColumn(-1);
                    } else {
                        navigateColumns(-1);
                    }
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    if (keyboardMoveMode) {
                        moveCardToColumn(1);
                    } else {
                        navigateColumns(1);
                    }
                    break;
            }
        }

        function selectCard(card) {
            if (selectedCard) {
                selectedCard.classList.remove('selected');
            }
            selectedCard = card;
            if (card) {
                card.classList.add('selected');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        function navigateCards(direction) {
            const cards = Array.from(document.querySelectorAll('.card'));
            if (cards.length === 0) return;

            if (!selectedCard) {
                selectCard(cards[0]);
                return;
            }

            const currentIndex = cards.indexOf(selectedCard);
            const newIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
            selectCard(cards[newIndex]);
        }

        function navigateColumns(direction) {
            const columns = Array.from(document.querySelectorAll('.column:not(.collapsed)'));
            if (columns.length === 0) return;

            let currentColIndex = 0;
            if (selectedCard) {
                const currentColumn = selectedCard.closest('.column');
                currentColIndex = columns.indexOf(currentColumn);
            }

            const newColIndex = Math.max(0, Math.min(columns.length - 1, currentColIndex + direction));
            const targetColumn = columns[newColIndex];
            const cards = targetColumn.querySelectorAll('.card');

            if (cards.length > 0) {
                selectCard(cards[0]);
            } else {
                // Focus empty column
                columns.forEach(c => c.classList.remove('keyboard-focus'));
                targetColumn.classList.add('keyboard-focus');
            }
        }

        function startKeyboardMove() {
            if (!selectedCard) return;
            keyboardMoveMode = true;
            selectedCard.classList.add('keyboard-moving');
            showToast('Move mode: Use ← → to move, Enter to confirm, Esc to cancel', 'info');
        }

        function cancelKeyboardMove() {
            keyboardMoveMode = false;
            if (selectedCard) {
                selectedCard.classList.remove('keyboard-moving');
            }
            showToast('Move cancelled', 'info');
        }

        function moveCardToColumn(direction) {
            if (!selectedCard) return;

            const columns = Array.from(document.querySelectorAll('.column:not(.collapsed)'));
            const currentColumn = selectedCard.closest('.column');
            const currentColIndex = columns.indexOf(currentColumn);
            const newColIndex = Math.max(0, Math.min(columns.length - 1, currentColIndex + direction));

            if (newColIndex === currentColIndex) return;

            const targetColumn = columns[newColIndex];
            const limit = parseInt(targetColumn.dataset.limit) || 0;

            if (limit > 0) {
                const currentCount = targetColumn.querySelectorAll('.card').length;
                if (currentCount >= limit) {
                    showToast('WIP limit reached for ' + targetColumn.dataset.column, 'error');
                    return;
                }
            }

            // Move the card visually
            const columnBody = targetColumn.querySelector('.column-body');
            const placeholder = columnBody.querySelector('.drop-placeholder');
            columnBody.insertBefore(selectedCard, placeholder);

            // Remove empty state message if present
            const emptyMessage = columnBody.querySelector('.empty-column');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            updateColumnCounts();
        }

        function confirmKeyboardMove() {
            if (!selectedCard || !keyboardMoveMode) return;

            const column = selectedCard.closest('.column');
            const workItemId = parseInt(selectedCard.dataset.id);
            const targetColumn = column.dataset.column;
            const targetState = column.dataset.state;

            vscode.postMessage({
                command: 'moveWorkItem',
                workItemId: workItemId,
                targetColumn: targetColumn,
                targetState: targetState
            });

            keyboardMoveMode = false;
            selectedCard.classList.remove('keyboard-moving');
        }

        // Context Menu
        function showContextMenu(event, workItemId) {
            event.preventDefault();
            event.stopPropagation();

            contextMenuWorkItemId = workItemId;
            const menu = document.getElementById('contextMenu');

            menu.style.left = event.pageX + 'px';
            menu.style.top = event.pageY + 'px';
            menu.classList.add('show');

            // Adjust if menu goes off screen
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (event.pageX - rect.width) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (event.pageY - rect.height) + 'px';
            }
        }

        function hideContextMenu() {
            document.getElementById('contextMenu').classList.remove('show');
            contextMenuWorkItemId = null;
        }

        function contextMenuAction(action, value) {
            hideContextMenu();
            if (!contextMenuWorkItemId) return;

            switch (action) {
                case 'open':
                    vscode.postMessage({ command: 'openWorkItem', workItemId: contextMenuWorkItemId });
                    break;
                case 'openBrowser':
                    vscode.postMessage({ command: 'openWorkItemInBrowser', workItemId: contextMenuWorkItemId });
                    break;
                case 'assignToMe':
                    vscode.postMessage({ command: 'assignToMe', workItemId: contextMenuWorkItemId });
                    break;
                case 'changeState':
                    vscode.postMessage({ command: 'changeState', workItemId: contextMenuWorkItemId, state: value });
                    break;
                case 'addComment':
                    vscode.postMessage({ command: 'addComment', workItemId: contextMenuWorkItemId });
                    break;
                case 'createBranch':
                    vscode.postMessage({ command: 'createBranch', workItemId: contextMenuWorkItemId });
                    break;
                case 'copyId':
                    vscode.postMessage({ command: 'copyId', workItemId: contextMenuWorkItemId });
                    break;
                case 'copyUrl':
                    vscode.postMessage({ command: 'copyUrl', workItemId: contextMenuWorkItemId });
                    break;
            }
        }

        // Board Dropdown
        function toggleBoardDropdown() {
            document.getElementById('boardDropdown').classList.toggle('show');
        }

        function switchBoard(boardId, boardName) {
            document.getElementById('boardDropdown').classList.remove('show');
            vscode.postMessage({ command: 'switchBoard', boardId, boardName });
        }

        // Column Collapse
        function toggleColumn(column) {
            column.classList.toggle('collapsed');
            const btn = column.querySelector('.collapse-btn');
            btn.textContent = column.classList.contains('collapsed') ? '▶' : '◀';
        }

        // Keyboard Help
        function toggleKeyboardHelp() {
            document.getElementById('keyboardHelp').classList.toggle('show');
        }

        // Drag and Drop
        function handleDragStart(event, workItemId) {
            draggedCard = event.target;
            originalColumn = draggedCard.closest('.column').dataset.column;
            event.target.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', workItemId);
        }

        function handleDragEnd(event) {
            event.target.classList.remove('dragging');
            document.querySelectorAll('.column').forEach(col => {
                col.classList.remove('drag-over');
            });
            draggedCard = null;
            originalColumn = null;
        }

        function handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const column = event.target.closest('.column');
            if (column && !column.classList.contains('collapsed')) {
                column.classList.add('drag-over');
            }
        }

        function handleDragLeave(event) {
            const column = event.target.closest('.column');
            if (column && !column.contains(event.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        }

        function handleDrop(event) {
            event.preventDefault();
            const column = event.target.closest('.column');
            if (!column || !draggedCard || column.classList.contains('collapsed')) return;

            column.classList.remove('drag-over');

            const workItemId = parseInt(event.dataTransfer.getData('text/plain'));
            const targetColumn = column.dataset.column;
            const targetState = column.dataset.state;

            if (originalColumn === targetColumn) {
                return;
            }

            const limit = parseInt(column.dataset.limit) || 0;
            if (limit > 0) {
                const currentCount = column.querySelectorAll('.card').length;
                if (currentCount >= limit) {
                    showToast('WIP limit reached for ' + targetColumn, 'error');
                    return;
                }
            }

            const columnBody = column.querySelector('.column-body');
            const placeholder = columnBody.querySelector('.drop-placeholder');
            columnBody.insertBefore(draggedCard, placeholder);
            draggedCard.classList.remove('dragging');

            // Remove empty state message if present
            const emptyMessage = columnBody.querySelector('.empty-column');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            // IMMEDIATELY update the card's state indicator for instant visual feedback
            if (targetState && draggedCard) {
                // Update the data-state attribute
                draggedCard.dataset.state = targetState;

                // Update the status label text
                const statusLabel = draggedCard.querySelector('.status-label');
                if (statusLabel) {
                    statusLabel.textContent = targetState;
                }

                // Update the status dot class based on the new state
                const statusDot = draggedCard.querySelector('.status-dot');
                if (statusDot) {
                    const stateLower = targetState.toLowerCase();
                    let newStateClass = 'todo';
                    if (stateLower.includes('done') || stateLower.includes('closed')) {
                        newStateClass = 'done';
                    } else if (stateLower.includes('active') || stateLower.includes('doing') || stateLower.includes('progress')) {
                        newStateClass = 'doing';
                    }

                    // Remove all state classes and add the new one
                    statusDot.classList.remove('done', 'doing', 'todo');
                    statusDot.classList.add(newStateClass);
                }
            }

            updateColumnCounts();

            vscode.postMessage({
                command: 'moveWorkItem',
                workItemId: workItemId,
                targetColumn: targetColumn,
                targetState: targetState
            });
        }

        function updateColumnCounts() {
            document.querySelectorAll('.column').forEach(column => {
                const count = column.querySelectorAll('.card').length;
                const limit = parseInt(column.dataset.limit) || 0;
                const badge = column.querySelector('.wip-badge');

                badge.textContent = limit > 0 ? count + '/' + limit : count;
                badge.classList.remove('warning', 'danger');

                if (limit > 0) {
                    if (count >= limit) {
                        badge.classList.add('danger');
                    } else if (count >= limit * 0.8) {
                        badge.classList.add('warning');
                    }
                }
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'moveSuccess':
                    showToast(message.message, 'success');
                    break;
                case 'moveFailed':
                    showToast(message.message, 'error');
                    vscode.postMessage({ command: 'refresh' });
                    break;
            }
        });

        // Card actions
        function openWorkItem(workItemId) {
            vscode.postMessage({ command: 'openWorkItem', workItemId: workItemId });
        }

        function editCardTitle(titleElement, workItemId) {
            const currentTitle = titleElement.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'card-title-editable';
            input.value = currentTitle;

            titleElement.replaceWith(input);
            input.focus();
            input.select();

            function saveTitle() {
                const newTitle = input.value.trim();
                if (newTitle && newTitle !== currentTitle) {
                    vscode.postMessage({
                        command: 'updateWorkItemTitle',
                        workItemId: workItemId,
                        title: newTitle
                    });
                    const span = document.createElement('span');
                    span.className = 'card-title';
                    span.textContent = newTitle;
                    span.ondblclick = (e) => { e.stopPropagation(); editCardTitle(span, workItemId); };
                    input.replaceWith(span);
                } else {
                    const span = document.createElement('span');
                    span.className = 'card-title';
                    span.textContent = currentTitle;
                    span.ondblclick = (e) => { e.stopPropagation(); editCardTitle(span, workItemId); };
                    input.replaceWith(span);
                }
            }

            input.addEventListener('blur', saveTitle);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();
                } else if (e.key === 'Escape') {
                    const span = document.createElement('span');
                    span.className = 'card-title';
                    span.textContent = currentTitle;
                    span.ondblclick = (ev) => { ev.stopPropagation(); editCardTitle(span, workItemId); };
                    input.replaceWith(span);
                }
            });
        }

        // Card Menu Functions
        let currentCardMenuWorkItemId = null;

        function showCardMenu(event, workItemId) {
            const menu = document.getElementById('cardMenu');
            currentCardMenuWorkItemId = workItemId;

            menu.style.left = event.pageX + 'px';
            menu.style.top = event.pageY + 'px';
            menu.classList.add('show');

            setTimeout(() => {
                document.addEventListener('click', hideCardMenu);
            }, 10);
        }

        function hideCardMenu() {
            const menu = document.getElementById('cardMenu');
            menu.classList.remove('show');
            document.removeEventListener('click', hideCardMenu);
        }

        function cardMenuAction(action) {
            hideCardMenu();
            const workItemId = currentCardMenuWorkItemId;

            switch(action) {
                case 'open':
                    openWorkItem(workItemId);
                    break;
                case 'editTitle':
                    const card = document.querySelector(\`.card[data-id="\${workItemId}"]\`);
                    const titleElement = card.querySelector('.card-title');
                    editCardTitle(titleElement, workItemId);
                    break;
                case 'moveToColumn':
                    vscode.postMessage({ command: 'moveToColumn', workItemId: workItemId });
                    break;
                case 'moveToIteration':
                    vscode.postMessage({ command: 'moveToIteration', workItemId: workItemId });
                    break;
                case 'addTask':
                    vscode.postMessage({ command: 'addChildWorkItem', workItemId: workItemId, workItemType: 'Task' });
                    break;
                case 'addTest':
                    vscode.postMessage({ command: 'addChildWorkItem', workItemId: workItemId, workItemType: 'Test Case' });
                    break;
                case 'createBranch':
                    vscode.postMessage({ command: 'createBranch', workItemId: workItemId });
                    break;
                case 'delete':
                    vscode.postMessage({ command: 'confirmDeleteWorkItem', workItemId: workItemId });
                    break;
            }
        }

        // Assignee Editor
        function changeCardAssignee(workItemId, currentAssignee) {
            vscode.postMessage({ command: 'changeAssignee', workItemId: workItemId, currentAssignee: currentAssignee });
        }

        // Effort/Story Points Editor
        function toggleEffortEditor(button, workItemId) {
            const card = button.closest('.card');
            const currentEffort = card.dataset.effort || '';

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'card-title-editable';
            input.value = currentEffort;
            input.style.width = '100%';
            input.style.textAlign = 'center';
            input.placeholder = 'Enter points';

            button.replaceWith(input);
            input.focus();
            input.select();

            function saveEffort() {
                const newEffort = input.value.trim();
                vscode.postMessage({
                    command: 'updateWorkItemEffort',
                    workItemId: workItemId,
                    effort: newEffort ? parseFloat(newEffort) : null
                });

                const newButton = document.createElement('button');
                newButton.className = 'card-effort-toggle';
                newButton.onclick = (e) => { e.stopPropagation(); toggleEffortEditor(newButton, workItemId); };
                newButton.title = 'Story Points';
                newButton.innerHTML = \`<span class="effort-icon">▲</span><span class="effort-value">\${newEffort || 'Story Points'}</span>\`;
                input.replaceWith(newButton);

                card.dataset.effort = newEffort;
            }

            input.addEventListener('blur', saveEffort);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEffort();
                } else if (e.key === 'Escape') {
                    const newButton = document.createElement('button');
                    newButton.className = 'card-effort-toggle';
                    newButton.onclick = (ev) => { ev.stopPropagation(); toggleEffortEditor(newButton, workItemId); };
                    newButton.title = 'Story Points';
                    newButton.innerHTML = \`<span class="effort-icon">▲</span><span class="effort-value">\${currentEffort || 'Story Points'}</span>\`;
                    input.replaceWith(newButton);
                }
            });
        }

        function assignToMe(workItemId, event) {
            event.stopPropagation();
            vscode.postMessage({ command: 'assignToMe', workItemId: workItemId });
        }

        // Board actions
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function openInBrowser() {
            vscode.postMessage({ command: 'openInBrowser' });
        }

        // Add item form - toggle open/close
        function showAddForm(columnName) {
            const formId = 'add-form-' + columnName.replace(/\\s/g, '-');
            const form = document.getElementById(formId);
            if (form) {
                if (form.classList.contains('active')) {
                    // Close the form with slide animation
                    form.classList.remove('active');
                    const titleInput = document.getElementById('add-item-title-input');
                    if (titleInput) titleInput.value = '';
                    // Also close type dropdown if open
                    const typeDropdown = document.getElementById('add-item-type-dropdown');
                    if (typeDropdown) typeDropdown.classList.remove('open');
                } else {
                    // Open the form with slide animation
                    form.classList.add('active');
                    setTimeout(() => {
                        const input = form.querySelector('.add-item-input');
                        if (input) input.focus();
                    }, 100);
                }
            }
        }

        function hideAddForm(columnName) {
            const formId = 'add-form-' + columnName.replace(/\\s/g, '-');
            const form = document.getElementById(formId);
            if (form) {
                form.classList.remove('active');
                const titleInput = document.getElementById('add-item-title-input');
                if (titleInput) titleInput.value = '';
            }
        }

        function handleAddKeydown(event, columnName) {
            if (event.key === 'Enter') {
                createItem(columnName);
            } else if (event.key === 'Escape') {
                hideAddForm(columnName);
            }
        }

        function createItem(columnName) {
            const typeValue = document.getElementById('add-item-type-value');
            const titleInput = document.getElementById('add-item-title-input');
            const title = titleInput ? titleInput.value.trim() : '';
            const workItemType = typeValue ? typeValue.value : 'User Story';

            if (title) {
                vscode.postMessage({
                    command: 'createWorkItem',
                    columnName: columnName,
                    title: title,
                    workItemType: workItemType
                });
                hideAddForm(columnName);
            }
        }

        // Type dropdown functions
        function toggleTypeDropdown(event) {
            event.stopPropagation();
            const dropdown = document.getElementById('add-item-type-dropdown');
            if (dropdown) {
                dropdown.classList.toggle('open');
            }
        }

        function selectWorkItemType(type) {
            const typeValue = document.getElementById('add-item-type-value');
            const typeBtn = document.getElementById('add-item-type-btn');
            const dropdown = document.getElementById('add-item-type-dropdown');
            const menu = document.getElementById('add-item-type-menu');

            if (typeValue) typeValue.value = type;
            if (typeBtn) {
                typeBtn.title = type;
                const iconSpan = typeBtn.querySelector('.type-icon');
                if (iconSpan) {
                    iconSpan.innerHTML = getTypeIcon(type);
                }
            }

            // Update selected state in menu
            if (menu) {
                menu.querySelectorAll('.type-menu-item').forEach(item => {
                    item.classList.toggle('selected', item.dataset.type === type);
                });
            }

            // Close dropdown
            if (dropdown) dropdown.classList.remove('open');
        }

        function getTypeIcon(type) {
            const icons = {
                'User Story': '📘',
                'Product Backlog Item': '📘',
                'Requirement': '📘',
                'Feature': '🏆',
                'Epic': '👑',
                'Bug': '🐛',
                'Task': '📋',
                'Issue': '⚠️',
                'Impediment': '🚧',
                'Risk': '⚡',
                'Change Request': '🔄',
                'Review': '👁️',
                'Test Case': '🧪',
                'Test Plan': '📝',
                'Test Suite': '📦'
            };
            return icons[type] || '📄';
        }

        // Toast notifications
        function showToast(message, type) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast show ' + type;

            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.board-selector')) {
                const boardDropdown = document.getElementById('boardDropdown');
                if (boardDropdown) boardDropdown.classList.remove('show');
            }
            if (!event.target.closest('.filter-dropdown')) {
                document.querySelectorAll('.filter-dropdown-content').forEach(d => d.classList.remove('show'));
            }
            // Close type dropdown when clicking outside
            if (!event.target.closest('.add-item-type-dropdown')) {
                const typeDropdown = document.getElementById('add-item-type-dropdown');
                if (typeDropdown) typeDropdown.classList.remove('open');
            }
            // Close add item form when clicking outside (but not on the add button)
            if (!event.target.closest('.add-item-form-container') && !event.target.closest('.add-item-header-btn')) {
                document.querySelectorAll('.add-item-form-container.active').forEach(form => {
                    form.classList.remove('active');
                    const titleInput = form.querySelector('.add-item-input');
                    if (titleInput) titleInput.value = '';
                });
            }
        });

        function toggleDropdown(id) {
            // Close all other dropdowns
            document.querySelectorAll('.filter-dropdown-content').forEach(d => {
                if (d.id !== id) d.classList.remove('show');
            });
            document.getElementById(id).classList.toggle('show');
        }

        function handleFilterChange(type, checkbox) {
            const container = checkbox.closest('.filter-dropdown-content');
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            
            updateDropdownButton(type);
            applyFilters();
        }

        function updateDropdownButton(type) {
            const dropdownId = type + 'DropdownContent';
            const btnId = type + 'DropdownBtn';
            const clearBtnId = type + 'ClearBtn';
            const container = document.getElementById(dropdownId);
            const btn = document.getElementById(btnId);
            const clearBtn = document.getElementById(clearBtnId);
            const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
            
            const labels = {
                assignee: 'Assigned to',
                type: 'Type',
                priority: 'Priority',
                state: 'States',
                area: 'Area'
            };
            
            if (checkboxes.length === 0) {
                btn.textContent = labels[type];
                if (clearBtn) clearBtn.disabled = true;
            } else if (checkboxes.length === 1) {
                const label = checkboxes[0].parentElement.textContent.trim();
                btn.textContent = label;
                if (clearBtn) clearBtn.disabled = false;
            } else {
                const firstLabel = checkboxes[0].parentElement.textContent.trim();
                btn.textContent = firstLabel + ' (+' + (checkboxes.length - 1) + ')';
                if (clearBtn) clearBtn.disabled = false;
            }
        }

        function clearFilter(type) {
            const dropdownId = type + 'DropdownContent';
            const container = document.getElementById(dropdownId);
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
            updateDropdownButton(type);
            applyFilters();
        }

        function getSelectedValues(type) {
            const dropdownId = type + 'DropdownContent';
            const container = document.getElementById(dropdownId);
            const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
            return Array.from(checkboxes).map(cb => cb.value);
        }

        // ========== FILTER FUNCTIONALITY ==========
        let currentUserEmail = ''; // Will be set when user info is available
        let hideDoneActive = false;
        let myItemsActive = false;

        // Initialize filters on load
        document.addEventListener('DOMContentLoaded', () => {
            updateFilterCounts();
            // Request current user info from extension
            vscode.postMessage({ command: 'getCurrentUser' });
        });

        function toggleFilterBar() {
            const filterBar = document.getElementById('filterBar');
            const filterBtn = document.getElementById('filterToggleBtn');
            filterBar.classList.toggle('collapsed');
            filterBtn.classList.toggle('active', !filterBar.classList.contains('collapsed'));
        }

        function applyFilters() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
            const assigneeValues = getSelectedValues('assignee');
            const typeValues = getSelectedValues('type');
            const priorityValues = getSelectedValues('priority');
            const stateValues = getSelectedValues('state');
            const areaValues = getSelectedValues('area');

            const assigneeAll = assigneeValues.length === 0;
            const typeAll = typeValues.length === 0;
            const priorityAll = priorityValues.length === 0;
            const stateAll = stateValues.length === 0;
            const areaAll = areaValues.length === 0;

            const cards = document.querySelectorAll('.card');
            let visibleCount = 0;
            let totalCount = cards.length;

            cards.forEach(card => {
                let visible = true;

                // Search filter (ID or title)
                if (searchTerm) {
                    const cardId = card.dataset.id.toLowerCase();
                    const cardTitle = card.dataset.title.toLowerCase();
                    if (!cardId.includes(searchTerm) && !cardTitle.includes(searchTerm)) {
                        visible = false;
                    }
                }

                // Assignee filter
                if (visible && !assigneeAll) {
                    const assignee = card.dataset.assignee; // uniqueName
                    let match = false;
                    
                    if (assigneeValues.includes('me')) {
                         if (assignee && currentUserEmail && assignee.toLowerCase().includes(currentUserEmail.toLowerCase())) {
                             match = true;
                         }
                    }
                    if (assigneeValues.includes('unassigned')) {
                        if (!assignee) match = true;
                    }
                    
                    // Check specific assignees
                    if (!match && assignee) {
                        if (assigneeValues.includes(assignee)) {
                            match = true;
                        }
                    }

                    if (!match) visible = false;
                }

                // Type filter
                if (visible && !typeAll) {
                    if (!typeValues.includes(card.dataset.type)) {
                        visible = false;
                    }
                }

                // Priority filter
                if (visible && !priorityAll) {
                    const cardPriority = card.dataset.priority;
                    if (!priorityValues.includes(cardPriority)) {
                        visible = false;
                    }
                }

                // State filter
                if (visible && !stateAll) {
                    const cardState = card.dataset.state;
                    if (!stateValues.includes(cardState)) {
                        visible = false;
                    }
                }

                // Area filter
                if (visible && !areaAll) {
                    const cardArea = card.dataset.areapath;
                    if (!areaValues.includes(cardArea)) {
                        visible = false;
                    }
                }

                // Hide Done toggle
                if (visible && hideDoneActive) {
                    const state = card.dataset.state.toLowerCase();
                    if (state === 'done' || state === 'closed' || state === 'completed') {
                        visible = false;
                    }
                }

                // My Items toggle (overrides assignee filter if active)
                if (visible && myItemsActive) {
                    const assignee = card.dataset.assignee;
                    if (!assignee || (currentUserEmail && !assignee.toLowerCase().includes(currentUserEmail.toLowerCase()))) {
                        visible = false;
                    }
                }

                if (visible) {
                    card.classList.remove('filtered-out');
                    visibleCount++;
                } else {
                    card.classList.add('filtered-out');
                }
            });

            updateFilterCounts();
            updateClearFiltersButton();
            updateColumnVisibleCounts();
        }

        function updateFilterCounts() {
            const cards = document.querySelectorAll('.card');
            const visibleCards = document.querySelectorAll('.card:not(.filtered-out)');
            document.getElementById('visibleCount').textContent = visibleCards.length;
            document.getElementById('totalCount').textContent = cards.length;
        }

        function updateColumnVisibleCounts() {
            document.querySelectorAll('.column').forEach(column => {
                const allCards = column.querySelectorAll('.card');
                const visibleCards = column.querySelectorAll('.card:not(.filtered-out)');
                const badge = column.querySelector('.wip-badge');
                const limit = parseInt(column.dataset.limit) || 0;

                // Update badge to show visible count
                badge.textContent = limit > 0 ? visibleCards.length + '/' + limit : visibleCards.length;

                // Update badge color based on visible count
                badge.classList.remove('warning', 'danger');
                if (limit > 0) {
                    if (visibleCards.length >= limit) {
                        badge.classList.add('danger');
                    } else if (visibleCards.length >= limit * 0.8) {
                        badge.classList.add('warning');
                    }
                }
            });
        }

        function updateClearFiltersButton() {
            const hasFilters = isAnyFilterActive();
            const clearBtn = document.getElementById('clearFiltersBtn');
            clearBtn.style.display = hasFilters ? 'block' : 'none';
        }

        function isAnyFilterActive() {
            const assigneeChecked = document.querySelectorAll('#assigneeDropdownContent input[type="checkbox"]:checked').length > 0;
            const typeChecked = document.querySelectorAll('#typeDropdownContent input[type="checkbox"]:checked').length > 0;
            const priorityChecked = document.querySelectorAll('#priorityDropdownContent input[type="checkbox"]:checked').length > 0;
            const stateChecked = document.querySelectorAll('#stateDropdownContent input[type="checkbox"]:checked').length > 0;
            const areaChecked = document.querySelectorAll('#areaDropdownContent input[type="checkbox"]:checked').length > 0;

            return document.getElementById('searchInput').value.trim() !== '' ||
                   assigneeChecked ||
                   typeChecked ||
                   priorityChecked ||
                   stateChecked ||
                   areaChecked ||
                   hideDoneActive ||
                   myItemsActive;
        }

        function clearSearch() {
            document.getElementById('searchInput').value = '';
            applyFilters();
        }

        function clearAllFilters() {
            document.getElementById('searchInput').value = '';
            
            ['assignee', 'type', 'priority', 'state', 'area'].forEach(type => {
                const container = document.getElementById(type + 'DropdownContent');
                if (container) {
                    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(cb => cb.checked = false);
                    updateDropdownButton(type);
                }
            });

            hideDoneActive = false;
            myItemsActive = false;
            document.getElementById('hideDoneToggle').classList.remove('active');
            document.getElementById('myItemsToggle').classList.remove('active');

            applyFilters();
        }

        function toggleHideDone() {
            hideDoneActive = !hideDoneActive;
            const toggle = document.getElementById('hideDoneToggle');
            toggle.classList.toggle('active', hideDoneActive);
            applyFilters();
        }

        function toggleMyItems() {
            myItemsActive = !myItemsActive;
            const toggle = document.getElementById('myItemsToggle');
            toggle.classList.toggle('active', myItemsActive);

            if (myItemsActive) {
                const container = document.getElementById('assigneeDropdownContent');
                const checkboxes = container.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => cb.checked = false);
                updateDropdownButton('assignee');
            }

            applyFilters();
        }

        // Add 'F' keyboard shortcut to toggle filter bar
        const originalKeydownHandler = handleGlobalKeydown;
        function handleGlobalKeydownWithFilter(event) {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            if (event.key === 'f' || event.key === 'F') {
                if (!event.ctrlKey && !event.metaKey) {
                    toggleFilterBar();
                    // Focus search input if filter bar is now visible
                    const filterBar = document.getElementById('filterBar');
                    if (!filterBar.classList.contains('collapsed')) {
                        document.getElementById('searchInput').focus();
                    }
                    return;
                }
            }
            // Call original handler for other keys
            originalKeydownHandler(event);
        }
        // Replace the keydown handler
        document.removeEventListener('keydown', handleGlobalKeydown);
        document.addEventListener('keydown', handleGlobalKeydownWithFilter);

        // Handle current user response from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setCurrentUser') {
                currentUserEmail = message.email || '';
                // Re-apply filters now that we have the current user info
                // This ensures @Me works correctly even if data arrives late
                applyFilters();
            }
        });
    </script>
</body>
</html>`;
    }

    private _renderCard(item: BoardWorkItem, colIndex: number = 0, itemIndex: number = 0): string {
        const initials = item.assignedTo?.displayName
            ? item.assignedTo.displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            : '?';
        const stateLower = item.state.toLowerCase();
        const stateClass = stateLower.includes('done') || stateLower.includes('closed') ? 'done'
                         : stateLower.includes('active') || stateLower.includes('doing') ? 'doing'
                         : 'todo';

        const typeIcon = this._getTypeIcon(item.type);
        const effort = (item as any).effort || (item as any).storyPoints || '';

        const tags = item.tags
            ? item.tags.split(';').map((tag) => {
                const tagName = tag.trim();
                const tagColor = this._getTagColor(tagName);
                const textColor = this._getContrastTextColor(tagColor);
                return `<span class="tag" style="background-color: ${tagColor}; border-color: ${tagColor}; color: ${textColor};">${this._escapeHtml(tagName)}</span>`;
              }).join('')
            : '';

        // Check if any card styling rules apply to this work item
        const cardBackgroundColor = this._getCardBackgroundColor(item);
        const cardStyle = cardBackgroundColor ? `style="background-color: ${cardBackgroundColor} !important;"` : '';
        const hasChildren = item.children && item.children.length > 0;

        return `
        <div class="card ${hasChildren ? 'has-children' : ''}"
             draggable="true"
             data-id="${item.id}"
             data-col="${colIndex}"
             data-item="${itemIndex}"
             data-title="${this._escapeHtml(item.title)}"
             data-type="${this._escapeHtml(item.type)}"
             data-priority="${item.priority || ''}"
             data-assignee="${item.assignedTo?.uniqueName || ''}"
             data-assignee-name="${item.assignedTo?.displayName || ''}"
             data-state="${this._escapeHtml(item.state)}"
             data-tags="${item.tags || ''}"
             data-areapath="${this._escapeHtml(item.areaPath || '')}"
             data-effort="${effort}"
             ${cardStyle}
             tabindex="0"
             ondragstart="handleDragStart(event, ${item.id})"
             ondragend="handleDragEnd(event)"
             onclick="openWorkItem(${item.id})"
             onfocus="selectCard(this)">
            <div class="card-header">
                <span class="card-type-icon" title="${this._escapeHtml(item.type)}">${typeIcon}</span>
                <div class="card-header-content">
                    <div class="card-id-title">
                        <span class="card-id" onclick="event.stopPropagation(); openWorkItem(${item.id})">${item.id}</span>
                        <span class="card-title" ondblclick="event.stopPropagation(); editCardTitle(this, ${item.id})">${this._escapeHtml(item.title)}</span>
                    </div>
                </div>
                <button class="card-menu-btn" onclick="event.stopPropagation(); showCardMenu(event, ${item.id})" title="More options">⋯</button>
            </div>
            <div class="card-status">
                <span class="status-dot ${stateClass}"></span>
                <span class="status-label">${this._escapeHtml(item.state)}</span>
            </div>
            <div class="card-assignee" onclick="event.stopPropagation(); changeCardAssignee(${item.id}, '${this._escapeHtml(item.assignedTo?.displayName || '')}')">
                <div class="card-avatar ${!item.assignedTo ? 'unassigned' : ''}">${initials}</div>
                <span class="card-assignee-name ${!item.assignedTo ? 'unassigned-text' : ''}">${item.assignedTo ? this._escapeHtml(item.assignedTo.displayName) : ''}</span>
            </div>
            ${tags ? `<div class="card-tags">${tags}</div>` : ''}
            ${this._renderChildIndicator(item)}
        </div>`;

    }

    private _renderChildIndicator(item: BoardWorkItem): string {
        if (!item.children || item.children.length === 0) {
            return '';
        }

        // Group children by work item type
        const childrenByType = new Map<string, {id: number, title: string, state: string, type: string}[]>();
        item.children.forEach(child => {
            const type = child.type || 'Unknown';
            if (!childrenByType.has(type)) {
                childrenByType.set(type, []);
            }
            childrenByType.get(type)!.push(child);
        });

        // Render indicator for each work item type
        const indicators: string[] = [];
        childrenByType.forEach((children, type) => {
            const totalChildren = children.length;
            const closedChildren = children.filter(child => {
                const state = child.state?.toLowerCase() || '';
                return state === 'closed' || state === 'done' || state === 'completed';
            }).length;
            const allClosed = closedChildren === totalChildren;
            const childIcon = this._getChildTypeIcon(type);

            indicators.push(`
                <div class="child-indicator-item ${allClosed ? 'completed' : ''}" title="${closedChildren} of ${totalChildren} ${this._escapeHtml(type)} child work items completed">
                    ${childIcon}
                    <span class="child-count">${closedChildren}/${totalChildren}</span>
                </div>
            `);
        });

        return `<div class="child-indicators-container">${indicators.join('')}</div>`;
    }

    private _getChildTypeIcon(type: string): string {
        // Return actual Azure DevOps work item type icons at 12x12 size
        switch(type) {
            case 'User Story':
            case 'Product Backlog Item':
            case 'Requirement':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><path fill="#4396C2" d="M320 352c-22.846 0-60.713 5.861-80 16.588V55.635C257.752 40.563 296.084 32 320 32h64v320h-64zm-192 32H32V64H0v352h208s-16-32-80-32zM64 32v320h64c22.848 0 60.707 5.865 80 16.594V55.635C190.244 40.561 151.902 32 128 32H64zm352 32v320h-96c-64 0-80 32-80 32h208V64h-32z" /></svg>`;

            case 'Feature':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><path fill="#773B93" d="M145.619 384H128c-17.674 0-32 14.326-32 32v32h256v-32c0-17.674-14.327-32-32-32h-17.619c-7.434-36.47-39.75-64-78.381-64s-70.947 27.53-78.381 64zM224 352c20.832 0 38.425 13.418 45.053 32h-90.106c6.627-18.582 24.221-32 45.053-32zM352 64V32H96v32H32v80c0 40.051 29.686 73.018 68.153 78.8C114.003 278.531 163.984 320 224 320c60.016 0 109.997-41.469 123.846-97.2C386.313 217.018 416 184.051 416 144V64h-64zM96 189.053C77.417 182.426 64 164.832 64 144V96h32v93.053zM384 144c0 20.832-13.418 38.426-32 45.053V96h32v48z" /></svg>`;

            case 'Epic':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><path fill="#FF8C00" d="M448 96c0 17.672-14.326 32-32 32v288H32V128c-17.674 0-32-14.328-32-32 0-17.674 14.326-32 32-32s32 14.326 32 32c0 11.191-6.094 20.564-14.797 26.283L136.727 256 216.79 94.543C202.699 91.191 192 79.113 192 64c0-17.674 14.326-32 32-32s32 14.326 32 32c0 15.113-10.699 27.191-24.789 30.543L311.273 256l87.523-133.717C390.094 116.564 384 107.191 384 96c0-17.674 14.326-32 32-32s32 14.326 32 32z" /></svg>`;

            case 'Task':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><path fill="#FFC107" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zM128 96h64V64c0-17.641 14.359-32 32-32s32 14.359 32 32v32h64v32H128V96zm56 287.758l-79.844-79.828 31.688-31.688L184 320.414l128.156-128.172 31.688 31.688L184 383.758z" /></svg>`;

            case 'Issue':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><path fill="#28A745" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zm-71.469 352h-49.063v-49.094h49.063V416zm0-84.109h-49.063V164.109h49.063v167.782zM320 128H128V96h64V64c0-17.643 14.357-32 32-32 17.641 0 32 14.357 32 32v32h64v32z" /></svg>`;

            case 'Bug':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><path fill="#CC293D" d="M352 224c0-17.672 14.328-32 32-32h32v-32h-32c-8.828 0-16.938 2.797-23.656 7.516C350.391 140.234 324.078 120 293 120.781 287.016 108.297 275.547 99.828 262 96.781V64h32V32h-96v32h32v32.781c-13.547 3.047-25.016 11.516-31 24-31.078.781-57.391 21.016-67.344 48.297C125.938 163.797 117.828 161 109 161H77v32h32c17.672 0 32 14.328 32 32v32c0 17.672-14.328 32-32 32H77v32h32c8.828 0 16.938-2.797 23.656-7.516C142.609 340.766 168.922 361 200 360.219c5.984 12.484 17.453 20.953 31 24V417h-32v32h96v-32h-32v-32.781c13.547-3.047 25.016-11.516 31-24 31.078-.781 57.391-21.016 67.344-48.297C366.062 317.203 374.172 320 383 320h32v-32h-32c-17.672 0-32-14.328-32-32v-32zm-80 48c-26.469 0-48-21.531-48-48s21.531-48 48-48 48 21.531 48 48-21.531 48-48 48z" /></svg>`;

            case 'Test Case':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><path fill="#9B59B6" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zM128 96h64V64c0-17.641 14.359-32 32-32s32 14.359 32 32v32h64v32H128V96zm192 320H128V192h192v224z" /></svg>`;

            default:
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="12" height="12"><circle cx="224" cy="224" r="160" fill="#666666"/></svg>`;
        }
    }

    private _getTypeIcon(type: string): string {
        // Use SVG icons with Azure DevOps standard colors
        switch(type) {
            case 'User Story':
            case 'Product Backlog Item':
            case 'Requirement':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#4396C2" d="M320 352c-22.846 0-60.713 5.861-80 16.588V55.635C257.752 40.563 296.084 32 320 32h64v320h-64zm-192 32H32V64H0v352h208s-16-32-80-32zM64 32v320h64c22.848 0 60.707 5.865 80 16.594V55.635C190.244 40.561 151.902 32 128 32H64zm352 32v320h-96c-64 0-80 32-80 32h208V64h-32z" /></svg>`;

            case 'Feature':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#773B93" d="M145.619 384H128c-17.674 0-32 14.326-32 32v32h256v-32c0-17.674-14.327-32-32-32h-17.619c-7.434-36.47-39.75-64-78.381-64s-70.947 27.53-78.381 64zM224 352c20.832 0 38.425 13.418 45.053 32h-90.106c6.627-18.582 24.221-32 45.053-32zM352 64V32H96v32H32v80c0 40.051 29.686 73.018 68.153 78.8C114.003 278.531 163.984 320 224 320c60.016 0 109.997-41.469 123.846-97.2C386.313 217.018 416 184.051 416 144V64h-64zM96 189.053C77.417 182.426 64 164.832 64 144V96h32v93.053zM384 144c0 20.832-13.418 38.426-32 45.053V96h32v48z" /></svg>`;

            case 'Epic':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#FF8C00" d="M448 96c0 17.672-14.326 32-32 32v288H32V128c-17.674 0-32-14.328-32-32 0-17.674 14.326-32 32-32s32 14.326 32 32c0 11.191-6.094 20.564-14.797 26.283L136.727 256 216.79 94.543C202.699 91.191 192 79.113 192 64c0-17.674 14.326-32 32-32s32 14.326 32 32c0 15.113-10.699 27.191-24.789 30.543L311.273 256l87.523-133.717C390.094 116.564 384 107.191 384 96c0-17.674 14.326-32 32-32s32 14.326 32 32z" /></svg>`;

            case 'Task':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#FFC107" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zM128 96h64V64c0-17.641 14.359-32 32-32s32 14.359 32 32v32h64v32H128V96zm56 287.758l-79.844-79.828 31.688-31.688L184 320.414l128.156-128.172 31.688 31.688L184 383.758z" /></svg>`;

            case 'Issue':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#28A745" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zm-71.469 352h-49.063v-49.094h49.063V416zm0-84.109h-49.063V164.109h49.063v167.782zM320 128H128V96h64V64c0-17.643 14.357-32 32-32 17.641 0 32 14.357 32 32v32h64v32z" /></svg>`;

            case 'Bug':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#CC293D" d="M352 224c0-17.672 14.328-32 32-32h32v-32h-32c-8.828 0-16.938 2.797-23.656 7.516C350.391 140.234 324.078 120 293 120.781 287.016 108.297 275.547 99.828 262 96.781V64h32V32h-96v32h32v32.781c-13.547 3.047-25.016 11.516-31 24-31.078.781-57.391 21.016-67.344 48.297C125.938 163.797 117.828 161 109 161H77v32h32c17.672 0 32 14.328 32 32v32c0 17.672-14.328 32-32 32H77v32h32c8.828 0 16.938-2.797 23.656-7.516C142.609 340.766 168.922 361 200 360.219c5.984 12.484 17.453 20.953 31 24V417h-32v32h96v-32h-32v-32.781c13.547-3.047 25.016-11.516 31-24 31.078-.781 57.391-21.016 67.344-48.297C366.062 317.203 374.172 320 383 320h32v-32h-32c-17.672 0-32-14.328-32-32v-32zm-80 48c-26.469 0-48-21.531-48-48s21.531-48 48-48 48 21.531 48 48-21.531 48-48 48z" /></svg>`;

            case 'Test Case':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#9B59B6" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zM128 96h64V64c0-17.641 14.359-32 32-32s32 14.359 32 32v32h64v32H128V96zm192 320H128V192h192v224z" /></svg>`;

            default:
                // Generic work item icon for unknown types
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="16" height="16"><path fill="#666666" d="M384 0H64C28.65 0 0 28.65 0 64v320c0 35.35 28.65 64 64 64h320c35.35 0 64-28.65 64-64V64c0-35.35-28.65-64-64-64zm32 384c0 17.64-14.36 32-32 32H64c-17.64 0-32-14.36-32-32V64c0-17.64 14.36-32 32-32h320c17.64 0 32 14.36 32 32v320z"/><rect x="96" y="96" width="256" height="32" fill="#666666"/><rect x="96" y="160" width="192" height="32" fill="#666666"/><rect x="96" y="224" width="224" height="32" fill="#666666"/></svg>`;
        }
    }

    private _getDefaultWorkItemType(): string {
        // Map board names to work item types
        const boardNameLower = this.boardName.toLowerCase();

        // Common board name patterns
        if (boardNameLower.includes('issue')) return 'Issue';
        if (boardNameLower.includes('bug')) return 'Bug';
        if (boardNameLower.includes('task')) return 'Task';
        if (boardNameLower.includes('epic')) return 'Epic';
        if (boardNameLower.includes('feature')) return 'Feature';
        if (boardNameLower.includes('story') || boardNameLower.includes('stories')) return 'User Story';
        if (boardNameLower.includes('backlog') || boardNameLower.includes('pbi')) return 'Product Backlog Item';
        if (boardNameLower.includes('requirement')) return 'Requirement';

        // Default to User Story if no match
        return 'User Story';
    }

    private _getBoardIcon(boardName: string): string {
        // Map board name to work item type and return its icon
        const boardNameLower = boardName.toLowerCase();

        // Common board name patterns
        if (boardNameLower.includes('issue')) return this._getTypeIcon('Issue');
        if (boardNameLower.includes('bug')) return this._getTypeIcon('Bug');
        if (boardNameLower.includes('task')) return this._getTypeIcon('Task');
        if (boardNameLower.includes('epic')) return this._getTypeIcon('Epic');
        if (boardNameLower.includes('feature')) return this._getTypeIcon('Feature');
        if (boardNameLower.includes('story') || boardNameLower.includes('stories')) return this._getTypeIcon('User Story');
        if (boardNameLower.includes('backlog') || boardNameLower.includes('pbi')) return this._getTypeIcon('Product Backlog Item');
        if (boardNameLower.includes('requirement')) return this._getTypeIcon('Requirement');

        // Default to User Story icon if no match
        return this._getTypeIcon('User Story');
    }

    private _getCardBackgroundColor(item: BoardWorkItem): string | null {
        // Check each card styling rule to see if it applies to this work item
        for (const rule of this._cardStyleRules) {
            if (this._evaluateCardStyleRule(rule.filter, item)) {
                return rule.settings['background-color'];
            }
        }
        return null;
    }

    private _evaluateCardStyleRule(filter: string, item: BoardWorkItem): boolean {
        try {
            // Generic pattern to match field comparisons: [FieldName] operator value
            const fieldPattern = /\[([^\]]+)\]\s*(=|!=|>|>=|<|<=|Contains|Under)\s*(?:'([^']+)'|(\d+(?:\.\d+)?))/gi;
            const matches = [...filter.matchAll(fieldPattern)];
            
            if (matches.length === 0) return false;
            
            // Evaluate all conditions (AND logic)
            for (const match of matches) {
                const fieldName = match[1];
                const operator = match[2].toLowerCase();
                const stringValue = match[3];
                const numericValue = match[4] ? parseFloat(match[4]) : null;
                
                if (!this._evaluateFieldCondition(fieldName, operator, stringValue, numericValue, item)) {
                    return false;
                }
            }
            
            return matches.length > 0;
        } catch (error) {
            console.error('Error evaluating card style rule:', error);
            return false;
        }
    }

    private _evaluateFieldCondition(fieldName: string, operator: string, stringValue: string | undefined, numericValue: number | null, item: BoardWorkItem): boolean {
        const fieldLower = fieldName.toLowerCase();
        
        // Tags
        if (fieldLower.includes('tags')) {
            const itemTags = (item.tags || '').toLowerCase();
            const filterValue = (stringValue || '').toLowerCase();
            if (operator === 'contains') return itemTags.includes(filterValue);
            if (operator === '=') return itemTags.split(';').map(t => t.trim()).includes(filterValue);
        }
        
        // State
        if (fieldLower.includes('state')) {
            const itemState = item.state.toLowerCase();
            const filterValue = (stringValue || '').toLowerCase();
            if (operator === '=') return itemState === filterValue;
            if (operator === '!=') return itemState !== filterValue;
        }
        
        // Work Item Type
        if (fieldLower.includes('workitemtype')) {
            const itemType = item.type.toLowerCase();
            const filterValue = (stringValue || '').toLowerCase();
            if (operator === '=') return itemType === filterValue;
            if (operator === '!=') return itemType !== filterValue;
        }
        
        // Priority
        if (fieldLower.includes('priority') && item.priority !== undefined) {
            if (numericValue !== null) {
                if (operator === '=') return item.priority === numericValue;
                if (operator === '!=') return item.priority !== numericValue;
                if (operator === '>') return item.priority > numericValue;
                if (operator === '>=') return item.priority >= numericValue;
                if (operator === '<') return item.priority < numericValue;
                if (operator === '<=') return item.priority <= numericValue;
            }
        }
        
        // Area Path
        if (fieldLower.includes('areapath')) {
            const itemArea = (item.areaPath || '').toLowerCase();
            const filterValue = (stringValue || '').toLowerCase();
            if (operator === '=') return itemArea === filterValue;
            if (operator === 'under') return itemArea.startsWith(filterValue);
        }
        
        // Title
        if (fieldLower.includes('title')) {
            const itemTitle = item.title.toLowerCase();
            const filterValue = (stringValue || '').toLowerCase();
            if (operator === 'contains') return itemTitle.includes(filterValue);
            if (operator === '=') return itemTitle === filterValue;
        }
        
        // Assigned To
        if (fieldLower.includes('assignedto')) {
            const itemAssignee = (item.assignedTo?.displayName || item.assignedTo?.uniqueName || '').toLowerCase();
            const filterValue = (stringValue || '').toLowerCase();
            if (operator === '=') return itemAssignee === filterValue;
            if (operator === 'contains') return itemAssignee.includes(filterValue);
        }
        
        // Numeric fields (Story Points, Remaining Work, Business Value, etc.)
        // These would need to be added to BoardWorkItem interface and fetched from API
        const numericFields = ['storypoints', 'remainingwork', 'businessvalue', 'effort', 'severity'];
        if (numericFields.some(f => fieldLower.includes(f)) && numericValue !== null) {
            const itemValue = (item as any)[fieldLower.replace(/[^a-z]/g, '')] || 0;
            if (operator === '=') return itemValue === numericValue;
            if (operator === '!=') return itemValue !== numericValue;
            if (operator === '>') return itemValue > numericValue;
            if (operator === '>=') return itemValue >= numericValue;
            if (operator === '<') return itemValue < numericValue;
            if (operator === '<=') return itemValue <= numericValue;
        }
        
        return false;
    }

    private _getContrastTextColor(backgroundColor: string): string {
        // Calculate relative luminance and return black or white text for optimal contrast
        // Based on WCAG guidelines: https://www.w3.org/TR/WCAG20/#relativeluminancedef
        
        // Parse color (supports hex, rgb, rgba)
        let r = 0, g = 0, b = 0;
        
        if (backgroundColor.startsWith('#')) {
            // Hex color
            const hex = backgroundColor.replace('#', '');
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            }
        } else if (backgroundColor.startsWith('rgb')) {
            // RGB/RGBA color
            const match = backgroundColor.match(/\d+/g);
            if (match && match.length >= 3) {
                r = parseInt(match[0]);
                g = parseInt(match[1]);
                b = parseInt(match[2]);
            }
        }
        
        // Calculate relative luminance
        const rsRGB = r / 255;
        const gsRGB = g / 255;
        const bsRGB = b / 255;
        
        const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
        const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
        const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
        
        const luminance = 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
        
        // Use black text for light backgrounds (luminance > 0.5), white for dark
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    private _getTagColor(tagName: string): string {
        // Check if we have a color for this tag from Azure DevOps
        const azureColor = this._tagColors.get(tagName.toLowerCase());
        if (azureColor) {
            return azureColor;
        }

        // Fall back to consistent colors based on tag name (not index)
        // This ensures the same tag always gets the same color across all cards
        const fallbackColors = [
            'rgba(0, 120, 212, 0.15)',   // blue
            'rgba(16, 124, 16, 0.15)',   // green
            'rgba(136, 23, 152, 0.15)',  // purple
            'rgba(232, 17, 35, 0.15)',   // pink/red
            'rgba(255, 185, 0, 0.15)',   // yellow
            'rgba(0, 183, 195, 0.15)'    // cyan
        ];

        // Generate consistent hash from tag name
        let hash = 0;
        for (let i = 0; i < tagName.length; i++) {
            hash = ((hash << 5) - hash) + tagName.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }

        // Use absolute value to ensure positive index
        const colorIndex = Math.abs(hash) % fallbackColors.length;
        return fallbackColors[colorIndex];
    }

    private _escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    private _startAutoRefresh() {
        // Refresh every 30 seconds
        this._refreshInterval = setInterval(async () => {
            const now = Date.now();
            // Only refresh if the panel is visible and it's been at least 30 seconds
            if (this._panel.visible && now - this._lastRefreshTime >= 30000) {
                this._lastRefreshTime = now;
                await this._loadAndRender();
            }
        }, 30000);
    }

    private _stopAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = undefined;
        }
    }

    public dispose() {
        // Unsubscribe from events
        if (this.eventSubscription) {
            this.eventSubscription.dispose();
            this.eventSubscription = null;
        }

        this._stopAutoRefresh();
        BoardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
