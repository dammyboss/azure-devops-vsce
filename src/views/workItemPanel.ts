import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem } from '../models/workItem';

export class WorkItemPanel {
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

        // Always create new panel for each work item
        const panel = vscode.window.createWebviewPanel(
            `workItemDetails-${workItem.id}`,
            `#${workItem.id}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        new WorkItemPanel(panel, extensionUri, authenticationManager, workItem);
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
                    case 'assignToMe':
                        await this.assignToMe();
                        break;
                    case 'openLinkedItem':
                        if (message.id) {
                            vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', message.id);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public update(workItem: WorkItem) {
        this._workItem = workItem;
        this._panel.title = `#${workItem.id}`;
        this._update();
    }

    private async saveWorkItem(data: { title: string; description: string }) {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

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
                    { headers: { 'Content-Type': 'application/json-patch+json' } }
                );

                vscode.window.showInformationMessage(`✓ Saved`);
                await this.refreshWorkItem();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save: ${error}`);
        }
    }

    private async changeState(newState: string) {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [{ op: 'replace', path: '/fields/System.State', value: newState }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            vscode.window.showInformationMessage(`State changed to ${newState}`);
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to change state: ${error}`);
        }
    }

    private async assignToMe() {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const currentUser = await this.authenticationManager.getCurrentUser();
            if (!currentUser?.uniqueName) return;

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [{ op: 'replace', path: '/fields/System.AssignedTo', value: currentUser.uniqueName }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            vscode.window.showInformationMessage('Assigned to you');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to assign: ${error}`);
        }
    }

    private async addComment(comment: string) {
        if (!this._workItem || !comment.trim()) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return;

            await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${this._workItem.id}/comments`,
                { text: comment },
                { params: { 'api-version': '7.0-preview.3' } }
            );

            vscode.window.showInformationMessage('Comment added');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add comment: ${error}`);
        }
    }

    private async refreshWorkItem() {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const response = await axiosInstance.get(`/_apis/wit/workitems/${this._workItem.id}`, {
                params: { '$expand': 'all', 'api-version': '7.0' }
            });
            this._workItem = response.data;
            this._update();
        } catch (error) {
            console.error('Failed to refresh:', error);
        }
    }

    private openInBrowser() {
        if (!this._workItem) return;

        const config = this.authenticationManager.getConfig();
        if (config) {
            const url = `${config.organizationUrl}/${config.defaultProject}/_workitems/edit/${this._workItem.id}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    private _update() {
        Promise.all([
            this.getComments(),
            this.getLinkedItems()
        ]).then(([comments, linkedItems]) => {
            this._panel.webview.html = this._getHtmlForWebview(comments, linkedItems);
        });
    }

    private async getLinkedItems(): Promise<any[]> {
        if (!this._workItem) return [];

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return [];

            const response = await axiosInstance.get(`/_apis/wit/workitems/${this._workItem.id}`, {
                params: { '$expand': 'relations', 'api-version': '7.0' }
            });

            const relations = response.data.relations || [];
            const linkedItems: any[] = [];

            for (const relation of relations) {
                if (relation.rel && relation.url && relation.url.includes('workItems')) {
                    const linkedIdMatch = relation.url.match(/workItems\/(\d+)/);
                    if (linkedIdMatch) {
                        const linkedId = parseInt(linkedIdMatch[1]);
                        try {
                            const linkedResponse = await axiosInstance.get(`/_apis/wit/workitems/${linkedId}`, {
                                params: { 'api-version': '7.0' }
                            });
                            linkedItems.push({
                                id: linkedId,
                                title: linkedResponse.data.fields['System.Title'],
                                state: linkedResponse.data.fields['System.State'],
                                type: linkedResponse.data.fields['System.WorkItemType'],
                                linkType: this.getLinkTypeName(relation.rel)
                            });
                        } catch (e) {
                            // Skip if can't fetch
                        }
                    }
                }
            }

            return linkedItems;
        } catch (error) {
            return [];
        }
    }

    private getLinkTypeName(rel: string): string {
        const map: Record<string, string> = {
            'System.LinkTypes.Hierarchy-Reverse': 'Parent',
            'System.LinkTypes.Hierarchy-Forward': 'Child',
            'System.LinkTypes.Related': 'Related',
            'System.LinkTypes.Dependency-Reverse': 'Predecessor',
            'System.LinkTypes.Dependency-Forward': 'Successor'
        };
        return map[rel] || 'Related';
    }

    private async getComments(): Promise<any[]> {
        if (!this._workItem) return [];

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();
            
            if (!axiosInstance || !config?.defaultProject) return [];

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${this._workItem.id}/comments`,
                { params: { 'api-version': '7.0-preview.3' } }
            );
            
            return response.data.comments || [];
        } catch (error) {
            return [];
        }
    }

    private _getHtmlForWebview(comments: any[] = [], linkedItems: any[] = []): string {
        if (!this._workItem) return '<html><body><p>No work item loaded</p></body></html>';

        const fields = this._workItem.fields;
        const title = this.escapeHtml(fields['System.Title'] || '');
        const description = fields['System.Description'] || '';
        const state = fields['System.State'] || '';
        const type = fields['System.WorkItemType'] || '';
        const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';
        const createdDate = new Date(fields['System.CreatedDate']).toLocaleDateString();
        const changedDate = new Date(fields['System.ChangedDate']).toLocaleDateString();
        const priority = fields['Microsoft.VSTS.Common.Priority'] || '';
        const iterationPath = fields['System.IterationPath']?.split('\\').pop() || '';
        const areaPath = fields['System.AreaPath']?.split('\\').pop() || '';
        const tags = fields['System.Tags'] || '';

        const stateOptions = ['New', 'To Do', 'Active', 'In Progress', 'Resolved', 'Done', 'Closed'];
        
        const getStateColor = (state: string) => {
            const map: Record<string, string> = {
                'New': '#0078d4', 'To Do': '#0078d4',
                'Active': '#ffa500', 'In Progress': '#ffa500',
                'Resolved': '#8b8b00',
                'Done': '#107c10', 'Closed': '#107c10',
                'Removed': '#d13438'
            };
            return map[state] || '#8b8b8b';
        };

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>#${this._workItem.id}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.6;
            padding: 0;
        }
        .container { max-width: 1000px; margin: 0 auto; padding: 24px; }
        
        /* HEADER */
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 20px;
            background: var(--vscode-sideBar-background);
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 3px solid ${getStateColor(state)};
        }
        .type-badge {
            padding: 4px 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .work-item-id {
            font-family: 'Consolas', monospace;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            font-weight: 600;
        }
        .title-display {
            flex: 1;
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .state-pill {
            padding: 6px 14px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 600;
            color: white;
            background: ${getStateColor(state)};
            cursor: pointer;
            transition: all 0.2s;
        }
        .state-pill:hover { opacity: 0.85; transform: scale(1.05); }
        .quick-actions {
            display: flex;
            gap: 8px;
        }
        .btn-icon {
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .btn-icon:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
        }

        /* CARDS */
        .card {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 16px;
        }
        .card-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
        }

        /* DETAILS CARD */
        .details-card { background: var(--vscode-editor-background); }
        .form-group { margin-bottom: 16px; }
        label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        input[type="text"], textarea {
            width: 100%;
            padding: 10px 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
            transition: all 0.2s;
        }
        input[type="text"]:focus, textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }
        textarea { min-height: 120px; resize: vertical; }

        /* METADATA GRID */
        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
        }
        .meta-item {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .meta-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--vscode-descriptionForeground);
        }
        .meta-value {
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        .priority-dots {
            display: flex;
            gap: 4px;
            align-items: center;
        }
        .priority-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-input-border);
        }
        .priority-dot.filled { background: #ffa500; }
        .tag-chip {
            display: inline-block;
            padding: 3px 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
            margin-right: 4px;
        }

        /* ACTION BAR */
        .action-bar {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-top: 16px;
        }
        .btn-primary {
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .btn-secondary {
            padding: 10px 20px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
        }

        /* STATE PILLS */
        .state-pills {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .state-option {
            padding: 8px 16px;
            border: 2px solid var(--vscode-input-border);
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            background: transparent;
            color: var(--vscode-foreground);
        }
        .state-option:hover {
            border-color: var(--vscode-focusBorder);
            transform: scale(1.05);
        }
        .state-option.active {
            background: ${getStateColor(state)};
            border-color: ${getStateColor(state)};
            color: white;
        }

        /* COMMENTS */
        .comment-input-area {
            display: flex;
            gap: 12px;
            align-items: flex-start;
        }
        .comment-input-area textarea {
            flex: 1;
            min-height: 80px;
        }
        .timeline {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-top: 16px;
        }
        .timeline-item {
            display: flex;
            gap: 12px;
            padding: 12px;
            background: var(--vscode-editor-background);
            border-radius: 6px;
            border-left: 3px solid var(--vscode-focusBorder);
        }
        .timeline-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: var(--vscode-badge-background);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            flex-shrink: 0;
        }
        .timeline-content { flex: 1; }
        .timeline-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
        }
        .timeline-author {
            font-weight: 600;
            font-size: 13px;
        }
        .timeline-date {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .timeline-text {
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
        }
        .linked-items {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .link-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .link-group-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        .linked-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            background: var(--vscode-editor-background);
            border-radius: 6px;
            border-left: 3px solid var(--vscode-focusBorder);
            cursor: pointer;
            transition: all 0.2s;
        }
        .linked-item:hover {
            background: var(--vscode-list-hoverBackground);
            transform: translateX(4px);
        }
        .linked-item-id {
            font-family: 'Consolas', monospace;
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
        }
        .linked-item-title {
            flex: 1;
            font-size: 13px;
            color: var(--vscode-foreground);
        }
        .linked-item-state {
            padding: 3px 10px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="type-badge">${this.escapeHtml(type)}</span>
            <span class="work-item-id">#${this._workItem.id}</span>
            <span class="title-display">${title}</span>
            <span class="state-pill" onclick="scrollToState()">${this.escapeHtml(state)}</span>
            <div class="quick-actions">
                ${assignedTo === 'Unassigned' ? '<button class="btn-icon" onclick="assignToMe()">Assign to me</button>' : ''}
                <button class="btn-icon" onclick="openInBrowser()">⋯</button>
            </div>
        </div>

        <div class="card details-card">
            <div class="card-title">Details</div>
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="title" value="${title}">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="description" placeholder="Add a clear description, acceptance criteria, or notes...">${this.escapeHtml(this.stripHtml(description))}</textarea>
            </div>
            <div class="action-bar">
                <button class="btn-primary" onclick="saveWorkItem()">💾 Save Changes</button>
                <button class="btn-secondary" onclick="openInBrowser()">🌐 Open in Browser</button>
                <button class="btn-secondary" onclick="refresh()">🔄 Refresh</button>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Metadata</div>
            <div class="metadata-grid">
                <div class="meta-item">
                    <span class="meta-label">Assigned To</span>
                    <span class="meta-value">${this.escapeHtml(assignedTo)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Priority</span>
                    <span class="meta-value">${priority || 'Not set'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">State</span>
                    <span class="meta-value">${this.escapeHtml(state)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Sprint</span>
                    <span class="meta-value">${this.escapeHtml(iterationPath || 'None')}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Area</span>
                    <span class="meta-value">${this.escapeHtml(areaPath || 'None')}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Created</span>
                    <span class="meta-value">${createdDate}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Modified</span>
                    <span class="meta-value">${changedDate}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Tags</span>
                    <div>${tags ? tags.split(';').map(t => `<span class="tag-chip">${this.escapeHtml(t.trim())}</span>`).join('') : '<span class="meta-value">None</span>'}</div>
                </div>
            </div>
        </div>

        ${linkedItems.length > 0 ? `
        <div class="card">
            <div class="card-title">🔗 Linked Work Items (${linkedItems.length})</div>
            <div class="linked-items">
                ${Object.entries(linkedItems.reduce((groups: any, item: any) => {
                    if (!groups[item.linkType]) groups[item.linkType] = [];
                    groups[item.linkType].push(item);
                    return groups;
                }, {})).map(([linkType, items]: [string, any]) => `
                    <div class="link-group">
                        <div class="link-group-title">${linkType} (${items.length})</div>
                        ${items.map((item: any) => `
                            <div class="linked-item" onclick="openLinkedItem(${item.id})">
                                <span class="linked-item-id">#${item.id}</span>
                                <span class="linked-item-title">${this.escapeHtml(item.title)}</span>
                                <span class="linked-item-state" style="background: ${this.getStateColorForLinked(item.state)}">${this.escapeHtml(item.state)}</span>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <div class="card" id="stateSection">
            <div class="card-title">Change State</div>
            <div class="state-pills">
                ${stateOptions.map(s => `<button class="state-option ${s === state ? 'active' : ''}" onclick="changeState('${s}')">${s}</button>`).join('')}
            </div>
        </div>

        <div class="card">
            <div class="card-title">💬 Add Comment</div>
            <div class="comment-input-area">
                <textarea id="comment" placeholder="Write an update... (Markdown supported)"></textarea>
                <button class="btn-secondary" onclick="addComment()">Add</button>
            </div>
        </div>

        ${comments.length > 0 ? `
        <div class="card">
            <div class="card-title">Activity (${comments.length})</div>
            <div class="timeline">
                ${comments.map(c => `
                    <div class="timeline-item">
                        <div class="timeline-icon">💬</div>
                        <div class="timeline-content">
                            <div class="timeline-header">
                                <span class="timeline-author">${this.escapeHtml(c.createdBy?.displayName || 'Unknown')}</span>
                                <span class="timeline-date">${this.formatRelativeTime(c.createdDate)}</span>
                            </div>
                            <div class="timeline-text">${this.escapeHtml(this.decodeHtml(this.stripHtml(c.text || '')))}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function saveWorkItem() {
            const title = document.getElementById('title').value;
            const description = document.getElementById('description').value;
            vscode.postMessage({ command: 'save', data: { title, description } });
        }

        function changeState(state) {
            vscode.postMessage({ command: 'changeState', state });
        }

        function addComment() {
            const comment = document.getElementById('comment').value;
            if (comment.trim()) {
                vscode.postMessage({ command: 'addComment', comment });
                document.getElementById('comment').value = '';
            }
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function openInBrowser() {
            vscode.postMessage({ command: 'openInBrowser' });
        }

        function assignToMe() {
            vscode.postMessage({ command: 'assignToMe' });
        }

        function scrollToState() {
            document.getElementById('stateSection').scrollIntoView({ behavior: 'smooth' });
        }

        function openLinkedItem(id) {
            vscode.postMessage({ command: 'openLinkedItem', id });
        }
    </script>
</body>
</html>`;
    }

    private formatRelativeTime(dateStr: string): string {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        
        if (hours < 1) return 'just now';
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '');
    }

    private decodeHtml(html: string): string {
        const map: Record<string, string> = {
            '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#039;': "'", '&nbsp;': ' '
        };
        return html.replace(/&[^;]+;/g, entity => map[entity] || entity);
    }

    private getStateColorForLinked(state: string): string {
        const map: Record<string, string> = {
            'New': '#0078d4', 'To Do': '#0078d4',
            'Active': '#ffa500', 'In Progress': '#ffa500',
            'Resolved': '#8b8b00',
            'Done': '#107c10', 'Closed': '#107c10',
            'Removed': '#d13438'
        };
        return map[state] || '#8b8b8b';
    }

    public dispose() {
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
