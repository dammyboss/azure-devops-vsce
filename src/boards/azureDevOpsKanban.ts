import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';

interface BoardColumn {
    id: string;
    name: string;
    itemLimit: number;
    stateMappings: Record<string, string>;
}

interface BoardWorkItem {
    id: number;
    title: string;
    state: string;
    type: string;
    assignedTo?: {
        displayName: string;
        uniqueName: string;
    };
    priority?: number;
    tags?: string;
    boardColumn?: string;
}

export class AzureDevOpsKanbanPanel {
    public static currentPanel: AzureDevOpsKanbanPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private authManager: AuthenticationManager;
    private boardId: string;
    private boardName: string;
    private columns: BoardColumn[] = [];
    private workItems: Map<string, BoardWorkItem[]> = new Map();

    private constructor(
        panel: vscode.WebviewPanel,
        authManager: AuthenticationManager,
        boardId: string,
        boardName: string
    ) {
        this._panel = panel;
        this.authManager = authManager;
        this.boardId = boardId;
        this.boardName = boardName;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );

        this._loadBoardData();
    }

    public static async show(
        authManager: AuthenticationManager,
        boardId: string,
        boardName: string
    ) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (AzureDevOpsKanbanPanel.currentPanel) {
            AzureDevOpsKanbanPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'azureDevOpsKanban',
            boardName,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        AzureDevOpsKanbanPanel.currentPanel = new AzureDevOpsKanbanPanel(
            panel,
            authManager,
            boardId,
            boardName
        );
    }

    private async _loadBoardData(): Promise<void> {
        const axios = this.authManager.getAxiosInstance();
        const config = this.authManager.getConfig();

        if (!axios || !config?.defaultProject || !config?.defaultTeam) {
            throw new Error('Not connected to Azure DevOps');
        }

        let allowedWorkItemTypes: string[] = [];
        try {
            const backlogsResponse = await axios.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/backlogs`
            );
            const backlogs = backlogsResponse.data.value || [];
            const matchingBacklog = backlogs.find((b: any) =>
                b.name === this.boardName || b.id === this.boardId
            );
            if (matchingBacklog && matchingBacklog.workItemTypes) {
                allowedWorkItemTypes = matchingBacklog.workItemTypes.map((wit: any) => wit.name);
            }
        } catch (error) {
            console.error('Failed to load backlog configuration:', error);
        }

        const columnsResponse = await axios.get(
            `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards/${this.boardId}/columns`
        );

        this.columns = (columnsResponse.data.value || []).map((col: any) => ({
            id: col.id || col.name,
            name: col.name,
            itemLimit: col.itemLimit || 0,
            stateMappings: col.stateMappings || {}
        }));

        this.workItems = new Map<string, BoardWorkItem[]>();

        for (const column of this.columns) {
            this.workItems.set(column.name, []);
        }

        let workItemTypeFilter = '';
        if (allowedWorkItemTypes.length > 0) {
            const typeConditions = allowedWorkItemTypes
                .map(t => `[System.WorkItemType] = '${t.replace(/'/g, "''")}'`)
                .join(' OR ');
            workItemTypeFilter = `AND (${typeConditions})`;
        }

        for (const column of this.columns) {
            try {
                const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [Microsoft.VSTS.Common.Priority], [System.Tags]
                              FROM WorkItems
                              WHERE [System.TeamProject] = @project
                              AND [System.BoardColumn] = '${column.name.replace(/'/g, "''")}'
                              ${workItemTypeFilter}
                              ORDER BY [Microsoft.VSTS.Common.BacklogPriority]`;

                const wiqlResponse = await axios.post(
                    `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                    { query: wiql }
                );

                const workItemRefs = wiqlResponse.data.workItems || [];

                if (workItemRefs.length > 0) {
                    const workItemIds = workItemRefs.slice(0, 100).map((item: any) => item.id).join(',');
                    const detailsResponse = await axios.get('/_apis/wit/workitems', {
                        params: {
                            'ids': workItemIds,
                            'fields': 'System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,Microsoft.VSTS.Common.Priority,System.Tags,System.BoardColumn'
                        }
                    });

                    const workItems: BoardWorkItem[] = (detailsResponse.data.value || []).map((item: any) => ({
                        id: item.id,
                        title: item.fields['System.Title'],
                        state: item.fields['System.State'],
                        type: item.fields['System.WorkItemType'],
                        assignedTo: item.fields['System.AssignedTo'],
                        priority: item.fields['Microsoft.VSTS.Common.Priority'],
                        tags: item.fields['System.Tags'],
                        boardColumn: item.fields['System.BoardColumn'] || column.name
                    }));

                    this.workItems.set(column.name, workItems);
                }
            } catch (error) {
                console.error(`Failed to load work items for column ${column.name}:`, error);
            }
        }

        this._panel.webview.html = this._getHtmlContent();
    }

    private async _handleMessage(message: any) {
        switch (message.command) {
            case 'moveWorkItem':
                await this._moveWorkItem(message.workItemId, message.targetColumn, message.targetState);
                break;
            case 'openWorkItem':
                vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', message.workItemId);
                break;
            case 'refresh':
                await this._loadBoardData();
                break;
        }
    }

    private async _moveWorkItem(workItemId: number, targetColumn: string, targetState: string): Promise<void> {
        try {
            const axios = this.authManager.getAxiosInstance();
            if (!axios) {
                throw new Error('Not connected');
            }

            await axios.patch(
                `/_apis/wit/workitems/${workItemId}`,
                [{ op: 'replace', path: '/fields/System.State', value: targetState }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            this._panel.webview.postMessage({
                command: 'moveSuccess',
                workItemId,
                targetColumn,
                message: `Moved #${workItemId} to ${targetColumn}`
            });

            vscode.window.showInformationMessage(`Moved #${workItemId} to ${targetColumn}`);

        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'moveFailed',
                workItemId,
                message: error?.message || 'Failed to move work item'
            });

            vscode.window.showErrorMessage(`Failed to move work item: ${error?.message || error}`);
        }
    }

    private _getHtmlContent(): string {
        const config = this.authManager.getConfig();
        const columnsJson = JSON.stringify(this.columns);
        
        const workItemsObj: Record<string, BoardWorkItem[]> = {};
        this.workItems.forEach((items, columnName) => {
            workItemsObj[columnName] = items;
        });
        const workItemsJson = JSON.stringify(workItemsObj);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.boardName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            overflow: hidden;
        }

        #app {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .board-header {
            padding: 24px;
            margin-bottom: 0;
        }

        .board-title {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 8px;
        }

        .board-stats {
            display: flex;
            gap: 16px;
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .filter-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }

        .filter-search {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 4px 8px;
            flex: 0 0 200px;
        }

        .filter-search input {
            background: none;
            border: none;
            color: var(--vscode-input-foreground);
            outline: none;
            flex: 1;
            font-size: 13px;
        }

        .filter-dropdown {
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            color: var(--vscode-dropdown-foreground);
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
        }

        .clear-filters {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 3px;
            margin-left: auto;
        }

        .clear-filters:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .board-container {
            flex: 1;
            overflow: hidden;
            padding: 16px;
        }

        .board-columns {
            display: flex;
            gap: 16px;
            height: 100%;
            overflow-x: auto;
        }

        .column {
            flex: 0 0 280px;
            display: flex;
            flex-direction: column;
            background: var(--vscode-sideBar-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
            transition: flex 0.2s ease;
        }

        .column.collapsed {
            flex: 0 0 50px;
        }

        .column-header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            cursor: pointer;
        }

        .column-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .column.collapsed .column-header {
            border-bottom: none;
        }

        .column.collapsed .column-content {
            display: none;
        }

        .column-title {
            font-weight: 600;
            font-size: 14px;
        }

        .wip-indicator {
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .wip-indicator.warning {
            background: #f59e0b;
            color: #000;
        }

        .wip-indicator.danger {
            background: #ef4444;
            color: #fff;
        }

        .column-content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .column-content.drag-over {
            background: var(--vscode-list-hoverBackground);
        }

        .work-item-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 3px solid var(--vscode-focusBorder);
            border-radius: 4px;
            padding: 12px;
            cursor: pointer;
            transition: all 150ms ease;
        }

        .work-item-card:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transform: translateY(-1px);
        }

        .work-item-card.dragging {
            opacity: 0.5;
        }

        .card-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .card-id {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .card-title {
            font-size: 13px;
            margin-bottom: 8px;
            line-height: 1.4;
        }

        .card-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 8px;
        }

        .card-avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 600;
        }

        .codicon {
            font-family: codicon;
            font-size: 16px;
        }

        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-hoverBackground);
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div id="app">
        <div class="board-header">
            <h1 class="board-title">${this.boardName}</h1>
            <div class="board-stats">
                <div class="stat-item">
                    <span>Total:</span>
                    <span id="total-count">0</span>
                </div>
            </div>
        </div>

        <div class="filter-bar">
            <div class="filter-search">
                <span class="codicon codicon-search"></span>
                <input type="text" placeholder="Filter by keyword" id="keyword-filter">
            </div>
            <select class="filter-dropdown" id="assigned-filter">
                <option value="">Assigned to</option>
            </select>
            <select class="filter-dropdown" id="state-filter">
                <option value="">States</option>
            </select>
            <select class="filter-dropdown" id="tags-filter">
                <option value="">Tags</option>
            </select>
            <button class="clear-filters" id="clear-filters" title="Clear all filters">
                <span class="codicon codicon-close"></span>
            </button>
        </div>

        <div class="board-container">
            <div class="board-columns" id="board-columns"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const workItemsByColumn = ${workItemsJson};
        const columns = ${columnsJson};

        function renderBoard() {
            const container = document.getElementById('board-columns');
            container.innerHTML = '';

            columns.forEach(col => {
                const items = workItemsByColumn[col.name] || [];
                const wipLimit = col.itemLimit || 0;
                const wipClass = wipLimit > 0 && items.length >= wipLimit ? 
                    (items.length > wipLimit ? 'danger' : 'warning') : '';

                const columnEl = document.createElement('div');
                columnEl.className = 'column';
                columnEl.dataset.columnName = col.name;

                columnEl.innerHTML = \`
                    <div class="column-header">
                        <span class="column-title">\${col.name}</span>
                        <span class="wip-indicator \${wipClass}">\${items.length}\${wipLimit > 0 ? '/' + wipLimit : ''}</span>
                    </div>
                    <div class="column-content" data-column-name="\${col.name}">
                        \${items.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--vscode-descriptionForeground);font-size:12px;">No items</div>' : ''}
                        \${items.map(item => renderCard(item)).join('')}
                    </div>
                \`;

                container.appendChild(columnEl);
            });

            attachEventListeners();
            updateStats();
        }

        function updateStats() {
            const allItems = [];
            for (const col in workItemsByColumn) {
                allItems.push(...workItemsByColumn[col]);
            }
            document.getElementById('total-count').textContent = allItems.length;
        }

        function renderCard(item) {
            const title = item.title || 'Untitled';
            const assignedTo = item.assignedTo;
            const initials = assignedTo ? getInitials(assignedTo.displayName) : '?';

            return \`
                <div class="work-item-card" draggable="true" data-card-id="\${item.id}">
                    <div class="card-header">
                        <span class="codicon codicon-circle-filled"></span>
                        <span class="card-id">#\${item.id}</span>
                    </div>
                    <div class="card-title">\${escapeHtml(title)}</div>
                    <div class="card-footer">
                        <div class="card-avatar">\${initials}</div>
                    </div>
                </div>
            \`;
        }

        function getInitials(name) {
            if (!name) return '?';
            return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function attachEventListeners() {
            document.addEventListener('dragstart', e => {
                const card = e.target.closest('.work-item-card');
                if (card) {
                    card.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', card.dataset.cardId);
                }
            });

            document.addEventListener('dragend', e => {
                const card = e.target.closest('.work-item-card');
                if (card) {
                    card.classList.remove('dragging');
                }
            });

            document.addEventListener('dragover', e => {
                e.preventDefault();
                const columnContent = e.target.closest('.column-content');
                if (columnContent) {
                    e.dataTransfer.dropEffect = 'move';
                    columnContent.closest('.column').classList.add('drag-over');
                }
            });

            document.addEventListener('dragleave', e => {
                const column = e.target.closest('.column');
                if (column && !column.contains(e.relatedTarget)) {
                    column.classList.remove('drag-over');
                }
            });

            document.addEventListener('drop', e => {
                e.preventDefault();
                const columnContent = e.target.closest('.column-content');
                if (!columnContent) return;

                columnContent.closest('.column').classList.remove('drag-over');

                const workItemId = parseInt(e.dataTransfer.getData('text/plain'));
                const targetColumnName = columnContent.dataset.columnName;
                const draggedCard = document.querySelector('[data-card-id="' + workItemId + '"]');
                
                if (!draggedCard) return;

                columnContent.appendChild(draggedCard);

                const targetColumn = columns.find(c => c.name === targetColumnName);
                const targetState = targetColumn?.stateMappings ? Object.values(targetColumn.stateMappings)[0] : targetColumnName;

                vscode.postMessage({
                    command: 'moveWorkItem',
                    workItemId: workItemId,
                    targetColumn: targetColumnName,
                    targetState: targetState
                });
            });

            document.addEventListener('click', e => {
                const card = e.target.closest('.work-item-card');
                if (card) {
                    vscode.postMessage({ 
                        command: 'openWorkItem', 
                        workItemId: parseInt(card.dataset.cardId) 
                    });
                }
            });
        }

        renderBoard();
    </script>
</body>
</html>`;
    }

    public dispose() {
        AzureDevOpsKanbanPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
