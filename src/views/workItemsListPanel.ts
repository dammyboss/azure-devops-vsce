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
                `/_apis/wit/workitems/${workItemId}`,
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
                `/_apis/wit/workitems/${workItemId}`,
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
                    `/_apis/wit/workitems/${id}`,
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
                    `/_apis/wit/workitems/${id}`,
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
                    `/_apis/wit/workitems/${id}`,
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
                `/_apis/wit/workitems/${workItemId}`,
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
        const areas = [...new Set(this.workItems.map(wi => wi.fields['System.AreaPath'] || '').filter(a => a))];
        const allTags = this.workItems.flatMap(wi => (wi.fields['System.Tags'] || '').split(';').map((t: string) => t.trim()).filter((t: string) => t));
        const tags = [...new Set(allTags)];

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
            left: 0;
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
            width: 16px;
            height: 16px;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            border: 1.5px solid var(--vscode-foreground, #cccccc);
            border-radius: 3px;
            background: var(--vscode-checkbox-background, transparent);
            position: relative;
            vertical-align: middle;
            flex-shrink: 0;
        }

        .filter-checkbox-item input[type="checkbox"]:hover {
            border-color: var(--vscode-focusBorder, #007acc);
        }

        .filter-checkbox-item input[type="checkbox"]:checked {
            background: var(--vscode-button-background, #0e639c);
            border-color: var(--vscode-button-background, #0e639c);
        }

        .filter-checkbox-item input[type="checkbox"]:checked::after {
            content: '';
            position: absolute;
            left: 4px;
            top: 1px;
            width: 5px;
            height: 9px;
            border: solid var(--vscode-button-foreground, #ffffff);
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
        }

        .filter-checkbox-item input[type="checkbox"]:focus {
            outline: 1px solid var(--vscode-focusBorder, #007acc);
            outline-offset: 1px;
        }

        .filter-divider {
            width: 1px;
            height: 24px;
            background: var(--vscode-panel-border);
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
        .checkbox-cell input[type="checkbox"],
        .row-checkbox {
            margin: 0;
            cursor: pointer;
            width: 16px;
            height: 16px;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            border: 1.5px solid var(--vscode-foreground, #cccccc);
            border-radius: 3px;
            background: var(--vscode-checkbox-background, transparent);
            position: relative;
            vertical-align: middle;
        }
        .checkbox-cell input[type="checkbox"]:hover,
        .row-checkbox:hover {
            border-color: var(--vscode-focusBorder, #007acc);
        }
        .checkbox-cell input[type="checkbox"]:checked,
        .row-checkbox:checked {
            background: var(--vscode-button-background, #0e639c);
            border-color: var(--vscode-button-background, #0e639c);
        }
        .checkbox-cell input[type="checkbox"]:checked::after,
        .row-checkbox:checked::after {
            content: '';
            position: absolute;
            left: 4px;
            top: 1px;
            width: 5px;
            height: 9px;
            border: solid var(--vscode-button-foreground, #ffffff);
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
        }
        .checkbox-cell input[type="checkbox"]:focus,
        .row-checkbox:focus {
            outline: 1px solid var(--vscode-focusBorder, #007acc);
            outline-offset: 1px;
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
            /* Colors set dynamically via JavaScript based on user */
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
        <div id="bulkActions" style="display: none; margin-right: 12px; gap: 8px;">
            <button id="bulkChangeStateBtn" class="toolbar-btn-secondary toolbar-btn">
                <span>Change State</span>
            </button>
            <button id="bulkChangeAssigneeBtn" class="toolbar-btn-secondary toolbar-btn">
                <span>Change Assignee</span>
            </button>
            <button id="bulkDeleteBtn" class="toolbar-btn-secondary toolbar-btn" style="color: #f48771;">
                <span>Delete</span>
            </button>
        </div>
        <button id="refreshBtn" class="toolbar-btn-secondary toolbar-btn" style="${this.workItems.length === 0 ? 'margin-left: auto;' : ''}">
            <span>🔄</span>
            <span>Refresh</span>
        </button>
        <button id="createWorkItemBtn" class="toolbar-btn">
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
        >

        <div class="filter-divider"></div>

        <div class="filter-dropdown" id="typeDropdown">
            <button class="filter-dropdown-btn" id="typeDropdownBtn" type="button">Type</button>
            <div class="filter-dropdown-content" id="typeDropdownContent">
                ${types.map(t => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="type" value="${this.escapeHtml(t)}">
                        ${this.escapeHtml(t)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="typeClearBtn" type="button" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="stateDropdown">
            <button class="filter-dropdown-btn" id="stateDropdownBtn" type="button">State</button>
            <div class="filter-dropdown-content" id="stateDropdownContent">
                ${states.map(s => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="state" value="${this.escapeHtml(s)}">
                        ${this.escapeHtml(s)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="stateClearBtn" type="button" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="assigneeDropdown">
            <button class="filter-dropdown-btn" id="assigneeDropdownBtn" type="button">Assignee</button>
            <div class="filter-dropdown-content" id="assigneeDropdownContent">
                ${assignees.map(a => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="assignee" value="${this.escapeHtml(a)}">
                        ${this.escapeHtml(a)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="assigneeClearBtn" type="button" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="areaDropdown">
            <button class="filter-dropdown-btn" id="areaDropdownBtn" type="button">Area</button>
            <div class="filter-dropdown-content" id="areaDropdownContent">
                ${areas.map(a => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="area" value="${this.escapeHtml(a)}">
                        ${this.escapeHtml(a)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="areaClearBtn" type="button" disabled>✕ Clear</button>
            </div>
        </div>

        <div class="filter-dropdown" id="tagsDropdown">
            <button class="filter-dropdown-btn" id="tagsDropdownBtn" type="button">Tags</button>
            <div class="filter-dropdown-content" id="tagsDropdownContent">
                ${tags.map(t => `
                    <label class="filter-checkbox-item">
                        <input type="checkbox" name="tags" value="${this.escapeHtml(t)}">
                        ${this.escapeHtml(t)}
                    </label>
                `).join('')}
                <div class="filter-divider" style="margin: 4px 0; height: 1px; width: 100%;"></div>
                <button class="filter-clear-btn" id="tagsClearBtn" type="button" disabled>✕ Clear</button>
            </div>
        </div>
    </div>

    <div class="table-wrapper">
        ${this.workItems.length > 0 ? `
        <div class="table-container">
            <table id="workItemsTable">
                <thead>
                    <tr>
                        <th class="checkbox-cell"><input type="checkbox" id="selectAllCheckbox"></th>
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
                        const displayName = assignedTo?.displayName || 'Unassigned';
                        const initials = displayName !== 'Unassigned' ? displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2) : '?';

                        return `
                            <tr data-id="${id}" data-type="${this.escapeHtml(type)}" data-state="${this.escapeHtml(state)}" data-assignee="${this.escapeHtml(assignedTo?.displayName || 'Unassigned')}" data-area="${this.escapeHtml(areaPath)}" data-tags="${this.escapeHtml(tags)}" class="work-item-row">
                                <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${id}"></td>
                                <td class="clickable-cell"><span class="work-item-id">#${id}</span></td>
                                <td class="clickable-cell" style="text-align: center;">${icon}</td>
                                <td class="title-cell">
                                    <strong>${this.escapeHtml(title)}</strong>
                                </td>
                                <td class="clickable-cell">
                                    <span class="state-pill state-${stateClass}">${this.escapeHtml(state)}</span>
                                    <button class="action-btn cell-actions change-state-btn" data-id="${id}">⋯</button>
                                </td>
                                <td class="clickable-cell">
                                    <div class="assignee-cell">
                                        <div class="avatar">${initials}</div>
                                        <span>${this.escapeHtml(displayName)}</span>
                                        <button class="action-btn cell-actions change-assignee-btn" data-id="${id}">⋯</button>
                                    </div>
                                </td>
                                <td class="clickable-cell">${this.escapeHtml(areaPath)}</td>
                                <td class="clickable-cell">
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
        (function() {
            const vscode = acquireVsCodeApi();
            const selectedIds = new Set();

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
                document.querySelectorAll('.avatar').forEach(avatar => {
                    const row = avatar.closest('tr');
                    if (row) {
                        const displayName = row.getAttribute('data-assignee');
                        if (displayName && displayName !== 'Unassigned') {
                            const color = getAvatarColor(displayName);
                            avatar.style.background = color.bg;
                            avatar.style.color = color.fg;
                        }
                    }
                });
            }

            // Helper functions
            function openWorkItem(id) {
                vscode.postMessage({ command: 'openWorkItem', id: id });
            }

            function updateBulkActionsVisibility() {
                const bulkActions = document.getElementById('bulkActions');
                if (bulkActions) {
                    bulkActions.style.display = selectedIds.size > 0 ? 'flex' : 'none';
                }
            }

            function updateSelectAllCheckbox() {
                const allCheckbox = document.getElementById('selectAllCheckbox');
                if (!allCheckbox) return;

                const checkboxes = Array.from(document.querySelectorAll('.row-checkbox'));
                const visibleCheckboxes = checkboxes.filter(cb => {
                    const row = cb.closest('tr');
                    return row && row.style.display !== 'none';
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

            // Filter dropdown functions
            function toggleDropdown(id) {
                // Close all other dropdowns
                document.querySelectorAll('.filter-dropdown-content').forEach(d => {
                    if (d.id !== id) d.classList.remove('show');
                });
                document.getElementById(id).classList.toggle('show');
            }

            function handleFilterChange(type, checkbox) {
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
                    type: 'Type',
                    state: 'State',
                    assignee: 'Assignee',
                    area: 'Area',
                    tags: 'Tags'
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

            function getSelectedFilters(filterName) {
                const container = document.getElementById(filterName + 'DropdownContent');
                if (!container) return [];
                const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
                return Array.from(checkboxes).map(cb => cb.value);
            }

            function applyFilters() {
                const keywordEl = document.getElementById('keywordFilter');
                const keyword = keywordEl ? keywordEl.value.toLowerCase() : '';

                const selectedTypes = getSelectedFilters('type');
                const selectedStates = getSelectedFilters('state');
                const selectedAssignees = getSelectedFilters('assignee');
                const selectedAreas = getSelectedFilters('area');
                const selectedTags = getSelectedFilters('tags');

                const rows = document.querySelectorAll('#workItemsTable tbody tr');

                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    const type = row.dataset.type || '';
                    const state = row.dataset.state || '';
                    const assignee = row.dataset.assignee || '';
                    const area = row.dataset.area || '';
                    const rowTags = (row.dataset.tags || '').split(';').map(t => t.trim()).filter(t => t);

                    const matchesKeyword = !keyword || text.includes(keyword);
                    const matchesType = selectedTypes.length === 0 || selectedTypes.includes(type);
                    const matchesState = selectedStates.length === 0 || selectedStates.includes(state);
                    const matchesAssignee = selectedAssignees.length === 0 || selectedAssignees.includes(assignee);
                    const matchesArea = selectedAreas.length === 0 || selectedAreas.includes(area);
                    const matchesTags = selectedTags.length === 0 || selectedTags.some(t => rowTags.includes(t));

                    row.style.display = (matchesKeyword && matchesType && matchesState && matchesAssignee && matchesArea && matchesTags) ? '' : 'none';
                });

                updateSelectAllCheckbox();
            }

            function editTitle(id, cell) {
                const strong = cell.querySelector('strong');
                if (!strong) return;

                const currentTitle = strong.textContent.trim();

                const input = document.createElement('input');
                input.type = 'text';
                input.value = currentTitle;
                input.style.cssText = 'width: 100%; padding: 4px; font-size: 13px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px;';

                strong.style.display = 'none';
                cell.appendChild(input);
                input.focus();
                input.select();

                let saved = false;
                const saveEdit = () => {
                    if (saved) return;
                    saved = true;
                    const newTitle = input.value.trim();
                    if (newTitle && newTitle !== currentTitle) {
                        vscode.postMessage({ command: 'editTitle', id: id, title: newTitle });
                    }
                    input.remove();
                    strong.style.display = '';
                };

                const cancelEdit = () => {
                    saved = true;
                    input.remove();
                    strong.style.display = '';
                };

                input.addEventListener('blur', saveEdit);
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEdit();
                    }
                });
            }

            // Wait for DOM to be ready
            document.addEventListener('DOMContentLoaded', init);
            if (document.readyState !== 'loading') {
                init();
            }

            function init() {
                // Apply avatar colors on load
                applyAvatarColors();

                // Toolbar buttons
                const refreshBtn = document.getElementById('refreshBtn');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', function() {
                        vscode.postMessage({ command: 'refresh' });
                    });
                }

                const createWorkItemBtn = document.getElementById('createWorkItemBtn');
                if (createWorkItemBtn) {
                    createWorkItemBtn.addEventListener('click', function() {
                        vscode.postMessage({ command: 'createWorkItem' });
                    });
                }

                // Bulk action buttons
                const bulkChangeStateBtn = document.getElementById('bulkChangeStateBtn');
                if (bulkChangeStateBtn) {
                    bulkChangeStateBtn.addEventListener('click', function() {
                        if (selectedIds.size > 0) {
                            vscode.postMessage({ command: 'bulkChangeState', ids: Array.from(selectedIds) });
                        }
                    });
                }

                const bulkChangeAssigneeBtn = document.getElementById('bulkChangeAssigneeBtn');
                if (bulkChangeAssigneeBtn) {
                    bulkChangeAssigneeBtn.addEventListener('click', function() {
                        if (selectedIds.size > 0) {
                            vscode.postMessage({ command: 'bulkChangeAssignee', ids: Array.from(selectedIds) });
                        }
                    });
                }

                const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
                if (bulkDeleteBtn) {
                    bulkDeleteBtn.addEventListener('click', function() {
                        if (selectedIds.size > 0) {
                            vscode.postMessage({ command: 'deleteWorkItems', ids: Array.from(selectedIds) });
                        }
                    });
                }

                // Filter inputs
                const keywordFilter = document.getElementById('keywordFilter');
                if (keywordFilter) {
                    keywordFilter.addEventListener('input', applyFilters);
                }

                // Filter dropdown buttons
                const typeDropdownBtn = document.getElementById('typeDropdownBtn');
                if (typeDropdownBtn) {
                    typeDropdownBtn.addEventListener('click', () => toggleDropdown('typeDropdownContent'));
                }

                const stateDropdownBtn = document.getElementById('stateDropdownBtn');
                if (stateDropdownBtn) {
                    stateDropdownBtn.addEventListener('click', () => toggleDropdown('stateDropdownContent'));
                }

                const assigneeDropdownBtn = document.getElementById('assigneeDropdownBtn');
                if (assigneeDropdownBtn) {
                    assigneeDropdownBtn.addEventListener('click', () => toggleDropdown('assigneeDropdownContent'));
                }

                const areaDropdownBtn = document.getElementById('areaDropdownBtn');
                if (areaDropdownBtn) {
                    areaDropdownBtn.addEventListener('click', () => toggleDropdown('areaDropdownContent'));
                }

                const tagsDropdownBtn = document.getElementById('tagsDropdownBtn');
                if (tagsDropdownBtn) {
                    tagsDropdownBtn.addEventListener('click', () => toggleDropdown('tagsDropdownContent'));
                }

                // Filter checkboxes
                document.querySelectorAll('.filter-dropdown-content input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', function() {
                        const filterType = this.name;
                        handleFilterChange(filterType, this);
                    });
                });

                // Filter clear buttons
                const typeClearBtn = document.getElementById('typeClearBtn');
                if (typeClearBtn) {
                    typeClearBtn.addEventListener('click', () => clearFilter('type'));
                }

                const stateClearBtn = document.getElementById('stateClearBtn');
                if (stateClearBtn) {
                    stateClearBtn.addEventListener('click', () => clearFilter('state'));
                }

                const assigneeClearBtn = document.getElementById('assigneeClearBtn');
                if (assigneeClearBtn) {
                    assigneeClearBtn.addEventListener('click', () => clearFilter('assignee'));
                }

                const areaClearBtn = document.getElementById('areaClearBtn');
                if (areaClearBtn) {
                    areaClearBtn.addEventListener('click', () => clearFilter('area'));
                }

                const tagsClearBtn = document.getElementById('tagsClearBtn');
                if (tagsClearBtn) {
                    tagsClearBtn.addEventListener('click', () => clearFilter('tags'));
                }

                // Close dropdowns when clicking outside
                document.addEventListener('click', function(event) {
                    if (!event.target.closest('.filter-dropdown')) {
                        document.querySelectorAll('.filter-dropdown-content').forEach(d => d.classList.remove('show'));
                    }
                });

                // Select all checkbox
                const selectAllCheckbox = document.getElementById('selectAllCheckbox');
                if (selectAllCheckbox) {
                    selectAllCheckbox.addEventListener('change', function() {
                        const checked = this.checked;
                        const checkboxes = document.querySelectorAll('.row-checkbox');
                        checkboxes.forEach(cb => {
                            const row = cb.closest('tr');
                            if (row && row.style.display !== 'none') {
                                cb.checked = checked;
                                const id = parseInt(cb.dataset.id);
                                if (checked) {
                                    selectedIds.add(id);
                                } else {
                                    selectedIds.delete(id);
                                }
                            }
                        });
                        updateBulkActionsVisibility();
                    });
                }

                // Row checkboxes
                document.querySelectorAll('.row-checkbox').forEach(cb => {
                    cb.addEventListener('click', function(e) {
                        e.stopPropagation();
                    });
                    cb.addEventListener('change', function() {
                        const id = parseInt(this.dataset.id);
                        if (this.checked) {
                            selectedIds.add(id);
                        } else {
                            selectedIds.delete(id);
                        }
                        updateBulkActionsVisibility();
                        updateSelectAllCheckbox();
                    });
                });

                // Clickable cells (open work item)
                document.querySelectorAll('.clickable-cell').forEach(cell => {
                    cell.addEventListener('click', function() {
                        const row = this.closest('tr');
                        if (row) {
                            const id = parseInt(row.dataset.id);
                            openWorkItem(id);
                        }
                    });
                });

                // Title cells (double click to edit, single click to open)
                document.querySelectorAll('.title-cell').forEach(cell => {
                    cell.addEventListener('click', function() {
                        const row = this.closest('tr');
                        if (row) {
                            const id = parseInt(row.dataset.id);
                            openWorkItem(id);
                        }
                    });
                    cell.addEventListener('dblclick', function(e) {
                        e.stopPropagation();
                        const row = this.closest('tr');
                        if (row) {
                            const id = parseInt(row.dataset.id);
                            editTitle(id, this);
                        }
                    });
                });

                // Change state buttons
                document.querySelectorAll('.change-state-btn').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const id = parseInt(this.dataset.id);
                        vscode.postMessage({ command: 'changeState', id: id });
                    });
                });

                // Change assignee buttons
                document.querySelectorAll('.change-assignee-btn').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const id = parseInt(this.dataset.id);
                        vscode.postMessage({ command: 'changeAssignee', id: id });
                    });
                });
            }
        })();
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        if (!text) return '';
        const map: Record<string, string> = {
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
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
