import * as vscode from 'vscode';
import { WorkItem } from '../models/workItem';

export class KanbanBoardPanel {
    public static currentPanel: KanbanBoardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel, 
        private workItems: WorkItem[], 
        private columns: any[],
        private boardName: string
    ) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlContent();
        
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    public static show(workItems: WorkItem[], columns: any[], boardName: string) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (KanbanBoardPanel.currentPanel) {
            KanbanBoardPanel.currentPanel._panel.reveal(column);
            KanbanBoardPanel.currentPanel.updateBoard(workItems, columns, boardName);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'kanbanBoard',
            `Kanban: ${boardName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        KanbanBoardPanel.currentPanel = new KanbanBoardPanel(panel, workItems, columns, boardName);
    }

    public updateBoard(workItems: WorkItem[], columns: any[], boardName: string) {
        this.workItems = workItems;
        this.columns = columns;
        this.boardName = boardName;
        this._panel.title = `Kanban: ${boardName}`;
        this._panel.webview.postMessage({ type: 'updateBoard', workItems, columns });
    }



    private _handleMessage(message: any) {
        switch (message.type) {
            case 'moveTask':
                this._handleMoveTask(message.taskId, message.newStatus);
                break;
            case 'openWorkItem':
                vscode.commands.executeCommand('azureDevOps.openWorkItem', message.id);
                break;
        }
    }

    private _handleMoveTask(taskId: number, newStatus: string) {
        vscode.window.showInformationMessage(`Moving task ${taskId} to ${newStatus}`);
    }

    private _getHtmlContent(): string {
        const workItemsJson = JSON.stringify(this.workItems);
        const columnsJson = JSON.stringify(this.columns);
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kanban Board</title>
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
            transition: flex-basis 200ms ease;
        }

        .column.collapsed {
            flex: 0 0 48px;
        }

        .column-header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            cursor: pointer;
            user-select: none;
        }

        .column-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .column.collapsed .column-header {
            border-bottom: none;
        }

        .column-title {
            font-weight: 600;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .collapse-icon {
            font-size: 12px;
            transition: transform 200ms ease;
        }

        .column.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }

        .wip-indicator {
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .column-content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .column.collapsed .column-content {
            display: none;
        }

        .column-content.drag-over {
            background: var(--vscode-list-hoverBackground);
        }

        .task-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 3px solid var(--vscode-focusBorder);
            border-radius: 4px;
            padding: 12px;
            cursor: pointer;
        }

        .task-card:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transform: translateY(-1px);
        }

        .task-card.dragging {
            opacity: 0.5;
        }

        .task-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .task-id {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .task-type {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 500;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .task-title {
            font-size: 13px;
            margin-bottom: 8px;
            line-height: 1.4;
        }

        .task-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 8px;
        }

        .avatar {
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

        .empty-state {
            text-align: center;
            padding: 32px 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
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
            <div class="board-columns" id="board-content"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let workItems = ${workItemsJson};
        let columns = ${columnsJson};

        function getColumnForState(state) {
            for (const col of columns) {
                if (col.stateMappings && col.stateMappings.includes(state)) {
                    return col.id;
                }
            }
            return columns[0]?.id || 'default';
        }

        function getInitials(name) {
            if (!name) return '?';
            return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }

        function getPriorityClass(priority) {
            if (!priority) return 'priority-medium';
            const p = priority.toString().toLowerCase();
            if (p.includes('1') || p.includes('high')) return 'priority-high';
            if (p.includes('3') || p.includes('low')) return 'priority-low';
            return 'priority-medium';
        }

        function getPriorityLabel(priority) {
            if (!priority) return 'Medium';
            const p = priority.toString().toLowerCase();
            if (p.includes('1') || p.includes('high')) return 'High';
            if (p.includes('3') || p.includes('low')) return 'Low';
            return 'Medium';
        }

        function renderBoard() {
            const boardContent = document.getElementById('board-content');
            boardContent.innerHTML = '';

            const columnData = {};
            columns.forEach(col => {
                columnData[col.id] = [];
            });

            workItems.forEach(item => {
                const colId = getColumnForState(item.state);
                columnData[colId].push(item);
            });

            columns.forEach(col => {
                const items = columnData[col.id];
                const columnEl = document.createElement('div');
                columnEl.className = 'column';
                columnEl.dataset.columnId = col.id;

                columnEl.innerHTML = \`
                    <div class="column-header" data-column-id="\${col.id}">
                        <span class="column-title">
                            <span class="codicon codicon-chevron-down collapse-icon"></span>
                            \${col.title}
                        </span>
                        <span class="wip-indicator">\${items.length}</span>
                    </div>
                    <div class="column-content" data-column="\${col.id}">
                        \${items.length === 0 ? '<div class="empty-state">No items</div>' : ''}
                        \${items.map(item => renderTaskCard(item)).join('')}
                    </div>
                \`;

                boardContent.appendChild(columnEl);
            });

            updateStats();
            attachEventListeners();
        }

        function renderTaskCard(item) {
            const typeClass = item.type.toLowerCase().replace(' ', '-');
            const assignee = item.assignedTo?.displayName || 'Unassigned';
            const priority = item.priority || 2;

            return \`
                <div class="task-card" draggable="true" data-id="\${item.id}">
                    <div class="task-header">
                        <span class="task-id">#\${item.id}</span>
                        <span class="task-type \${typeClass}">\${item.type}</span>
                    </div>
                    <div class="task-title">\${item.title}</div>
                    <div class="task-footer">
                        <div class="task-assignee">
                            <div class="avatar">\${getInitials(assignee)}</div>
                            <span>\${assignee.split(' ')[0]}</span>
                        </div>
                        <span class="task-priority \${getPriorityClass(priority)}">
                            \${getPriorityLabel(priority)}
                        </span>
                    </div>
                </div>
            \`;
        }

        function updateStats() {
            const totalCount = document.getElementById('total-count');
            if (totalCount) {
                totalCount.textContent = workItems.length;
            }
        }

        function attachEventListeners() {
            document.querySelectorAll('.column-header').forEach(header => {
                header.addEventListener('click', () => {
                    header.closest('.column').classList.toggle('collapsed');
                });
            });

            document.addEventListener('dragstart', e => {
                const card = e.target.closest('.task-card');
                if (card) {
                    card.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', card.dataset.id);
                }
            });

            document.addEventListener('dragend', e => {
                const card = e.target.closest('.task-card');
                if (card) {
                    card.classList.remove('dragging');
                }
            });

            document.addEventListener('dragover', e => {
                e.preventDefault();
                const columnContent = e.target.closest('.column-content');
                if (columnContent) {
                    e.dataTransfer.dropEffect = 'move';
                    columnContent.classList.add('drag-over');
                }
            });

            document.addEventListener('dragleave', e => {
                const columnContent = e.target.closest('.column-content');
                if (columnContent && !columnContent.contains(e.relatedTarget)) {
                    columnContent.classList.remove('drag-over');
                }
            });

            document.addEventListener('drop', e => {
                e.preventDefault();
                const columnContent = e.target.closest('.column-content');
                if (!columnContent) return;

                columnContent.classList.remove('drag-over');

                const taskId = parseInt(e.dataTransfer.getData('text/plain'));
                const draggedCard = document.querySelector('[data-id="' + taskId + '"]');
                
                if (!draggedCard) return;

                columnContent.appendChild(draggedCard);

                const newStatus = columns.find(c => c.id === columnContent.dataset.column)?.states[0];
                
                if (newStatus) {
                    vscode.postMessage({
                        type: 'moveTask',
                        taskId: taskId,
                        newStatus
                    });
                }
            });

            document.addEventListener('click', e => {
                const card = e.target.closest('.task-card');
                if (card && !e.target.closest('.column-header')) {
                    vscode.postMessage({
                        type: 'openWorkItem',
                        id: parseInt(card.dataset.id)
                    });
                }
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'updateBoard') {
                workItems = message.workItems;
                columns = message.columns;
                renderBoard();
            }
        });

        renderBoard();
    </script>
</body>
</html>`;
    }

    public dispose() {
        KanbanBoardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
