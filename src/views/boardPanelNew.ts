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
}

export class BoardPanel {
    public static currentPanel: BoardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private authenticationManager: AuthenticationManager;
    private currentBoard: { columns: BoardColumn[]; workItems: Map<string, BoardWorkItem[]> } | null = null;
    private boardId: string;
    private boardName: string;

    public static createOrShow(
        extensionUri: vscode.Uri,
        authenticationManager: AuthenticationManager,
        boardId: string,
        boardName: string
    ) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (BoardPanel.currentPanel && BoardPanel.currentPanel.boardId === boardId) {
            BoardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'azureDevOpsBoard',
            `Board: ${boardName}`,
            column || vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
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

        this._panel.webview.html = this._getLoadingHtml();
        this._loadAndRender();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openWorkItem':
                        vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', message.workItemId);
                        break;
                    case 'refresh':
                        await this._loadAndRender();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _loadAndRender() {
        try {
            await this._loadBoardData();
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

        const columnsResponse = await axiosInstance.get(
            `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards/${this.boardId}/columns`
        );

        const columns: BoardColumn[] = (columnsResponse.data.value || []).map((col: any) => ({
            id: col.id || col.name,
            name: col.name,
            itemLimit: col.itemLimit || 0,
            stateMappings: col.stateMappings || {}
        }));

        const workItemsMap = new Map<string, BoardWorkItem[]>();

        for (const column of columns) {
            workItemsMap.set(column.name, []);
        }

        for (const column of columns) {
            try {
                const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [Microsoft.VSTS.Common.Priority], [System.Tags]
                              FROM WorkItems
                              WHERE [System.TeamProject] = @project
                              AND [System.BoardColumn] = '${column.name.replace(/'/g, "''")}'
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
                            'fields': 'System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,Microsoft.VSTS.Common.Priority,System.Tags'
                        }
                    });

                    const workItems: BoardWorkItem[] = (detailsResponse.data.value || []).map((item: any) => ({
                        id: item.id,
                        title: item.fields['System.Title'],
                        state: item.fields['System.State'],
                        type: item.fields['System.WorkItemType'],
                        assignedTo: item.fields['System.AssignedTo'],
                        priority: item.fields['Microsoft.VSTS.Common.Priority'],
                        tags: item.fields['System.Tags']
                    }));

                    workItemsMap.set(column.name, workItems);
                }
            } catch (error) {
                console.error(`Failed to load work items for column ${column.name}:`, error);
            }
        }

        this.currentBoard = { columns, workItems: workItemsMap };
    }

    private _getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground);">
<div style="text-align:center;"><div style="width:40px;height:40px;border:3px solid var(--vscode-input-border);border-top-color:var(--vscode-focusBorder);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div><p>Loading board...</p></div>
<style>@keyframes spin{to{transform:rotate(360deg);}}</style>
</body></html>`;
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground);">
<div style="text-align:center;padding:20px;"><div style="font-size:48px;margin-bottom:16px;">⚠️</div><p>${this._escapeHtml(message)}</p></div>
</body></html>`;
    }

    private _getHtmlForWebview(): string {
        if (!this.currentBoard) return this._getErrorHtml('No board data');

        const { columns, workItems } = this.currentBoard;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Board: ${this._escapeHtml(this.boardName)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .board-title { font-size: 16px; font-weight: 600; }
        .btn {
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .board { display: flex; flex: 1; overflow-x: auto; }
        .column {
            flex: 0 0 320px;
            min-width: 320px;
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            background: var(--vscode-sideBar-background);
        }
        .column-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .column-title { font-size: 13px; font-weight: 600; }
        .column-count {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-badge-background);
            padding: 2px 8px;
            border-radius: 10px;
        }
        .column-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 3px solid var(--vscode-focusBorder);
            border-radius: 6px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .card-header { display: flex; align-items: start; gap: 8px; margin-bottom: 8px; }
        .card-id {
            font-family: 'Consolas', monospace;
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
        }
        .card-title { font-size: 13px; flex: 1; line-height: 1.4; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
        .card-meta { display: flex; align-items: center; gap: 8px; }
        .avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--vscode-badge-background);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 600;
            color: var(--vscode-badge-foreground);
        }
        .type-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .priority-dots { display: flex; gap: 2px; }
        .priority-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--vscode-input-border);
        }
        .priority-dot.filled { background: #f59e0b; }
        .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
        .tag {
            font-size: 10px;
            padding: 2px 6px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
        }
        .empty { text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <span class="board-title">${this._escapeHtml(this.boardName)}</span>
        </div>
        <button class="btn" onclick="refresh()">🔄 Refresh</button>
    </div>
    <div class="board">
        ${columns.map(column => {
            const items = workItems.get(column.name) || [];
            return `
            <div class="column">
                <div class="column-header">
                    <span class="column-title">${this._escapeHtml(column.name)}</span>
                    <span class="column-count">${items.length}${column.itemLimit > 0 ? '/' + column.itemLimit : ''}</span>
                </div>
                <div class="column-body">
                    ${items.length === 0 ? '<div class="empty">No items</div>' : ''}
                    ${items.map(item => this._renderCard(item)).join('')}
                </div>
            </div>`;
        }).join('')}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function openWorkItem(id) {
            vscode.postMessage({ command: 'openWorkItem', workItemId: id });
        }
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }

    private _renderCard(item: BoardWorkItem): string {
        const initials = item.assignedTo?.displayName
            ? item.assignedTo.displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            : '?';

        const priorityDots = item.priority
            ? Array(4).fill(0).map((_, i) =>
                `<span class="priority-dot ${i < (5 - (item.priority || 4)) ? 'filled' : ''}"></span>`
              ).join('')
            : '';

        const tags = item.tags
            ? item.tags.split(';').slice(0, 3).map(tag =>
                `<span class="tag">${this._escapeHtml(tag.trim())}</span>`
              ).join('')
            : '';

        return `
        <div class="card" onclick="openWorkItem(${item.id})">
            <div class="card-header">
                <span class="card-id">#${item.id}</span>
                <span class="card-title">${this._escapeHtml(item.title)}</span>
            </div>
            ${tags ? `<div class="tags">${tags}</div>` : ''}
            <div class="card-footer">
                <div class="card-meta">
                    <div class="avatar">${initials}</div>
                    <span class="type-badge">${this._escapeHtml(item.type)}</span>
                    ${priorityDots ? `<div class="priority-dots">${priorityDots}</div>` : ''}
                </div>
            </div>
        </div>`;
    }

    private _escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    public dispose() {
        BoardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
