import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem } from '../models/workItem';

export class WorkItemsListPanel {
    public static currentPanel: WorkItemsListPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private authenticationManager: AuthenticationManager;
    private workItems: WorkItem[] = [];
    private selectedIds: Set<number> = new Set();

    public static createOrShow(
        extensionUri: vscode.Uri,
        authenticationManager: AuthenticationManager
    ) {
        const column = vscode.ViewColumn.One;

        // If we already have a panel, show it
        if (WorkItemsListPanel.currentPanel) {
            WorkItemsListPanel.currentPanel._panel.reveal(column);
            WorkItemsListPanel.currentPanel.refresh();
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'workItemsList',
            'Work Items',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        WorkItemsListPanel.currentPanel = new WorkItemsListPanel(panel, extensionUri, authenticationManager);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        authenticationManager: AuthenticationManager
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.authenticationManager = authenticationManager;

        // Load and render work items
        this._loadAndRender();

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openWorkItem':
                        if (message.id) {
                            vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', message.id);
                        }
                        break;
                    case 'refresh':
                        await this._loadAndRender();
                        break;
                    case 'createWorkItem':
                        vscode.commands.executeCommand('azureDevOps.createWorkItem');
                        break;
                    case 'changeState':
                        if (message.id) {
                            await this._changeWorkItemStateWithPicker(message.id);
                        }
                        break;
                    case 'changeAssignee':
                        if (message.id) {
                            await this._changeWorkItemAssignee(message.id);
                        }
                        break;
                    case 'bulkChangeState':
                        if (message.ids && message.ids.length > 0) {
                            await this._bulkChangeState(message.ids);
                        }
                        break;
                    case 'bulkChangeAssignee':
                        if (message.ids && message.ids.length > 0) {
                            await this._bulkChangeAssignee(message.ids);
                        }
                        break;
                    case 'deleteWorkItems':
                        if (message.ids && message.ids.length > 0) {
                            await this._deleteWorkItems(message.ids);
                        }
                        break;
                    case 'editTitle':
                        if (message.id && message.title) {
                            await this._updateWorkItemTitle(message.id, message.title);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );

        // Clean up when panel is closed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public async refresh() {
        await this._loadAndRender();
    }

    private async _changeWorkItemStateWithPicker(workItemId: number) {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            // Find the work item to get its type
            const workItem = this.workItems.find(wi => wi.id === workItemId);
            if (!workItem) {
                throw new Error('Work item not found');
            }

            const workItemType = workItem.fields['System.WorkItemType'];

            // Get available states for this work item type
            const availableStates = await this._getAvailableStates(workItemType);

            if (availableStates.length === 0) {
                throw new Error('No states available');
            }

            const items = availableStates.map(state => ({
                label: state,
                description: state === workItem.fields['System.State'] ? '(Current)' : ''
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select new state'
            });

            if (!selected) return;

            await axiosInstance.patch(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${workItemId}`,
                [{
                    op: 'replace',
                    path: '/fields/System.State',
                    value: selected.label
                }],
                {
                    params: { 'api-version': '7.1' },
                    headers: { 'Content-Type': 'application/json-patch+json' }
                }
            );

            await this._loadAndRender();
            vscode.window.showInformationMessage(`Updated state for #${workItemId}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to update state: ${error?.message || error}`);
        }
    }

    private async _getAvailableStates(workItemType: string): Promise<string[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return [];

            // Fetch work item type definition to get allowed states
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}`,
                { params: { 'api-version': '7.0' } }
            );

            // Extract states from the workflow
            const states: string[] = [];
            if (response.data.states && Array.isArray(response.data.states)) {
                response.data.states.forEach((stateObj: any) => {
                    if (stateObj.name) {
                        states.push(stateObj.name);
                    }
                });
            }

            return states.length > 0 ? states : ['New', 'Active', 'Resolved', 'Closed'];
        } catch (error) {
            console.error('Failed to load available states:', error);
            // Fallback to common states if API call fails
            return ['New', 'Active', 'Resolved', 'Closed'];
        }
    }

    private async _changeWorkItemAssignee(workItemId: number) {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            // Get team members
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

            await this._loadAndRender();
            vscode.window.showInformationMessage(`Updated assignee for #${workItemId}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to update assignee: ${error?.message || error}`);
        }
    }

    private async _bulkChangeState(workItemIds: number[]) {
        try {
            const states = [...new Set(this.workItems.map(wi => wi.fields['System.State']))];
            const items = states.map(state => ({ label: state }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select new state for ${workItemIds.length} work items`
            });

            if (!selected) return;

            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            // Update all work items
            for (const id of workItemIds) {
                await axiosInstance.patch(
                    `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${id}`,
                    [{
                        op: 'replace',
                        path: '/fields/System.State',
                        value: selected.label
                    }],
                    {
                        params: { 'api-version': '7.1' },
                        headers: { 'Content-Type': 'application/json-patch+json' }
                    }
                );
            }

            await this._loadAndRender();
            vscode.window.showInformationMessage(`Updated state for ${workItemIds.length} work items`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to bulk update state: ${error?.message || error}`);
        }
    }

    private async _bulkChangeAssignee(workItemIds: number[]) {
        try {
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
                placeHolder: `Select assignee for ${workItemIds.length} work items`
            });

            if (!selected) return;

            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            const patchOp = selected.uniqueName
                ? { op: 'replace', path: '/fields/System.AssignedTo', value: selected.uniqueName }
                : { op: 'remove', path: '/fields/System.AssignedTo' };

            // Update all work items
            for (const id of workItemIds) {
                await axiosInstance.patch(
                    `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${id}`,
                    [patchOp],
                    {
                        params: { 'api-version': '7.1' },
                        headers: { 'Content-Type': 'application/json-patch+json' }
                    }
                );
            }

            await this._loadAndRender();
            vscode.window.showInformationMessage(`Updated assignee for ${workItemIds.length} work items`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to bulk update assignee: ${error?.message || error}`);
        }
    }

    private async _deleteWorkItems(workItemIds: number[]) {
        try {
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${workItemIds.length} work item(s)?`,
                { modal: true },
                'Delete'
            );

            if (confirmation !== 'Delete') return;

            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            // Delete all work items
            for (const id of workItemIds) {
                await axiosInstance.delete(
                    `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${id}`,
                    { params: { 'api-version': '7.1' } }
                );
            }

            await this._loadAndRender();
            vscode.window.showInformationMessage(`Deleted ${workItemIds.length} work items`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to delete work items: ${error?.message || error}`);
        }
    }

    private async _updateWorkItemTitle(workItemId: number, newTitle: string) {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                throw new Error('Not connected');
            }

            await axiosInstance.patch(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${workItemId}`,
                [{
                    op: 'replace',
                    path: '/fields/System.Title',
                    value: newTitle
                }],
                {
                    params: { 'api-version': '7.1' },
                    headers: { 'Content-Type': 'application/json-patch+json' }
                }
            );

            await this._loadAndRender();
            vscode.window.showInformationMessage(`Updated title for #${workItemId}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to update title: ${error?.message || error}`);
        }
    }

    private async _getTeamMembers(): Promise<Array<{displayName: string, uniqueName: string}>> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                console.log('Team members: Missing config', { project: config?.defaultProject });
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
                    console.log(`Loaded ${teamMembers.length} team members from default team`);
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
                for (const team of teams.slice(0, 5)) { // Limit to first 5 teams to avoid too many requests
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

    private async _loadAndRender() {
        await this._loadWorkItems();
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private async _loadWorkItems(): Promise<void> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                this.workItems = [];
                return;
            }

            const maxItems = vscode.workspace.getConfiguration('azureDevOps').get<number>('maxWorkItemsToLoad', 200);

            // Build WIQL query
            let wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.AreaPath], [System.Tags], [Microsoft.VSTS.Common.Priority] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC`;

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql }
            );

            const workItemRefs = response.data.workItems || [];
            if (workItemRefs.length === 0) {
                this.workItems = [];
                return;
            }

            // Get detailed work item information
            const workItemIds = workItemRefs.slice(0, maxItems).map((item: any) => item.id).join(',');
            const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: {
                    'ids': workItemIds,
                    'fields': 'System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,System.AreaPath,System.Tags,Microsoft.VSTS.Common.Priority'
                }
            });

            this.workItems = detailsResponse.data.value || [];
        } catch (error: any) {
            console.error('Failed to load work items:', error?.message || error);
            this.workItems = [];
        }
    }

    private _getWorkItemTypeIcon(type: string): string {
        const iconMap: Record<string, string> = {
            'User Story': 'icon_user_story.svg',
            'Feature': 'icon_feature.svg',
            'Epic': 'epic-crown-orange.svg',
            'Task': 'task-clipboard-yellow.svg',
            'Issue': 'issue-clipboard-green.svg',
            'Bug': 'issue-clipboard-green.svg' // Using issue icon for bug
        };

        const iconFile = iconMap[type];
        if (iconFile) {
            const iconUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', iconFile)
            );
            return `<img src="${iconUri}" width="20" height="20" alt="${type}" title="${type}" style="vertical-align: middle;">`;
        }

        return `<span style="font-size: 16px;">📄</span>`;
    }

    private _getHtmlForWebview(): string {
        const nonce = getNonce();

        // Get unique values for filters
        const types = [...new Set(this.workItems.map(wi => wi.fields['System.WorkItemType']))];
        const states = [...new Set(this.workItems.map(wi => wi.fields['System.State']))];
        const assignees = [...new Set(this.workItems.map(wi => wi.fields['System.AssignedTo']?.displayName || 'Unassigned'))];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this._panel.webview.cspSource} https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Work Items</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        /* Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        .toolbar-title {
            font-size: 16px;
            font-weight: 600;
            margin-right: auto;
        }
        .toolbar-btn {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .toolbar-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .toolbar-btn-secondary {
            background: transparent;
            border: 1px solid var(--vscode-panel-border);
        }
        .toolbar-btn-secondary:hover {
            background: var(--vscode-list-hoverBackground);
        }

        /* Filter Bar */
        .filter-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        .filter-input {
            flex: 1;
            max-width: 300px;
            padding: 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 13px;
        }
        .filter-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .filter-dropdown {
            padding: 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
        }

        /* Table Container */
        .table-wrapper {
            flex: 1;
            overflow: auto;
        }
        .table-container {
            min-width: 100%;
            display: table;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: var(--vscode-editor-background);
        }
        thead {
            background: var(--vscode-sideBar-background);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        th {
            padding: 10px 16px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            white-space: nowrap;
        }
        tbody tr {
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
            transition: all 0.15s;
        }
        tbody tr:hover {
            background: var(--vscode-list-hoverBackground);
        }
        tbody tr.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        td {
            padding: 10px 16px;
            font-size: 13px;
        }
        .checkbox-cell {
            width: 40px;
            text-align: center;
        }
        .work-item-id {
            font-family: 'Consolas', monospace;
            color: var(--vscode-textLink-foreground);
            font-weight: 600;
        }
        .type-icon {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        .state-pill {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }
        .state-to-do { background: #0078d414; color: #0078d4; }
        .state-doing { background: #ffa50014; color: #ffa500; }
        .state-done { background: #107c1014; color: #107c10; }
        .assignee-cell {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            font-size: 10px;
            font-weight: 600;
        }
        .tags {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }
        .tag {
            padding: 2px 8px;
            background: rgba(33, 150, 243, 0.2);
            color: #2196f3;
            border-radius: 10px;
            font-size: 10px;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-icon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        .cell-actions {
            opacity: 0;
            transition: opacity 0.2s;
        }
        tr:hover .cell-actions {
            opacity: 1;
        }
        .action-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
        }
        .action-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-title">Work items</div>
        <div id="bulkActions" style="display: none; margin-left: auto; margin-right: 12px; display: flex; gap: 8px;">
            <button class="toolbar-btn-secondary toolbar-btn" onclick="bulkChangeState()">
                <span>Change State</span>
            </button>
            <button class="toolbar-btn-secondary toolbar-btn" onclick="bulkChangeAssignee()">
                <span>Change Assignee</span>
            </button>
            <button class="toolbar-btn-secondary toolbar-btn" onclick="bulkDelete()" style="color: #f48771;">
                <span>Delete</span>
            </button>
        </div>
        <button class="toolbar-btn-secondary toolbar-btn" onclick="refresh()" style="${this.workItems.length === 0 ? 'margin-left: auto;' : ''}">
            <span>🔄</span>
            <span>Refresh</span>
        </button>
        <button class="toolbar-btn" onclick="createWorkItem()">
            <span>+</span>
            <span>New Work Item</span>
        </button>
    </div>

    <div class="filter-bar">
        <input
            type="text"
            id="keywordFilter"
            class="filter-input"
            placeholder="Filter by keyword"
            oninput="applyFilters()"
        >
        <select id="typeFilter" class="filter-dropdown" onchange="applyFilters()">
            <option value="">All Types</option>
            ${types.map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('')}
        </select>
        <select id="stateFilter" class="filter-dropdown" onchange="applyFilters()">
            <option value="">All States</option>
            ${states.map(s => `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`).join('')}
        </select>
        <select id="assigneeFilter" class="filter-dropdown" onchange="applyFilters()">
            <option value="">All Assignees</option>
            ${assignees.map(a => `<option value="${this.escapeHtml(a)}">${this.escapeHtml(a)}</option>`).join('')}
        </select>
    </div>

    <div class="table-wrapper">
        ${this.workItems.length > 0 ? `
        <div class="table-container">
            <table id="workItemsTable">
                <thead>
                    <tr>
                        <th class="checkbox-cell"><input type="checkbox" id="selectAllCheckbox" onchange="toggleAll(this.checked)"></th>
                        <th style="width: 80px;">ID</th>
                        <th style="width: 50px;"></th>
                        <th style="min-width: 300px;">Title</th>
                        <th style="width: 120px;">State</th>
                        <th style="width: 180px;">Assigned To</th>
                        <th style="width: 200px;">Area Path</th>
                        <th style="width: 200px;">Tags</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.workItems.map(wi => {
                        const fields = wi.fields;
                        const id = wi.id;
                        const title = fields['System.Title'] || '';
                        const type = fields['System.WorkItemType'] || '';
                        const state = fields['System.State'] || '';
                        const assignedTo = fields['System.AssignedTo'];
                        const areaPath = fields['System.AreaPath'] || '';
                        const tags = fields['System.Tags'] || '';

                        const stateClass = state.toLowerCase().replace(/\s+/g, '-');
                        const icon = this._getWorkItemTypeIcon(type);
                        const initials = assignedTo?.displayName?.split(' ').map((n: string) => n[0]).join('').substring(0, 2) || '?';

                        return `
                            <tr data-id="${id}" data-type="${this.escapeHtml(type)}" data-state="${this.escapeHtml(state)}" data-assignee="${this.escapeHtml(assignedTo?.displayName || 'Unassigned')}">
                                <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" onclick="event.stopPropagation()" onchange="toggleRow(${id}, this.checked)"></td>
                                <td onclick="openWorkItem(${id})"><span class="work-item-id">#${id}</span></td>
                                <td onclick="openWorkItem(${id})" style="text-align: center;">${icon}</td>
                                <td ondblclick="editTitle(${id}, this)">
                                    <strong>${this.escapeHtml(title)}</strong>
                                </td>
                                <td>
                                    <span class="state-pill state-${stateClass}">${this.escapeHtml(state)}</span>
                                    <button class="action-btn cell-actions" onclick="event.stopPropagation(); changeState(${id})">⋯</button>
                                </td>
                                <td>
                                    <div class="assignee-cell">
                                        <div class="avatar">${initials}</div>
                                        <span>${this.escapeHtml(assignedTo?.displayName || 'Unassigned')}</span>
                                        <button class="action-btn cell-actions" onclick="event.stopPropagation(); changeAssignee(${id})">⋯</button>
                                    </div>
                                </td>
                                <td onclick="openWorkItem(${id})">${this.escapeHtml(areaPath)}</td>
                                <td onclick="openWorkItem(${id})">
                                    <div class="tags">
                                        ${tags ? tags.split(';').map(tag => `<span class="tag">${this.escapeHtml(tag.trim())}</span>`).join('') : ''}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ` : `
        <div class="empty-state">
            <div class="empty-icon">📋</div>
            <div>No work items found</div>
        </div>
        `}
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let selectedIds = new Set();

        function openWorkItem(id) {
            vscode.postMessage({ command: 'openWorkItem', id: id });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function createWorkItem() {
            vscode.postMessage({ command: 'createWorkItem' });
        }

        function changeState(id) {
            vscode.postMessage({ command: 'changeState', id: id });
        }

        function changeAssignee(id) {
            vscode.postMessage({ command: 'changeAssignee', id: id });
        }

        function toggleRow(id, checked) {
            if (checked) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
            updateBulkActionsVisibility();
        }

        function toggleAll(checked) {
            const checkboxes = document.querySelectorAll('.row-checkbox');
            const visibleCheckboxes = Array.from(checkboxes).filter(cb => {
                const row = cb.closest('tr');
                return row.style.display !== 'none';
            });

            visibleCheckboxes.forEach(cb => {
                cb.checked = checked;
                const row = cb.closest('tr');
                const id = parseInt(row.dataset.id);
                if (checked) {
                    selectedIds.add(id);
                } else {
                    selectedIds.delete(id);
                }
            });
            updateBulkActionsVisibility();
        }

        function updateBulkActionsVisibility() {
            const bulkActions = document.getElementById('bulkActions');
            if (selectedIds.size > 0) {
                bulkActions.style.display = 'flex';
            } else {
                bulkActions.style.display = 'none';
            }
        }

        function bulkChangeState() {
            if (selectedIds.size === 0) return;
            vscode.postMessage({
                command: 'bulkChangeState',
                ids: Array.from(selectedIds)
            });
        }

        function bulkChangeAssignee() {
            if (selectedIds.size === 0) return;
            vscode.postMessage({
                command: 'bulkChangeAssignee',
                ids: Array.from(selectedIds)
            });
        }

        function bulkDelete() {
            if (selectedIds.size === 0) return;
            vscode.postMessage({
                command: 'deleteWorkItems',
                ids: Array.from(selectedIds)
            });
        }

        function editTitle(id, cell) {
            const strong = cell.querySelector('strong');
            const currentTitle = strong.textContent.trim();

            // Create input
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentTitle;
            input.style.width = '100%';
            input.style.padding = '4px';
            input.style.fontSize = '13px';
            input.style.border = '1px solid var(--vscode-input-border)';
            input.style.background = 'var(--vscode-input-background)';
            input.style.color = 'var(--vscode-input-foreground)';
            input.style.borderRadius = '3px';

            // Replace content
            strong.style.display = 'none';
            cell.appendChild(input);
            input.focus();
            input.select();

            const saveEdit = () => {
                const newTitle = input.value.trim();
                if (newTitle && newTitle !== currentTitle) {
                    vscode.postMessage({
                        command: 'editTitle',
                        id: id,
                        title: newTitle
                    });
                }
                input.remove();
                strong.style.display = '';
            };

            const cancelEdit = () => {
                input.remove();
                strong.style.display = '';
            };

            input.addEventListener('blur', saveEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEdit();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                }
            });
        }

        // Combined filtering function
        function applyFilters() {
            const keyword = document.getElementById('keywordFilter').value.toLowerCase();
            const typeFilter = document.getElementById('typeFilter').value;
            const stateFilter = document.getElementById('stateFilter').value;
            const assigneeFilter = document.getElementById('assigneeFilter').value;

            const rows = document.querySelectorAll('#workItemsTable tbody tr');
            let visibleCount = 0;

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                const type = row.dataset.type;
                const state = row.dataset.state;
                const assignee = row.dataset.assignee;

                const matchesKeyword = !keyword || text.includes(keyword);
                const matchesType = !typeFilter || type === typeFilter;
                const matchesState = !stateFilter || state === stateFilter;
                const matchesAssignee = !assigneeFilter || assignee === assigneeFilter;

                if (matchesKeyword && matchesType && matchesState && matchesAssignee) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            // Update "select all" checkbox state
            updateSelectAllCheckbox();
        }

        function updateSelectAllCheckbox() {
            const allCheckbox = document.getElementById('selectAllCheckbox');
            const checkboxes = Array.from(document.querySelectorAll('.row-checkbox'));
            const visibleCheckboxes = checkboxes.filter(cb => {
                const row = cb.closest('tr');
                return row.style.display !== 'none';
            });

            if (visibleCheckboxes.length === 0) {
                allCheckbox.checked = false;
                allCheckbox.indeterminate = false;
                return;
            }

            const checkedVisible = visibleCheckboxes.filter(cb => cb.checked).length;

            if (checkedVisible === 0) {
                allCheckbox.checked = false;
                allCheckbox.indeterminate = false;
            } else if (checkedVisible === visibleCheckboxes.length) {
                allCheckbox.checked = true;
                allCheckbox.indeterminate = false;
            } else {
                allCheckbox.checked = false;
                allCheckbox.indeterminate = true;
            }
        }
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    public dispose() {
        WorkItemsListPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
