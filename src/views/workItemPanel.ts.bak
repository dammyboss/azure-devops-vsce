import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem } from '../models/workItem';

export class WorkItemPanel {
    public static currentPanel: WorkItemPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _workItem: WorkItem | null = null;
    private _disposables: vscode.Disposable[] = [];
    private authenticationManager: AuthenticationManager;

    public static createOrShow(
        extensionUri: vscode.Uri,
        authenticationManager: AuthenticationManager,
        workItem: WorkItem
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WorkItemPanel.currentPanel) {
            WorkItemPanel.currentPanel._panel.reveal(column);
            WorkItemPanel.currentPanel.update(workItem);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'workItemDetails',
            `Work Item #${workItem.id}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        WorkItemPanel.currentPanel = new WorkItemPanel(panel, extensionUri, authenticationManager, workItem);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        authenticationManager: AuthenticationManager,
        workItem: WorkItem
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.authenticationManager = authenticationManager;
        this._workItem = workItem;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        await this.saveWorkItem(message.data);
                        break;
                    case 'changeState':
                        await this.changeState(message.state);
                        break;
                    case 'addComment':
                        await this.addComment(message.comment);
                        break;
                    case 'refresh':
                        await this.refreshWorkItem();
                        break;
                    case 'openInBrowser':
                        this.openInBrowser();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public update(workItem: WorkItem) {
        this._workItem = workItem;
        this._panel.title = `Work Item #${workItem.id}`;
        this._update();
    }

    private async saveWorkItem(data: { title: string; description: string; assignedTo?: string; priority?: number }) {
        if (!this._workItem) {
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                return;
            }

            const patchDocument: any[] = [];

            if (data.title !== this._workItem.fields['System.Title']) {
                patchDocument.push({
                    op: 'replace',
                    path: '/fields/System.Title',
                    value: data.title
                });
            }

            if (data.description !== this._workItem.fields['System.Description']) {
                patchDocument.push({
                    op: data.description ? 'replace' : 'remove',
                    path: '/fields/System.Description',
                    value: data.description
                });
            }

            if (patchDocument.length > 0) {
                await axiosInstance.patch(
                    `/_apis/wit/workitems/${this._workItem.id}`,
                    patchDocument,
                    {
                        headers: {
                            'Content-Type': 'application/json-patch+json'
                        }
                    }
                );

                vscode.window.showInformationMessage(`Work item #${this._workItem.id} updated successfully`);
                await this.refreshWorkItem();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save work item: ${error}`);
        }
    }

    private async changeState(newState: string) {
        if (!this._workItem) {
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                return;
            }

            const patchDocument = [
                {
                    op: 'replace',
                    path: '/fields/System.State',
                    value: newState
                }
            ];

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                patchDocument,
                {
                    headers: {
                        'Content-Type': 'application/json-patch+json'
                    }
                }
            );

            vscode.window.showInformationMessage(`Work item state changed to: ${newState}`);
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to change state: ${error}`);
        }
    }

    private async addComment(comment: string) {
        if (!this._workItem || !comment.trim()) {
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                return;
            }

            await axiosInstance.post(
                `/${config.defaultProject}/_apis/wit/workItems/${this._workItem.id}/comments`,
                {
                    text: comment
                }
            );

            vscode.window.showInformationMessage('Comment added successfully');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add comment: ${error}`);
        }
    }

    private async refreshWorkItem() {
        if (!this._workItem) {
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) {
                return;
            }

            const response = await axiosInstance.get(`/_apis/wit/workitems/${this._workItem.id}?$expand=all`);
            this._workItem = response.data;
            this._update();
        } catch (error) {
            console.error('Failed to refresh work item:', error);
        }
    }

    private openInBrowser() {
        if (!this._workItem) {
            return;
        }

        const config = this.authenticationManager.getConfig();
        if (config) {
            const workItemUrl = `${config.organizationUrl}/${config.defaultProject}/_workitems/edit/${this._workItem.id}`;
            vscode.env.openExternal(vscode.Uri.parse(workItemUrl));
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        if (!this._workItem) {
            return '<html><body><p>No work item loaded</p></body></html>';
        }

        const fields = this._workItem.fields;
        const title = this.escapeHtml(fields['System.Title'] || '');
        const description = fields['System.Description'] || '';
        const state = fields['System.State'] || '';
        const type = fields['System.WorkItemType'] || '';
        const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';
        const createdDate = new Date(fields['System.CreatedDate']).toLocaleDateString();
        const changedDate = new Date(fields['System.ChangedDate']).toLocaleDateString();
        const priority = fields['Microsoft.VSTS.Common.Priority'] || 'Not set';
        const iterationPath = fields['System.IterationPath'] || '';
        const areaPath = fields['System.AreaPath'] || '';
        const tags = fields['System.Tags'] || '';

        const stateOptions = ['New', 'Active', 'Resolved', 'Closed', 'Done', 'To Do', 'In Progress'];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Work Item #${this._workItem.id}</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif);
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .work-item-type {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .work-item-id {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }
        .form-group {
            margin-bottom: 16px;
        }
        label {
            display: block;
            margin-bottom: 4px;
            font-weight: 600;
            font-size: 13px;
            color: var(--vscode-foreground);
        }
        input[type="text"], textarea, select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: inherit;
            font-size: 14px;
        }
        input[type="text"]:focus, textarea:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        textarea {
            min-height: 150px;
            resize: vertical;
        }
        .metadata {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 20px;
            padding: 16px;
            background-color: var(--vscode-sideBar-background);
            border-radius: 8px;
        }
        .metadata-item {
            display: flex;
            flex-direction: column;
        }
        .metadata-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .metadata-value {
            font-size: 13px;
            color: var(--vscode-foreground);
        }
        .button-row {
            display: flex;
            gap: 8px;
            margin-top: 20px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        }
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .section {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .section-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        .state-select {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .comment-input {
            display: flex;
            gap: 8px;
            align-items: flex-start;
        }
        .comment-input textarea {
            flex: 1;
            min-height: 80px;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="work-item-type">${this.escapeHtml(type)}</span>
        <span class="work-item-id">#${this._workItem.id}</span>
    </div>

    <div class="form-group">
        <label for="title">Title</label>
        <input type="text" id="title" value="${title}">
    </div>

    <div class="metadata">
        <div class="metadata-item">
            <span class="metadata-label">State</span>
            <span class="metadata-value">${this.escapeHtml(state)}</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Assigned To</span>
            <span class="metadata-value">${this.escapeHtml(assignedTo)}</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Priority</span>
            <span class="metadata-value">${priority}</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Iteration</span>
            <span class="metadata-value">${this.escapeHtml(iterationPath)}</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Area</span>
            <span class="metadata-value">${this.escapeHtml(areaPath)}</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Created</span>
            <span class="metadata-value">${createdDate}</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Modified</span>
            <span class="metadata-value">${changedDate}</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Tags</span>
            <span class="metadata-value">${this.escapeHtml(tags) || 'None'}</span>
        </div>
    </div>

    <div class="form-group">
        <label for="description">Description</label>
        <textarea id="description">${this.escapeHtml(this.stripHtml(description))}</textarea>
    </div>

    <div class="button-row">
        <button class="btn-primary" onclick="saveWorkItem()">Save Changes</button>
        <button class="btn-secondary" onclick="openInBrowser()">Open in Browser</button>
        <button class="btn-secondary" onclick="refresh()">Refresh</button>
    </div>

    <div class="section">
        <div class="section-title">Change State</div>
        <div class="state-select">
            <select id="newState">
                ${stateOptions.map(s => `<option value="${s}" ${s === state ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <button class="btn-secondary" onclick="changeState()">Update State</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Add Comment</div>
        <div class="comment-input">
            <textarea id="comment" placeholder="Write a comment..."></textarea>
            <button class="btn-secondary" onclick="addComment()">Add</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function saveWorkItem() {
            const title = document.getElementById('title').value;
            const description = document.getElementById('description').value;
            vscode.postMessage({
                command: 'save',
                data: { title, description }
            });
        }

        function changeState() {
            const newState = document.getElementById('newState').value;
            vscode.postMessage({
                command: 'changeState',
                state: newState
            });
        }

        function addComment() {
            const comment = document.getElementById('comment').value;
            if (comment.trim()) {
                vscode.postMessage({
                    command: 'addComment',
                    comment: comment
                });
                document.getElementById('comment').value = '';
            }
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function openInBrowser() {
            vscode.postMessage({ command: 'openInBrowser' });
        }
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '');
    }

    public dispose() {
        WorkItemPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
