import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem } from '../models/workItem';
import { WorkItemEventManager } from '../events/workItemEventManager';

interface IterationInfo {
    id: string;
    name: string;
    path: string;
    startDate?: string;
    finishDate?: string;
}

interface AreaInfo {
    id: string;
    name: string;
    path: string;
}

interface TeamMemberInfo {
    id: string;
    displayName: string;
    uniqueName: string;
}

export class WorkItemPanel {
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _workItem: WorkItem | null = null;
    private _disposables: vscode.Disposable[] = [];
    private authenticationManager: AuthenticationManager;
    private _iterations: IterationInfo[] = [];
    private _areas: AreaInfo[] = [];
    private _teamMembers: TeamMemberInfo[] = [];
    private _existingTags: string[] = [];
    private _availableStates: string[] = [];
    private eventManager = WorkItemEventManager.getInstance();
    private eventSubscription: vscode.Disposable | null = null;

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

        // Subscribe to work item updates from other views
        this.eventSubscription = this.eventManager.onWorkItemUpdated((event) => {
            if (this._workItem && event.workItemId === this._workItem.id) {
                // Refresh this panel if it's showing the updated work item
                this.refreshWorkItem();
            }
        });

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
                    case 'uploadImage':
                        await this.uploadImageForComment(message.imageData);
                        break;
                    case 'updateComment':
                        await this.updateComment(message.commentId, message.comment);
                        break;
                    case 'deleteComment':
                        await this.deleteComment(message.commentId);
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
                    case 'updateField':
                        await this.updateField(message.field, message.value);
                        break;
                    case 'assignTo':
                        await this.assignTo(message.uniqueName);
                        break;
                    case 'uploadAttachment':
                        await this.uploadAttachment();
                        break;
                    case 'downloadAttachment':
                        await this.downloadAttachment(message.url, message.name);
                        break;
                    case 'deleteAttachment':
                        await this.deleteAttachment(message.url);
                        break;
                    case 'updateTags':
                        await this.updateTags(message.tags);
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

    private async saveWorkItem(data: { title: string; description: string; acceptanceCriteria?: string }) {
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

            if (data.acceptanceCriteria !== undefined && data.acceptanceCriteria !== (this._workItem.fields as any)['Microsoft.VSTS.Common.AcceptanceCriteria']) {
                patchDocument.push({
                    op: data.acceptanceCriteria ? 'replace' : 'remove',
                    path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
                    value: data.acceptanceCriteria
                });
            }

            if (patchDocument.length > 0) {
                await axiosInstance.patch(
                    `/_apis/wit/workitems/${this._workItem.id}`,
                    patchDocument,
                    { headers: { 'Content-Type': 'application/json-patch+json' } }
                );

                // Broadcast update to all views
                this.eventManager.notifyWorkItemUpdated({
                    workItemId: this._workItem.id,
                    updateType: 'update',
                    changes: patchDocument.map(p => ({
                        field: p.path,
                        newValue: p.value
                    }))
                });

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

            // Broadcast state change to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId: this._workItem.id,
                updateType: 'state-change',
                changes: [{ field: '/fields/System.State', newValue: newState }]
            });

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

            // Broadcast assignment to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId: this._workItem.id,
                updateType: 'assign',
                changes: [{ field: '/fields/System.AssignedTo', newValue: currentUser.uniqueName }]
            });

            vscode.window.showInformationMessage('Assigned to you');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to assign: ${error}`);
        }
    }

    private async assignTo(uniqueName: string) {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const patchOp = uniqueName
                ? { op: 'replace', path: '/fields/System.AssignedTo', value: uniqueName }
                : { op: 'remove', path: '/fields/System.AssignedTo' };

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [patchOp],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            // Broadcast assignment to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId: this._workItem.id,
                updateType: 'assign',
                changes: [{ field: '/fields/System.AssignedTo', newValue: uniqueName }]
            });

            vscode.window.showInformationMessage(uniqueName ? 'Assignee updated' : 'Assignee removed');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update assignee: ${error}`);
        }
    }

    private async updateField(field: string, value: any) {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const fieldPath = `/fields/${field}`;
            const patchOp = value !== null && value !== '' && value !== undefined
                ? { op: 'replace', path: fieldPath, value: value }
                : { op: 'remove', path: fieldPath };

            console.log(`[WorkItemPanel] Updating field ${field} with value:`, value);
            console.log('[WorkItemPanel] Patch operation:', JSON.stringify(patchOp));

            const response = await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [patchOp],
                {
                    headers: { 'Content-Type': 'application/json-patch+json' },
                    params: { 'api-version': '7.0' }
                }
            );

            console.log('[WorkItemPanel] Update successful:', response.status);

            // Broadcast field update to all views
            this.eventManager.notifyWorkItemUpdated({
                workItemId: this._workItem.id,
                updateType: 'update',
                changes: [{ field: fieldPath, newValue: value }]
            });

            vscode.window.showInformationMessage('Field updated');
            await this.refreshWorkItem();
        } catch (error: any) {
            console.error('[WorkItemPanel] Failed to update field:', error);
            console.error('[WorkItemPanel] Error response:', error.response?.data);
            console.error('[WorkItemPanel] Error status:', error.response?.status);
            vscode.window.showErrorMessage(`Failed to update field: ${error.response?.data?.message || error.message}`);
        }
    }

    private async updateTags(tags: string) {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const patchOp = tags && tags.trim()
                ? { op: 'replace', path: '/fields/System.Tags', value: tags }
                : { op: 'remove', path: '/fields/System.Tags' };

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [patchOp],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            vscode.window.showInformationMessage('Tags updated');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update tags: ${error}`);
        }
    }

    private async uploadAttachment() {
        if (!this._workItem) return;

        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Upload',
            title: 'Select file to attach'
        });

        if (!fileUri || fileUri.length === 0) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return;

            const filePath = fileUri[0].fsPath;
            const fileName = filePath.split(/[\\/]/).pop() || 'attachment';

            const fs = require('fs');
            const fileContent = fs.readFileSync(filePath);

            const uploadResponse = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/attachments`,
                fileContent,
                {
                    params: { fileName: fileName, 'api-version': '7.0' },
                    headers: { 'Content-Type': 'application/octet-stream' }
                }
            );

            const attachmentUrl = uploadResponse.data.url;

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [{
                    op: 'add',
                    path: '/relations/-',
                    value: {
                        rel: 'AttachedFile',
                        url: attachmentUrl,
                        attributes: { comment: `Uploaded from VS Code: ${fileName}` }
                    }
                }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            vscode.window.showInformationMessage(`Uploaded: ${fileName}`);
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to upload attachment: ${error}`);
        }
    }

    private async downloadAttachment(url: string, name: string) {
        try {
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(name),
                saveLabel: 'Download'
            });

            if (!saveUri) return;

            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const response = await axiosInstance.get(url, { responseType: 'arraybuffer' });

            const fs = require('fs');
            fs.writeFileSync(saveUri.fsPath, Buffer.from(response.data));

            vscode.window.showInformationMessage(`Downloaded: ${name}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to download attachment: ${error}`);
        }
    }

    private async deleteAttachment(url: string) {
        if (!this._workItem) return;

        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to remove this attachment?',
            { modal: true },
            'Remove'
        );

        if (confirm !== 'Remove') return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const relations = this._workItem.relations || [];
            const relationIndex = relations.findIndex((r: any) => r.url === url);

            if (relationIndex === -1) {
                vscode.window.showErrorMessage('Attachment not found');
                return;
            }

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [{ op: 'remove', path: `/relations/${relationIndex}` }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            vscode.window.showInformationMessage('Attachment removed');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to remove attachment: ${error}`);
        }
    }

    private async uploadImageForComment(base64Data: string): Promise<void> {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return;

            // Convert base64 to buffer
            const base64Image = base64Data.split(',')[1];
            const buffer = Buffer.from(base64Image, 'base64');

            // Upload as attachment
            const uploadResponse = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/attachments`,
                buffer,
                {
                    params: { fileName: `image-${Date.now()}.png`, 'api-version': '7.0' },
                    headers: { 'Content-Type': 'application/octet-stream' }
                }
            );

            // Send URL back to webview
            this._panel.webview.postMessage({
                command: 'imageUploaded',
                url: uploadResponse.data.url
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to upload image: ${error}`);
        }
    }

    private async addComment(commentHtml: string) {
        if (!this._workItem || !commentHtml.trim()) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return;

            await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${this._workItem.id}/comments`,
                { text: commentHtml },
                { params: { 'api-version': '7.0-preview.3' } }
            );

            vscode.window.showInformationMessage('Comment added');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add comment: ${error}`);
        }
    }

    private async updateComment(commentId: number, commentHtml: string) {
        if (!this._workItem || !commentHtml.trim()) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return;

            await axiosInstance.patch(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${this._workItem.id}/comments/${commentId}`,
                { text: commentHtml },
                { params: { 'api-version': '7.0-preview.3' } }
            );

            vscode.window.showInformationMessage('Comment updated');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update comment: ${error}`);
        }
    }

    private async deleteComment(commentId: number) {
        if (!this._workItem) return;

        const confirm = await vscode.window.showWarningMessage(
            'Delete this comment?',
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return;

            await axiosInstance.delete(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${this._workItem.id}/comments/${commentId}`,
                { params: { 'api-version': '7.0-preview.3' } }
            );

            vscode.window.showInformationMessage('Comment deleted');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete comment: ${error}`);
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
            this.getLinkedItems(),
            this.getIterations(),
            this.getAreas(),
            this.getTeamMembers(),
            this.getExistingTags(),
            this.getAttachments(),
            this.getAvailableStates(),
            this.authenticationManager.getCurrentUser().catch(err => {
                console.error('Failed to get current user, using fallback:', err);
                return null;
            })
        ]).then(([comments, linkedItems, iterations, areas, teamMembers, existingTags, attachments, availableStates, currentUser]) => {
            this._iterations = iterations;
            this._areas = areas;
            this._teamMembers = teamMembers;
            this._existingTags = existingTags;
            this._availableStates = availableStates;
            this._panel.webview.html = this._getHtmlForWebview(comments, linkedItems, attachments, currentUser);
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

    private async getAttachments(): Promise<any[]> {
        if (!this._workItem) return [];

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return [];

            const response = await axiosInstance.get(`/_apis/wit/workitems/${this._workItem.id}`, {
                params: { '$expand': 'relations', 'api-version': '7.0' }
            });

            const relations = response.data.relations || [];
            const attachments: any[] = [];

            for (const relation of relations) {
                if (relation.rel === 'AttachedFile') {
                    const urlParts = relation.url.split('/');
                    const fileName = relation.attributes?.name ||
                                   decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]) ||
                                   'attachment';

                    attachments.push({
                        name: fileName,
                        url: relation.url,
                        comment: relation.attributes?.comment || '',
                        resourceSize: relation.attributes?.resourceSize || 0
                    });
                }
            }

            return attachments;
        } catch (error) {
            console.error('Failed to load attachments:', error);
            return [];
        }
    }

    private async getIterations(): Promise<IterationInfo[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) return [];

            // Get team-specific iterations instead of all project iterations
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations`,
                { params: { 'api-version': '7.1' } }
            );

            // Log the raw API response to see what we're getting
            console.log('[WorkItemPanel] Raw iteration data from API:', JSON.stringify(response.data.value, null, 2));

            const iterations: IterationInfo[] = (response.data.value || []).map((iter: any) => ({
                id: iter.id,
                name: iter.name,
                path: iter.path,
                startDate: iter.attributes?.startDate,
                finishDate: iter.attributes?.finishDate
            }));

            console.log('[WorkItemPanel] Loaded', iterations.length, 'team iterations');
            console.log('[WorkItemPanel] Iteration paths:', iterations.map(i => i.path));
            return iterations;
        } catch (error) {
            console.error('Failed to load iterations:', error);
            return [];
        }
    }

    private async getAreas(): Promise<AreaInfo[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) return [];

            // Get team-specific area from team settings
            const teamFieldValuesResponse = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/teamfieldvalues`,
                { params: { 'api-version': '7.1' } }
            );

            const areas: AreaInfo[] = [];

            // Get the team's area paths from team settings
            const teamAreaValues = teamFieldValuesResponse.data.values || [];
            teamAreaValues.forEach((areaValue: any) => {
                const areaPath = areaValue.value;
                if (areaPath) {
                    // Extract the last segment as the name
                    const pathSegments = areaPath.split('\\');
                    const name = pathSegments[pathSegments.length - 1];

                    areas.push({
                        id: areaPath, // Use path as id since we don't have node id
                        name: name,
                        path: areaPath
                    });
                }
            });

            console.log('[WorkItemPanel] Loaded', areas.length, 'team areas');
            return areas;
        } catch (error) {
            console.error('Failed to load areas:', error);
            return [];
        }
    }

    private async getTeamMembers(): Promise<TeamMemberInfo[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                console.log('Team members: Missing config', { project: config?.defaultProject });
                return [];
            }

            const members: TeamMemberInfo[] = [];

            // Try to get team members if team is configured
            if (config.defaultTeam) {
                try {
                    const teamResponse = await axiosInstance.get(
                        `/_apis/projects/${encodeURIComponent(config.defaultProject)}/teams/${encodeURIComponent(config.defaultTeam)}/members`,
                        { params: { 'api-version': '7.0' } }
                    );

                    const teamMembers = (teamResponse.data.value || []).map((member: any) => ({
                        id: member.identity?.id || '',
                        displayName: member.identity?.displayName || '',
                        uniqueName: member.identity?.uniqueName || ''
                    })).filter((m: TeamMemberInfo) => m.displayName && m.uniqueName);

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
                            id: member.identity?.id || '',
                            displayName: member.identity?.displayName || '',
                            uniqueName: member.identity?.uniqueName || ''
                        })).filter((m: TeamMemberInfo) => m.displayName && m.uniqueName);

                        // Add unique members
                        additionalMembers.forEach((newMember: TeamMemberInfo) => {
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

            // Filter to only show team members who have work items assigned to them
            const filteredMembers = await this.filterTeamMembersWithWorkItems(members, axiosInstance, config);
            console.log(`Filtered to ${filteredMembers.length} members with work items`);

            return filteredMembers.sort((a, b) => a.displayName.localeCompare(b.displayName));
        } catch (error) {
            console.error('Failed to get team members:', error);
            return [];
        }
    }

    private async filterTeamMembersWithWorkItems(
        members: TeamMemberInfo[],
        axiosInstance: any,
        config: any
    ): Promise<TeamMemberInfo[]> {
        try {
            // Get the team's area path to filter work items
            let teamAreaPath = '';
            try {
                const teamFieldValues = await axiosInstance.get(
                    `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/teamfieldvalues`,
                    { params: { 'api-version': '7.1' } }
                );
                teamAreaPath = teamFieldValues.data?.defaultValue || '';
            } catch (error) {
                console.log('Could not get team area path, will not filter by area');
            }

            // Query for work items assigned to team members
            let areaFilter = '';
            if (teamAreaPath) {
                areaFilter = `AND [System.AreaPath] UNDER '${teamAreaPath.replace(/'/g, "''")}'`;
            }

            const wiql = `SELECT [System.Id], [System.AssignedTo]
                          FROM WorkItems
                          WHERE [System.TeamProject] = @project
                          AND [System.AssignedTo] <> ''
                          ${areaFilter}`;

            const wiqlResponse = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql },
                { params: { 'api-version': '7.1' } }
            );

            const workItemRefs = wiqlResponse.data.workItems || [];

            if (workItemRefs.length === 0) {
                console.log('No work items found, showing all team members');
                return members;
            }

            // Fetch work item details to get assignees
            const workItemIds = workItemRefs.map((ref: any) => ref.id).slice(0, 200); // Limit to 200 for performance
            const detailsResponse = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitems`,
                {
                    params: {
                        'ids': workItemIds.join(','),
                        'fields': 'System.AssignedTo',
                        'api-version': '7.1'
                    }
                }
            );

            // Collect unique assignees
            const uniqueAssignees = new Set<string>();
            (detailsResponse.data.value || []).forEach((item: any) => {
                const assignedTo = item.fields?.['System.AssignedTo'];
                if (assignedTo?.uniqueName) {
                    uniqueAssignees.add(assignedTo.uniqueName);
                }
            });

            // Filter team members to only those with work items
            return members.filter(member => uniqueAssignees.has(member.uniqueName));
        } catch (error) {
            console.error('Failed to filter team members:', error);
            // Return all members if filtering fails
            return members;
        }
    }

    private async getExistingTags(): Promise<string[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return [];

            const wiql = `SELECT [System.Id], [System.Tags] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC`;

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql },
                { params: { 'api-version': '7.0', '$top': 100 } }
            );

            const workItemRefs = response.data.workItems || [];
            if (workItemRefs.length === 0) return [];

            const ids = workItemRefs.slice(0, 50).map((w: any) => w.id).join(',');
            const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: { 'ids': ids, 'fields': 'System.Tags', 'api-version': '7.0' }
            });

            const tagSet = new Set<string>();
            (detailsResponse.data.value || []).forEach((item: any) => {
                const tags = item.fields?.['System.Tags'] || '';
                if (tags) {
                    tags.split(';').forEach((tag: string) => {
                        const trimmed = tag.trim();
                        if (trimmed) tagSet.add(trimmed);
                    });
                }
            });

            return Array.from(tagSet).sort();
        } catch (error) {
            console.error('Failed to load existing tags:', error);
            return [];
        }
    }

    private async getAvailableStates(): Promise<string[]> {
        if (!this._workItem) return [];

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return [];

            const workItemType = this._workItem.fields['System.WorkItemType'];

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

    private _getHtmlForWebview(comments: any[] = [], linkedItems: any[] = [], attachments: any[] = [], currentUser: any = null): string {
        if (!this._workItem) return '<html><body><p>No work item loaded</p></body></html>';

        const fields = this._workItem.fields;
        const title = this.escapeHtml(fields['System.Title'] || '');
        const description = fields['System.Description'] || '';
        const acceptanceCriteria = (fields as any)['Microsoft.VSTS.Common.AcceptanceCriteria'] || '';
        const state = fields['System.State'] || '';
        const type = fields['System.WorkItemType'] || '';
        const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';
        const assignedToUniqueName = fields['System.AssignedTo']?.uniqueName || '';
        const createdDate = new Date(fields['System.CreatedDate']).toLocaleDateString();
        const changedDate = new Date(fields['System.ChangedDate']).toLocaleDateString();
        const priority = fields['Microsoft.VSTS.Common.Priority'] || 0;
        const effort = fields['Microsoft.VSTS.Scheduling.Effort'] || (fields as any)['Microsoft.VSTS.Scheduling.StoryPoints'] || '';
        const iterationPath = fields['System.IterationPath'] || '';
        const areaPath = fields['System.AreaPath'] || '';
        const tags = fields['System.Tags'] || '';

        // Log the current work item's paths to understand the expected format
        console.log('[WorkItemPanel] Current work item paths:');
        console.log('  - IterationPath:', iterationPath);
        console.log('  - AreaPath:', areaPath);

        // Get current user info for comment section
        // Azure DevOps API returns customDisplayName, not displayName
        const currentUserDisplayName = currentUser?.customDisplayName || currentUser?.providerDisplayName || currentUser?.displayName || 'You';
        const currentUserInitials = this.getInitials(currentUserDisplayName);
        const currentUserColor = this.getAvatarColor(currentUserDisplayName);

        // Use dynamically fetched available states for this work item type
        const stateOptions = this._availableStates.length > 0
            ? this._availableStates
            : ['New', 'Active', 'Resolved', 'Closed'];

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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: vscode-resource:; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.quilljs.com; style-src 'unsafe-inline' https://cdn.quilljs.com; font-src https://cdn.quilljs.com; connect-src https://cdn.quilljs.com;">
    <title>#${this._workItem.id}</title>
    <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.6;
            padding: 0;
        }

        /* Entrance animation - smooth slide-in from right with fade */
        @keyframes slideInFromRight {
            from {
                opacity: 0;
                transform: translateX(20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 24px;
            animation: slideInFromRight 300ms ease-out;
        }
        
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
            position: relative;
        }
        .menu-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 4px;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            min-width: 180px;
        }
        .menu-item {
            padding: 10px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            font-size: 13px;
            transition: background 0.2s;
        }
        .menu-item:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }
        .menu-item:first-child {
            border-radius: 6px 6px 0 0;
        }
        .menu-item:last-child {
            border-radius: 0 0 6px 6px;
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
        .description-display {
            line-height: 1.6;
            color: var(--vscode-foreground);
            transition: all 0.2s ease;
            border: 1px solid transparent;
        }
        .description-display:hover {
            background: var(--vscode-list-hoverBackground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 12px;
        }
        #descriptionEditorContainer, #acceptanceCriteriaEditorContainer {
            transition: all 0.3s ease;
            opacity: 0;
            max-height: 0;
            overflow: hidden;
        }
        #descriptionEditorContainer.show, #acceptanceCriteriaEditorContainer.show {
            opacity: 1;
            max-height: 500px;
        }
        label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        input[type='text'], textarea {
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
        input[type='text']:focus, textarea:focus {
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
            position: relative;
            z-index: 1;
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

        /* Tag Editor */
        .tags-editor-container {
            position: relative;
            width: 100%;
        }
        .tags-display {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            padding: 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            min-height: 38px;
            transition: all 0.2s;
        }
        .tags-display:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }
        .tag-chip-editable {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: rgba(33, 150, 243, 0.2);
            color: #2196f3;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
        }
        .tag-remove {
            background: none;
            border: none;
            color: currentColor;
            cursor: pointer;
            padding: 0;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            line-height: 1;
            opacity: 0.6;
            transition: all 0.2s;
        }
        .tag-remove:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.2);
        }
        .tag-input {
            flex: 1;
            min-width: 100px;
            border: none;
            background: transparent;
            color: var(--vscode-input-foreground);
            outline: none;
            font-size: 11px;
            padding: 4px;
        }
        .tag-suggestions {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 6px;
            margin-top: 4px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .tag-suggestions.show {
            display: block;
        }
        .tag-suggestion-item {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        .tag-suggestion-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .tag-suggestion-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .meta-select {
            width: 100%;
            padding: 8px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-family: inherit;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
            z-index: 10;
        }
        .meta-select:hover {
            border-color: var(--vscode-focusBorder);
        }
        .meta-select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }
        .custom-dropdown-wrapper {
            position: relative;
            width: 100%;
        }
        .custom-dropdown-btn {
            text-align: left;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-right: 24px !important;
        }
        .custom-dropdown-btn::after {
            content: '\\25BC';
            position: absolute;
            right: 8px;
            font-size: 10px;
            opacity: 0.7;
        }
        .iteration-dropdown-list {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            min-width: 350px;
            max-height: 300px;
            overflow-y: auto;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 100;
            margin-top: 2px;
        }
        .iteration-dropdown-list.open-left {
            display: block;
            right: 0;
            left: auto;
        }
        .iteration-dropdown-list.open-right {
            display: block;
            left: 0;
            right: auto;
        }
        .iteration-dropdown-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.1s;
            gap: 12px;
        }
        .iteration-dropdown-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .iteration-dropdown-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .iteration-item-name {
            white-space: nowrap;
            font-size: 13px;
        }
        .iteration-item-dates {
            white-space: nowrap;
            font-size: 12px;
            opacity: 0.9;
            color: #ffffff;
        }
        .area-dropdown-list {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            min-width: 300px;
            max-height: 300px;
            overflow-y: auto;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 100;
            margin-top: 2px;
        }
        .area-dropdown-list.open-left {
            display: block;
            right: 0;
            left: auto;
        }
        .area-dropdown-list.open-right {
            display: block;
            left: 0;
            right: auto;
        }
        .area-dropdown-item {
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.1s;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .area-dropdown-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .area-dropdown-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .assignee-dropdown-list {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            min-width: 250px;
            max-height: 300px;
            overflow-y: auto;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 100;
            margin-top: 2px;
        }
        .assignee-dropdown-list.open-left {
            display: block;
            right: 0;
            left: auto;
        }
        .assignee-dropdown-list.open-right {
            display: block;
            left: 0;
            right: auto;
        }
        .assignee-dropdown-item {
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.1s;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .assignee-dropdown-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .assignee-dropdown-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .meta-input {
            width: 100%;
            padding: 8px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-family: inherit;
            font-size: 13px;
            transition: all 0.2s;
        }
        .meta-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }
        .priority-select-wrapper {
            display: flex;
            gap: 6px;
        }
        .priority-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid var(--vscode-input-border);
            background: transparent;
            cursor: pointer;
            font-weight: 700;
            font-size: 12px;
            color: var(--vscode-foreground);
            transition: all 0.2s;
        }
        .priority-btn:hover {
            border-color: var(--vscode-focusBorder);
            transform: scale(1.1);
        }
        .priority-btn.active {
            background: #ffa500;
            border-color: #ffa500;
            color: white;
        }
        .priority-btn.p1.active { background: #d13438; border-color: #d13438; }
        .priority-btn.p2.active { background: #ffa500; border-color: #ffa500; }
        .priority-btn.p3.active { background: #0078d4; border-color: #0078d4; }
        .priority-btn.p4.active { background: #107c10; border-color: #107c10; }
        .effort-input {
            width: 80px;
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
            display: inline-flex;
            align-items: center;
            justify-content: center;
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
            display: inline-flex;
            align-items: center;
            justify-content: center;
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
            flex-direction: column;
            gap: 12px;
        }
        #addCommentBtn {
            transition: all 0.3s ease;
            opacity: 0;
            max-height: 0;
            overflow: hidden;
        }
        #addCommentBtn.show {
            opacity: 1;
            max-height: 50px;
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
            align-items: center;
            margin-bottom: 6px;
        }
        .comment-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .timeline-item:hover .comment-actions {
            opacity: 1;
        }
        .comment-action-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            padding: 4px;
            opacity: 0.6;
            transition: opacity 0.2s;
        }
        .comment-action-btn:hover {
            opacity: 1;
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
        }
        .timeline-text p { margin: 0 0 8px 0; }
        .timeline-text h1 { font-size: 24px; font-weight: 700; margin: 12px 0 8px 0; }
        .timeline-text h2 { font-size: 20px; font-weight: 700; margin: 10px 0 6px 0; }
        .timeline-text h3 { font-size: 16px; font-weight: 700; margin: 8px 0 4px 0; }
        .timeline-text ul, .timeline-text ol { margin: 0 0 8px 20px; }
        .timeline-text li { margin: 2px 0; }
        .timeline-text strong { font-weight: 600; }
        .timeline-text em { font-style: italic; }
        .timeline-text s { text-decoration: line-through; }
        .timeline-text u { text-decoration: underline; }
        .timeline-text blockquote { border-left: 3px solid var(--vscode-textBlockQuote-border); padding-left: 12px; margin: 8px 0; color: var(--vscode-textBlockQuote-foreground); background: var(--vscode-textBlockQuote-background); }
        .timeline-text code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; font-family: monospace; }
        .timeline-text pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 8px 0; }
        .timeline-text pre code { padding: 0; background: none; }
        .timeline-text a { color: var(--vscode-textLink-foreground); text-decoration: none; }
        .timeline-text a:hover { text-decoration: underline; }
        .timeline-text img { max-width: 100%; height: auto; margin: 8px 0; border-radius: 4px; display: block; }
        .ql-editor img { max-width: 100%; height: auto; }
        .timeline-text .ql-align-center { text-align: center; }
        .timeline-text .ql-align-right { text-align: right; }
        .timeline-text .ql-align-justify { text-align: justify; }
        .timeline-text .ql-indent-1 { padding-left: 3em; }
        .timeline-text .ql-indent-2 { padding-left: 6em; }
        .timeline-text .ql-indent-3 { padding-left: 9em; }
        .ql-toolbar { background: var(--vscode-input-background) !important; border: none !important; border-bottom: 1px solid var(--vscode-input-border) !important; border-radius: 6px 6px 0 0 !important; padding: 4px 6px !important; }
        #descriptionEditor .ql-toolbar { display: none !important; }
        #descriptionEditor .ql-toolbar.show { display: block !important; }
        #commentEditor .ql-toolbar { display: block !important; }
        .ql-toolbar .ql-formats { margin-right: 8px !important; margin-bottom: 0 !important; }
        .ql-toolbar button { width: 24px !important; height: 24px !important; padding: 2px !important; }
        .ql-toolbar .ql-picker-label { padding: 2px 4px !important; height: 24px !important; line-height: 20px !important; }
        .ql-toolbar .ql-picker { height: 24px !important; }
        .ql-container { border: none !important; font-size: 13px !important; }
        .ql-editor { min-height: 100px; color: var(--vscode-input-foreground) !important; }
        #descriptionEditor .ql-editor { min-height: 120px; }
        #commentEditor .ql-editor { min-height: 100px; }
        .ql-editor.ql-blank::before { color: var(--vscode-input-placeholderForeground) !important; font-style: normal !important; }
        .ql-stroke { stroke: var(--vscode-foreground) !important; }
        .ql-fill { fill: var(--vscode-foreground) !important; }
        .ql-picker-label { color: var(--vscode-foreground) !important; }
        .ql-picker-options { background: var(--vscode-dropdown-background) !important; border: 1px solid var(--vscode-dropdown-border) !important; }
        .ql-picker-item { color: var(--vscode-dropdown-foreground) !important; }
        .ql-picker-item:hover { background: var(--vscode-list-hoverBackground) !important; }
        .ql-toolbar button:hover, .ql-toolbar button.ql-active { color: var(--vscode-button-background) !important; }
        .ql-toolbar button:hover .ql-stroke, .ql-toolbar button.ql-active .ql-stroke { stroke: var(--vscode-button-background) !important; }
        .ql-toolbar button:hover .ql-fill, .ql-toolbar button.ql-active .ql-fill { fill: var(--vscode-button-background) !important; }
        #commentEditor { display: flex; flex-direction: column; }
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

        /* ATTACHMENTS */
        .attachments-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .upload-btn {
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        .upload-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .attachments-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .attachment-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            background: var(--vscode-editor-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-input-border);
            transition: all 0.2s;
        }
        .attachment-item:hover {
            border-color: var(--vscode-focusBorder);
        }
        .attachment-icon {
            font-size: 20px;
        }
        .attachment-info {
            flex: 1;
        }
        .attachment-name {
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
            cursor: pointer;
        }
        .attachment-name:hover {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
        }
        .attachment-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .attachment-actions {
            display: flex;
            gap: 6px;
        }
        .attachment-btn {
            padding: 4px 8px;
            background: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            opacity: 0.7;
            transition: all 0.2s;
        }
        .attachment-btn:hover {
            opacity: 1;
            border-color: var(--vscode-focusBorder);
        }
        .attachment-btn.delete:hover {
            color: #d13438;
            border-color: #d13438;
        }
        .no-attachments {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
    </style>
    <script src="https://cdn.quilljs.com/1.3.6/quill.min.js"></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="type-icon" title="${this.escapeHtml(type)}">${this.getWorkItemTypeIcon(type)}</span>
            <span class="work-item-id">#${this._workItem.id}</span>
            <span class="title-display">${title}</span>
            <span class="state-pill" onclick="scrollToState()">${this.escapeHtml(state)}</span>
            <div class="quick-actions">
                ${assignedTo === 'Unassigned' ? '<button class="btn-icon" onclick="assignToMe()">Assign to me</button>' : ''}
                <button class="btn-icon" onclick="toggleMenu(event)">⋯</button>
                <div id="menuDropdown" class="menu-dropdown" style="display: none;">
                    <div class="menu-item" onclick="openInBrowser(); hideMenu();">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                            <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/>
                        </svg>
                        Open in Browser
                    </div>
                    <div class="menu-item" onclick="refresh(); hideMenu();">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                        </svg>
                        Refresh
                    </div>
                </div>
            </div>
        </div>

        <div class="card details-card">
            <div class="card-title">Details</div>
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="title" value="${title}" onblur="saveTitleOnBlur()">
            </div>
            <div class="form-group">
                <label>Description</label>
                <div id="descriptionDisplay" class="description-display" onclick="showDescriptionEditor()" style="min-height: 40px; cursor: text; padding: 12px;">${description || '<span style="color: var(--vscode-input-placeholderForeground);">Click to add description...</span>'}</div>
                <div id="descriptionEditorContainer">
                    <div id="descriptionEditor" style="background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 6px;"></div>
                </div>
            </div>
            <div class="form-group">
                <label>Acceptance Criteria</label>
                <div id="acceptanceCriteriaDisplay" class="description-display" onclick="showAcceptanceCriteriaEditor()" style="min-height: 40px; cursor: text; padding: 12px;">${acceptanceCriteria || '<span style="color: var(--vscode-input-placeholderForeground);">Click to add acceptance criteria...</span>'}</div>
                <div id="acceptanceCriteriaEditorContainer">
                    <div id="acceptanceCriteriaEditor" style="background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 6px;"></div>
                </div>
            </div>
            <div class="action-bar" style="display: none;">
                <button class="btn-primary" onclick="saveWorkItem()">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px;">
                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                    </svg>
                    Save
                </button>
                <button class="btn-secondary" onclick="openInBrowser()">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px;">
                        <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/>
                    </svg>
                    Open in Browser
                </button>
                <button class="btn-secondary" onclick="refresh()">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px;">
                        <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                    </svg>
                    Refresh
                </button>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Metadata</div>
            <div class="metadata-grid">
                <div class="meta-item" style="z-index: 9;">
                    <span class="meta-label">Assigned To</span>
                    <div class="custom-dropdown-wrapper" id="assigneeDropdownWrapper">
                        <button class="meta-select custom-dropdown-btn" id="assigneeDropdownBtn" type="button" onclick="toggleAssigneeDropdown()">
                            ${assignedToUniqueName ? this.escapeHtml(this._teamMembers.find(m => m.uniqueName === assignedToUniqueName)?.displayName || 'Unassigned') : 'Unassigned'}
                        </button>
                        <div class="assignee-dropdown-list" id="assigneeDropdownList">
                            <div class="assignee-dropdown-item ${!assignedToUniqueName ? 'selected' : ''}" onclick="selectAssignee('', 'Unassigned')">
                                Unassigned
                            </div>
                            ${this._teamMembers.map(m => {
                                const isSelected = m.uniqueName === assignedToUniqueName;
                                return `<div class="assignee-dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectAssignee('${this.escapeHtml(m.uniqueName)}', '${this.escapeHtml(m.displayName)}')">
                                    ${this.escapeHtml(m.displayName)}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Priority</span>
                    <div class="priority-select-wrapper">
                        ${[1, 2, 3, 4].map(p => `<button class="priority-btn p${p} ${priority === p ? 'active' : ''}" onclick="updatePriority(${p})">${p}</button>`).join('')}
                    </div>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Effort / Story Points</span>
                    <input type="number" class="meta-input effort-input" id="effortInput" value="${effort}" placeholder="0" onchange="updateEffort()">
                </div>
                <div class="meta-item" style="z-index: 10;">
                    <span class="meta-label">Iteration</span>
                    <div class="custom-dropdown-wrapper" id="iterationDropdownWrapper">
                        <button class="meta-select custom-dropdown-btn" id="iterationDropdownBtn" type="button" onclick="toggleIterationDropdown()">
                            ${iterationPath ? this.escapeHtml(iterationPath.split('\\').pop() || iterationPath) : 'None'}
                        </button>
                        <div class="iteration-dropdown-list" id="iterationDropdownList">
                            <div class="iteration-dropdown-item ${!iterationPath ? 'selected' : ''}" onclick="selectIteration('', 'None')">
                                <span class="iteration-item-name">None</span>
                            </div>
                            ${this._iterations.map(iter => {
                                const dateRange = iter.startDate && iter.finishDate
                                    ? `${new Date(iter.startDate).toLocaleDateString()} - ${new Date(iter.finishDate).toLocaleDateString()}`
                                    : '';
                                const isSelected = iter.path === iterationPath;
                                return `<div class="iteration-dropdown-item ${isSelected ? 'selected' : ''}"
                                    data-path="${this.escapeHtml(iter.path)}"
                                    data-name="${this.escapeHtml(iter.name)}"
                                    onclick="selectIterationFromData(this)">
                                    <span class="iteration-item-name">${this.escapeHtml(iter.name)}</span>
                                    ${dateRange ? `<span class="iteration-item-dates">${dateRange}</span>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Tags</span>
                    <div class="tags-editor-container">
                        <div class="tags-display" id="tagsDisplay">
                            ${tags ? tags.split(';').map(t => `<span class="tag-chip-editable">${this.escapeHtml(t.trim())}<button class="tag-remove" onclick="removeTag('${this.escapeHtml(t.trim())}')">×</button></span>`).join('') : ''}
                            <input type="text" class="tag-input" id="tagInput" placeholder="Add tag..." oninput="handleTagInput()" onkeydown="handleTagKeydown(event)" onfocus="showTagSuggestions()" onblur="hideTagSuggestions()">
                        </div>
                        <div class="tag-suggestions" id="tagSuggestions"></div>
                    </div>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Created</span>
                    <span class="meta-value">${createdDate}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Modified</span>
                    <span class="meta-value">${changedDate}</span>
                </div>
                <div class="meta-item" style="z-index: 8;">
                    <span class="meta-label">Area</span>
                    <div class="custom-dropdown-wrapper" id="areaDropdownWrapper">
                        <button class="meta-select custom-dropdown-btn" id="areaDropdownBtn" type="button" onclick="toggleAreaDropdown()">
                            ${areaPath ? this.escapeHtml(areaPath.split('\\').pop() || areaPath) : 'Select Area'}
                        </button>
                        <div class="area-dropdown-list" id="areaDropdownList">
                            ${this._areas.map(area => {
                                const isSelected = area.path === areaPath;
                                return `<div class="area-dropdown-item ${isSelected ? 'selected' : ''}"
                                    data-path="${this.escapeHtml(area.path)}"
                                    data-name="${this.escapeHtml(area.name)}"
                                    onclick="selectAreaFromData(this)">
                                    ${this.escapeHtml(area.name)}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
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

        <div class="card">
            <div class="attachments-header">
                <div class="card-title" style="margin-bottom: 0;">📎 Attachments (${attachments.length})</div>
                <button class="upload-btn" onclick="uploadAttachment()">+ Upload File</button>
            </div>
            ${attachments.length > 0 ? `
            <div class="attachments-list">
                ${attachments.map((att: any) => `
                    <div class="attachment-item">
                        <span class="attachment-icon">${this.getFileIcon(att.name)}</span>
                        <div class="attachment-info">
                            <div class="attachment-name" onclick="downloadAttachment('${this.escapeHtml(att.url)}', '${this.escapeHtml(att.name)}')">${this.escapeHtml(att.name)}</div>
                            <div class="attachment-meta">${att.resourceSize ? this.formatFileSize(att.resourceSize) : ''}${att.comment ? ' • ' + this.escapeHtml(att.comment) : ''}</div>
                        </div>
                        <div class="attachment-actions">
                            <button class="attachment-btn" onclick="downloadAttachment('${this.escapeHtml(att.url)}', '${this.escapeHtml(att.name)}')" title="Download">↓</button>
                            <button class="attachment-btn delete" onclick="deleteAttachment('${this.escapeHtml(att.url)}')" title="Remove">×</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            ` : `
            <div class="no-attachments">No attachments yet. Click "Upload File" to add one.</div>
            `}
        </div>

        <div class="card" id="stateSection">
            <div class="card-title">Change State</div>
            <div class="state-pills">
                ${stateOptions.map(s => `<button class="state-option ${s === state ? 'active' : ''}" onclick="changeState('${s}')">${s}</button>`).join('')}
            </div>
        </div>

        <div class="card">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: ${currentUserColor}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">${currentUserInitials}</div>
                <div class="card-title" style="margin-bottom: 0;">Add a comment</div>
            </div>
            <div class="comment-input-area">
                <div id="commentEditor" style="width: 100%; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 6px;"></div>
                <button id="addCommentBtn" class="btn-secondary" onclick="addComment()" style="display: none;">Add Comment</button>
            </div>
        </div>

        ${comments.length > 0 ? `
        <div class="card">
            <div class="card-title">Activity (${comments.length})</div>
            <div class="timeline">
                ${comments.map(c => `
                    <div class="timeline-item">
                        <div class="timeline-icon" style="background: ${this.getAvatarColor(c.createdBy?.displayName || 'Unknown')}; color: white; font-weight: 600; font-size: 12px;">${this.getInitials(c.createdBy?.displayName || 'Unknown')}</div>
                        <div class="timeline-content">
                            <div class="timeline-header">
                                <span class="timeline-author">${this.escapeHtml(c.createdBy?.displayName || 'Unknown')} <span style="text-decoration: underline; font-weight: normal;">commented ${this.formatRelativeTime(c.createdDate)}</span></span>
                                <div class="comment-actions">
                                    <button class="comment-action-btn" onclick="editComment(${c.id})" title="Edit">✏️</button>
                                    <button class="comment-action-btn" onclick="deleteComment(${c.id})" title="Delete">🗑️</button>
                                </div>
                            </div>
                            <div class="timeline-text" id="comment-${c.id}" style="word-wrap: break-word;">${this.sanitizeHtml(c.text || '')}</div>
                            <div id="edit-${c.id}" style="display: none;">
                                <div id="editor-${c.id}" style="background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 6px; margin-top: 8px;"></div>
                                <div style="margin-top: 8px; display: flex; gap: 8px;">
                                    <button class="btn-secondary" onclick="saveEdit(${c.id})">Save</button>
                                    <button class="btn-secondary" onclick="cancelEdit(${c.id})">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        console.log('WorkItem panel script loaded');
        console.log('Team members count:', ${this._teamMembers.length});
        console.log('Iterations count:', ${this._iterations.length});
        console.log('Areas count:', ${this._areas.length});

        function showDescriptionEditor() {
            const display = document.getElementById('descriptionDisplay');
            const container = document.getElementById('descriptionEditorContainer');

            // Guard: prevent selection-change from hiding the editor while we're opening it
            descriptionEditorOpening = true;

            // Load current content from display into editor
            const currentHtml = display.innerHTML;
            if (currentHtml && !currentHtml.includes('Click to add description')) {
                descriptionQuill.setContents([]);
                descriptionQuill.clipboard.dangerouslyPasteHTML(0, currentHtml);
            }

            display.style.display = 'none';
            container.classList.add('show');
            // Explicitly show the toolbar
            if (descToolbarEl) descToolbarEl.style.display = 'block';
            setTimeout(() => {
                descriptionQuill.focus();
                descriptionEditorOpening = false;
            }, 150);
        }

        function hideDescriptionEditor() {
            const html = descriptionQuill.root.innerHTML;
            const text = descriptionQuill.getText().trim();
            const display = document.getElementById('descriptionDisplay');
            const container = document.getElementById('descriptionEditorContainer');

            container.classList.remove('show');
            setTimeout(() => {
                // Check if editor is actually empty by checking text content
                if (!text || text.length === 0) {
                    display.innerHTML = '<span style="color: var(--vscode-input-placeholderForeground);">Click to add description...</span>';
                } else {
                    display.innerHTML = html;
                }
                display.style.display = 'block';
            }, 300);

            // Only save if user actually edited the description
            if (descriptionDirty) {
                const title = document.getElementById('title').value;
                const acceptanceCriteria = acceptanceCriteriaQuill ? acceptanceCriteriaQuill.root.innerHTML : '';
                vscode.postMessage({ command: 'save', data: { title, description: html, acceptanceCriteria } });
                descriptionDirty = false;
            }
        }

        function showAcceptanceCriteriaEditor() {
            const display = document.getElementById('acceptanceCriteriaDisplay');
            const container = document.getElementById('acceptanceCriteriaEditorContainer');

            // Guard: prevent selection-change from hiding the editor while we're opening it
            acceptanceCriteriaEditorOpening = true;

            // Load current content from display into editor
            const currentHtml = display.innerHTML;
            if (currentHtml && !currentHtml.includes('Click to add acceptance criteria')) {
                acceptanceCriteriaQuill.setContents([]);
                acceptanceCriteriaQuill.clipboard.dangerouslyPasteHTML(0, currentHtml);
            }

            display.style.display = 'none';
            container.classList.add('show');
            // Explicitly show the toolbar
            if (acToolbarEl) acToolbarEl.style.display = 'block';
            setTimeout(() => {
                acceptanceCriteriaQuill.focus();
                acceptanceCriteriaEditorOpening = false;
            }, 150);
        }

        function hideAcceptanceCriteriaEditor() {
            const html = acceptanceCriteriaQuill.root.innerHTML;
            const text = acceptanceCriteriaQuill.getText().trim();
            const display = document.getElementById('acceptanceCriteriaDisplay');
            const container = document.getElementById('acceptanceCriteriaEditorContainer');

            container.classList.remove('show');
            setTimeout(() => {
                // Check if editor is actually empty by checking text content
                if (!text || text.length === 0) {
                    display.innerHTML = '<span style="color: var(--vscode-input-placeholderForeground);">Click to add acceptance criteria...</span>';
                } else {
                    display.innerHTML = html;
                }
                display.style.display = 'block';
            }, 300);

            // Only save if user actually edited the acceptance criteria
            if (acceptanceCriteriaDirty) {
                const title = document.getElementById('title').value;
                const description = descriptionQuill ? descriptionQuill.root.innerHTML : '';
                vscode.postMessage({ command: 'save', data: { title, description, acceptanceCriteria: html } });
                acceptanceCriteriaDirty = false;
            }
        }

        function toggleMenu(event) {
            event.stopPropagation();
            const menu = document.getElementById('menuDropdown');
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }

        function hideMenu() {
            document.getElementById('menuDropdown').style.display = 'none';
        }

        document.addEventListener('click', function() {
            hideMenu();
        });

        function saveTitleOnBlur() {
            const title = document.getElementById('title').value;
            const description = descriptionQuill ? descriptionQuill.root.innerHTML : '';
            const acceptanceCriteria = acceptanceCriteriaQuill ? acceptanceCriteriaQuill.root.innerHTML : '';
            vscode.postMessage({ command: 'save', data: { title, description, acceptanceCriteria } });
        }

        function saveWorkItem() {
            const title = document.getElementById('title').value;
            const description = descriptionQuill ? descriptionQuill.root.innerHTML : '';
            const acceptanceCriteria = acceptanceCriteriaQuill ? acceptanceCriteriaQuill.root.innerHTML : '';
            vscode.postMessage({ command: 'save', data: { title, description, acceptanceCriteria } });
        }

        function changeState(state) {
            vscode.postMessage({ command: 'changeState', state });
        }

        let quill;
        let descriptionQuill;
        let acceptanceCriteriaQuill;
        let editQuills = {};
        let descriptionDirty = false;
        let acceptanceCriteriaDirty = false;
        let descriptionEditorOpening = false;
        let acceptanceCriteriaEditorOpening = false;
        let descToolbarEl = null;
        let acToolbarEl = null;

        function initQuill() {
            try {
                console.log('Starting Quill initialization...');
                // Initialize description editor
                console.log('Initializing description editor...');
                descriptionQuill = new Quill('#descriptionEditor', {
                theme: 'snow',
                placeholder: 'Add a clear description...',
                modules: {
                    toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ color: [] }, { background: [] }],
                        [{ align: [] }],
                        [{ list: 'ordered'}, { list: 'bullet' }, { indent: '-1'}, { indent: '+1' }],
                        ['blockquote', 'code-block'],
                        ['link'],
                        ['clean']
                    ]
                }
            });
            console.log('Description editor created');

            // Set initial content using Quill's API to avoid Delta model crash
            const descriptionContent = ${JSON.stringify(description || '')};
            if (descriptionContent) {
                descriptionQuill.clipboard.dangerouslyPasteHTML(0, descriptionContent);
            }

            // Track user edits to description (only 'user' source means the user typed)
            descriptionQuill.on('text-change', function(delta, oldDelta, source) {
                if (source === 'user') {
                    descriptionDirty = true;
                }
            });

            // Hide toolbar after Quill finishes rendering
            setTimeout(() => {
                const descContainer = document.querySelector('#descriptionEditor');
                descToolbarEl = descContainer ? descContainer.previousElementSibling : null;
                if (descToolbarEl && descToolbarEl.classList.contains('ql-toolbar')) {
                    descToolbarEl.style.display = 'none';

                    descriptionQuill.on('selection-change', function(range) {
                        // Skip if editor is in the process of opening
                        if (descriptionEditorOpening) return;
                        if (!range && descToolbarEl) {
                            descToolbarEl.style.display = 'none';
                            hideDescriptionEditor();
                        } else if (range && descToolbarEl) {
                            descToolbarEl.style.display = 'block';
                        }
                    });
                }
            }, 100);

            // Initialize acceptance criteria editor
            console.log('Initializing acceptance criteria editor...');
            acceptanceCriteriaQuill = new Quill('#acceptanceCriteriaEditor', {
                theme: 'snow',
                placeholder: 'Add acceptance criteria...',
                modules: {
                    toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ color: [] }, { background: [] }],
                        [{ align: [] }],
                        [{ list: 'ordered'}, { list: 'bullet' }, { indent: '-1'}, { indent: '+1' }],
                        ['blockquote', 'code-block'],
                        ['link'],
                        ['clean']
                    ]
                }
            });
            console.log('Acceptance criteria editor created');

            // Set initial acceptance criteria content using Quill's API
            const acceptanceCriteriaContent = ${JSON.stringify(acceptanceCriteria || '')};
            if (acceptanceCriteriaContent) {
                acceptanceCriteriaQuill.clipboard.dangerouslyPasteHTML(0, acceptanceCriteriaContent);
            }

            // Track user edits to acceptance criteria
            acceptanceCriteriaQuill.on('text-change', function(delta, oldDelta, source) {
                if (source === 'user') {
                    acceptanceCriteriaDirty = true;
                }
            });

            // Hide acceptance criteria toolbar initially
            setTimeout(() => {
                const acContainer = document.querySelector('#acceptanceCriteriaEditor');
                acToolbarEl = acContainer ? acContainer.previousElementSibling : null;
                if (acToolbarEl && acToolbarEl.classList.contains('ql-toolbar')) {
                    acToolbarEl.style.display = 'none';

                    acceptanceCriteriaQuill.on('selection-change', function(range) {
                        // Skip if editor is in the process of opening
                        if (acceptanceCriteriaEditorOpening) return;
                        if (!range && acToolbarEl) {
                            acToolbarEl.style.display = 'none';
                            hideAcceptanceCriteriaEditor();
                        } else if (range && acToolbarEl) {
                            acToolbarEl.style.display = 'block';
                        }
                    });
                }
            }, 100);

            // Initialize comment editor (always show toolbar)
            console.log('Initializing comment editor...');
            quill = new Quill('#commentEditor', {
                theme: 'snow',
                placeholder: 'Write a comment... (supports rich text formatting)',
                modules: {
                    toolbar: {
                        container: [
                            [{ header: [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ color: [] }, { background: [] }],
                            [{ align: [] }],
                            [{ list: 'ordered'}, { list: 'bullet' }, { indent: '-1'}, { indent: '+1' }],
                            ['blockquote', 'code-block'],
                            ['link', 'image'],
                            ['clean']
                        ],
                        handlers: {
                            image: imageHandler
                        }
                    }
                }
            });

            // Hide comment toolbar initially, show on focus
            console.log('Comment editor initialized');
            setTimeout(() => {
                const commentContainer = document.querySelector('#commentEditor');
                const commentToolbar = commentContainer ? commentContainer.previousElementSibling : null;
                const addCommentBtn = document.getElementById('addCommentBtn');
                
                if (commentToolbar && commentToolbar.classList.contains('ql-toolbar')) {
                    commentToolbar.style.display = 'none';
                    commentToolbar.style.transition = 'all 0.3s ease';
                    
                    quill.on('selection-change', function(range) {
                        if (range) {
                            commentToolbar.style.display = 'block';
                            if (addCommentBtn) {
                                addCommentBtn.style.display = 'block';
                                setTimeout(() => addCommentBtn.classList.add('show'), 10);
                            }
                        } else {
                            commentToolbar.style.display = 'none';
                            if (addCommentBtn) {
                                addCommentBtn.classList.remove('show');
                                setTimeout(() => addCommentBtn.style.display = 'none', 300);
                            }
                        }
                    });
                }
            }, 100);
        } catch (error) {
            console.error('Error initializing Quill:', error);
            console.error('Error details:', error.message, error.stack);
        }
    }

        function imageHandler() {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.click();

            input.onchange = () => {
                const file = input.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        vscode.postMessage({ 
                            command: 'uploadImage', 
                            imageData: e.target.result 
                        });
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'imageUploaded') {
                const range = quill.getSelection(true);
                quill.insertEmbed(range.index, 'image', message.url);
            }
        });

        function editComment(commentId) {
            const commentDiv = document.getElementById('comment-' + commentId);
            const editDiv = document.getElementById('edit-' + commentId);
            const editorDiv = document.getElementById('editor-' + commentId);
            
            commentDiv.style.display = 'none';
            editDiv.style.display = 'block';
            
            if (!editQuills[commentId]) {
                editQuills[commentId] = new Quill('#editor-' + commentId, {
                    theme: 'snow',
                    modules: {
                        toolbar: [
                            [{ header: [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ color: [] }, { background: [] }],
                            [{ align: [] }],
                            [{ list: 'ordered'}, { list: 'bullet' }, { indent: '-1'}, { indent: '+1' }],
                            ['blockquote', 'code-block'],
                            ['link', 'image'],
                            ['clean']
                        ]
                    }
                });
                editQuills[commentId].clipboard.dangerouslyPasteHTML(0, commentDiv.innerHTML);
            }
        }

        function saveEdit(commentId) {
            const editor = editQuills[commentId];
            if (!editor) return;
            
            const html = editor.root.innerHTML;
            const text = editor.getText().trim();
            
            if (text) {
                vscode.postMessage({ command: 'updateComment', commentId: commentId, comment: html });
            }
        }

        function cancelEdit(commentId) {
            const commentDiv = document.getElementById('comment-' + commentId);
            const editDiv = document.getElementById('edit-' + commentId);
            
            commentDiv.style.display = 'block';
            editDiv.style.display = 'none';
        }

        function deleteComment(commentId) {
            vscode.postMessage({ command: 'deleteComment', commentId: commentId });
        }

        function addComment() {
            if (!quill) return;
            let html = quill.root.innerHTML;
            const text = quill.getText().trim();
            
            // Remove base64 images (they cause 500 errors)
            html = html.replace(/<img[^>]+src="data:image[^>]+>/gi, '<p>[Image removed - use attachment upload instead]</p>');
            
            if (text) {
                vscode.postMessage({ command: 'addComment', comment: html });
                quill.setContents([]);
            }
        }
        
        // Initialize Quill after page loads
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initQuill);
        } else {
            initQuill();
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

        function updateAssignee() {
            console.log('updateAssignee called');
            const select = document.getElementById('assigneeSelect');
            console.log('Assignee select element:', select);
            console.log('Selected value:', select.value);
            vscode.postMessage({ command: 'assignTo', uniqueName: select.value });
        }

        function updatePriority(priority) {
            console.log('updatePriority called:', priority);
            document.querySelectorAll('.priority-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('.priority-btn.p' + priority).classList.add('active');
            vscode.postMessage({ command: 'updateField', field: 'Microsoft.VSTS.Common.Priority', value: priority });
        }

        function updateEffort() {
            console.log('updateEffort called');
            const input = document.getElementById('effortInput');
            const value = input.value ? parseFloat(input.value) : null;
            console.log('Effort value:', value);
            // Try both field names for story points
            vscode.postMessage({ command: 'updateField', field: 'Microsoft.VSTS.Scheduling.StoryPoints', value: value });
        }

        function toggleIterationDropdown() {
            const list = document.getElementById('iterationDropdownList');
            const wrapper = document.getElementById('iterationDropdownWrapper');
            const isOpen = list.classList.contains('open-left') || list.classList.contains('open-right');

            // Close any other open dropdowns first
            document.querySelectorAll('.iteration-dropdown-list.open-left, .iteration-dropdown-list.open-right').forEach(el => {
                el.classList.remove('open-left', 'open-right');
            });

            if (!isOpen) {
                // Calculate available space on left and right
                const rect = wrapper.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const spaceOnRight = viewportWidth - rect.right;
                const spaceOnLeft = rect.left;
                const dropdownWidth = 350; // min-width of dropdown

                // Open to the side with more space, preferring left if both are insufficient
                if (spaceOnLeft >= dropdownWidth || spaceOnLeft > spaceOnRight) {
                    list.classList.add('open-left');
                } else {
                    list.classList.add('open-right');
                }
            }
        }

        function selectIteration(path, name) {
            console.log('[WorkItemPanel - WebView] selectIteration called with path:', path, 'name:', name);
            const btn = document.getElementById('iterationDropdownBtn');
            const list = document.getElementById('iterationDropdownList');
            btn.textContent = name;
            list.classList.remove('open-left', 'open-right');
            // Update selected state
            list.querySelectorAll('.iteration-dropdown-item').forEach(item => item.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
            console.log('[WorkItemPanel - WebView] Sending updateField message with path:', path);
            vscode.postMessage({ command: 'updateField', field: 'System.IterationPath', value: path || null });
        }

        function selectIterationFromData(element) {
            const path = element.dataset.path;
            const name = element.dataset.name;
            console.log('[WorkItemPanel - WebView] selectIterationFromData called with path:', path, 'name:', name);
            const btn = document.getElementById('iterationDropdownBtn');
            const list = document.getElementById('iterationDropdownList');
            btn.textContent = name;
            list.classList.remove('open-left', 'open-right');
            // Update selected state
            list.querySelectorAll('.iteration-dropdown-item').forEach(item => item.classList.remove('selected'));
            element.classList.add('selected');
            console.log('[WorkItemPanel - WebView] Sending updateField message with path:', path);
            vscode.postMessage({ command: 'updateField', field: 'System.IterationPath', value: path || null });
        }

        function toggleAreaDropdown() {
            const list = document.getElementById('areaDropdownList');
            const wrapper = document.getElementById('areaDropdownWrapper');
            const isOpen = list.classList.contains('open-left') || list.classList.contains('open-right');

            // Close any other open dropdowns first
            document.querySelectorAll('.iteration-dropdown-list.open-left, .iteration-dropdown-list.open-right, .area-dropdown-list.open-left, .area-dropdown-list.open-right').forEach(el => {
                el.classList.remove('open-left', 'open-right');
            });

            if (!isOpen) {
                // Calculate available space on left and right
                const rect = wrapper.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const spaceOnRight = viewportWidth - rect.right;
                const spaceOnLeft = rect.left;
                const dropdownWidth = 300; // min-width of dropdown

                // Open to the side with more space, preferring left if both are insufficient
                if (spaceOnLeft >= dropdownWidth || spaceOnLeft > spaceOnRight) {
                    list.classList.add('open-left');
                } else {
                    list.classList.add('open-right');
                }
            }
        }

        function selectArea(path) {
            console.log('[WorkItemPanel - WebView] selectArea called with path:', path);
            const btn = document.getElementById('areaDropdownBtn');
            const list = document.getElementById('areaDropdownList');
            // Display only the last segment (e.g., "DevOps" instead of "Experian Verifications\\DevOps")
            const displayName = path.split('\\\\').pop() || path;
            btn.textContent = displayName;
            list.classList.remove('open-left', 'open-right');
            // Update selected state
            list.querySelectorAll('.area-dropdown-item').forEach(item => item.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
            console.log('[WorkItemPanel - WebView] Sending updateField message with path:', path);
            vscode.postMessage({ command: 'updateField', field: 'System.AreaPath', value: path });
        }

        function selectAreaFromData(element) {
            const path = element.dataset.path;
            const name = element.dataset.name;
            console.log('[WorkItemPanel - WebView] selectAreaFromData called with path:', path, 'name:', name);
            const btn = document.getElementById('areaDropdownBtn');
            const list = document.getElementById('areaDropdownList');
            btn.textContent = name;
            list.classList.remove('open-left', 'open-right');
            // Update selected state
            list.querySelectorAll('.area-dropdown-item').forEach(item => item.classList.remove('selected'));
            element.classList.add('selected');
            console.log('[WorkItemPanel - WebView] Sending updateField message with path:', path);
            vscode.postMessage({ command: 'updateField', field: 'System.AreaPath', value: path });
        }

        function toggleAssigneeDropdown() {
            const list = document.getElementById('assigneeDropdownList');
            const wrapper = document.getElementById('assigneeDropdownWrapper');
            const isOpen = list.classList.contains('open-left') || list.classList.contains('open-right');

            // Close any other open dropdowns first
            document.querySelectorAll('.iteration-dropdown-list.open-left, .iteration-dropdown-list.open-right, .area-dropdown-list.open-left, .area-dropdown-list.open-right, .assignee-dropdown-list.open-left, .assignee-dropdown-list.open-right').forEach(el => {
                el.classList.remove('open-left', 'open-right');
            });

            if (!isOpen) {
                // Calculate available space on left and right
                const rect = wrapper.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const spaceOnRight = viewportWidth - rect.right;
                const spaceOnLeft = rect.left;
                const dropdownWidth = 250; // min-width of dropdown

                // Open to the side with more space, preferring left if both are insufficient
                if (spaceOnLeft >= dropdownWidth || spaceOnLeft > spaceOnRight) {
                    list.classList.add('open-left');
                } else {
                    list.classList.add('open-right');
                }
            }
        }

        function selectAssignee(uniqueName, displayName) {
            const btn = document.getElementById('assigneeDropdownBtn');
            const list = document.getElementById('assigneeDropdownList');
            btn.textContent = displayName;
            list.classList.remove('open-left', 'open-right');
            // Update selected state
            list.querySelectorAll('.assignee-dropdown-item').forEach(item => item.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
            vscode.postMessage({ command: 'assignTo', uniqueName: uniqueName || '' });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            const iterationWrapper = document.getElementById('iterationDropdownWrapper');
            const areaWrapper = document.getElementById('areaDropdownWrapper');
            const assigneeWrapper = document.getElementById('assigneeDropdownWrapper');

            if (iterationWrapper && !iterationWrapper.contains(e.target)) {
                const list = document.getElementById('iterationDropdownList');
                list.classList.remove('open-left', 'open-right');
            }

            if (areaWrapper && !areaWrapper.contains(e.target)) {
                const list = document.getElementById('areaDropdownList');
                list.classList.remove('open-left', 'open-right');
            }

            if (assigneeWrapper && !assigneeWrapper.contains(e.target)) {
                const list = document.getElementById('assigneeDropdownList');
                list.classList.remove('open-left', 'open-right');
            }
        });

        function uploadAttachment() {
            vscode.postMessage({ command: 'uploadAttachment' });
        }

        function downloadAttachment(url, name) {
            vscode.postMessage({ command: 'downloadAttachment', url, name });
        }

        function deleteAttachment(url) {
            vscode.postMessage({ command: 'deleteAttachment', url });
        }

        // Tag Management
        const existingTags = ${JSON.stringify(this._existingTags)};
        let currentTags = ${tags ? JSON.stringify(tags.split(';').map((t: string) => t.trim()).filter((t: string) => t)) : '[]'};
        let selectedSuggestionIndex = -1;

        function getCurrentTagsString() {
            return currentTags.join('; ');
        }

        function updateTagsBackend() {
            const tagsString = getCurrentTagsString();
            vscode.postMessage({ command: 'updateTags', tags: tagsString });
        }

        function removeTag(tagName) {
            currentTags = currentTags.filter(t => t !== tagName);
            renderTags();
            updateTagsBackend();
        }

        function addTag(tagName) {
            const trimmed = tagName.trim();
            if (trimmed && !currentTags.includes(trimmed)) {
                currentTags.push(trimmed);
                renderTags();
                updateTagsBackend();
            }
        }

        function renderTags() {
            const display = document.getElementById('tagsDisplay');
            const input = document.getElementById('tagInput');
            const currentValue = input.value;

            display.innerHTML = currentTags.map(tag =>
                \`<span class="tag-chip-editable">\${escapeHtml(tag)}<button class="tag-remove" onclick="removeTag('\${escapeHtml(tag)}')">×</button></span>\`
            ).join('') + \`<input type="text" class="tag-input" id="tagInput" placeholder="Add tag..." oninput="handleTagInput()" onkeydown="handleTagKeydown(event)" onfocus="showTagSuggestions()" onblur="hideTagSuggestions()">\`;

            const newInput = document.getElementById('tagInput');
            newInput.value = currentValue;
            newInput.focus();
        }

        function handleTagInput() {
            const input = document.getElementById('tagInput');
            const query = input.value.toLowerCase();
            const suggestions = document.getElementById('tagSuggestions');

            if (!query) {
                suggestions.innerHTML = existingTags.slice(0, 10).map(tag =>
                    \`<div class="tag-suggestion-item" onmousedown="selectTag('\${escapeHtml(tag)}')">\${escapeHtml(tag)}</div>\`
                ).join('');
            } else {
                const filtered = existingTags.filter(tag =>
                    tag.toLowerCase().includes(query) && !currentTags.includes(tag)
                );

                if (filtered.length > 0) {
                    suggestions.innerHTML = filtered.slice(0, 10).map(tag =>
                        \`<div class="tag-suggestion-item" onmousedown="selectTag('\${escapeHtml(tag)}')">\${escapeHtml(tag)}</div>\`
                    ).join('');
                } else if (query.length > 0) {
                    suggestions.innerHTML = \`<div class="tag-suggestion-item" onmousedown="selectTag('\${escapeHtml(query)}')">Create: \${escapeHtml(query)}</div>\`;
                } else {
                    suggestions.innerHTML = '';
                }
            }

            selectedSuggestionIndex = -1;
            updateSelectedSuggestion();
            suggestions.classList.add('show');
        }

        function handleTagKeydown(event) {
            const input = document.getElementById('tagInput');
            const suggestions = document.getElementById('tagSuggestions');
            const items = suggestions.querySelectorAll('.tag-suggestion-item');

            if (event.key === 'Enter') {
                event.preventDefault();
                if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
                    const tagText = items[selectedSuggestionIndex].textContent;
                    const tag = tagText.startsWith('Create: ') ? tagText.substring(8) : tagText;
                    addTag(tag);
                    input.value = '';
                    handleTagInput();
                } else if (input.value.trim()) {
                    addTag(input.value.trim());
                    input.value = '';
                    handleTagInput();
                }
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (selectedSuggestionIndex < items.length - 1) {
                    selectedSuggestionIndex++;
                    updateSelectedSuggestion();
                }
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (selectedSuggestionIndex > 0) {
                    selectedSuggestionIndex--;
                    updateSelectedSuggestion();
                }
            } else if (event.key === 'Escape') {
                suggestions.classList.remove('show');
            } else if (event.key === 'Backspace' && !input.value && currentTags.length > 0) {
                currentTags.pop();
                renderTags();
                updateTagsBackend();
            }
        }

        function updateSelectedSuggestion() {
            const items = document.querySelectorAll('.tag-suggestion-item');
            items.forEach((item, index) => {
                if (index === selectedSuggestionIndex) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        function selectTag(tagName) {
            addTag(tagName);
            const input = document.getElementById('tagInput');
            input.value = '';
            handleTagInput();
        }

        function showTagSuggestions() {
            handleTagInput();
        }

        function hideTagSuggestions() {
            setTimeout(() => {
                document.getElementById('tagSuggestions').classList.remove('show');
            }, 200);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }

    private formatRelativeTime(dateStr: string): string {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        const weeks = Math.floor(days / 7);
        if (weeks < 4) return `${weeks}w ago`;
        return date.toLocaleDateString();
    }

    private getWorkItemTypeIcon(type: string): string {
        // Use SVG icons with Azure DevOps standard colors
        switch(type) {
            case 'User Story':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="20" height="20"><path fill="#4396C2" d="M320 352c-22.846 0-60.713 5.861-80 16.588V55.635C257.752 40.563 296.084 32 320 32h64v320h-64zm-192 32H32V64H0v352h208s-16-32-80-32zM64 32v320h64c22.848 0 60.707 5.865 80 16.594V55.635C190.244 40.561 151.902 32 128 32H64zm352 32v320h-96c-64 0-80 32-80 32h208V64h-32z" /></svg>`;

            case 'Feature':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="20" height="20"><path fill="#773B93" d="M145.619 384H128c-17.674 0-32 14.326-32 32v32h256v-32c0-17.674-14.327-32-32-32h-17.619c-7.434-36.47-39.75-64-78.381-64s-70.947 27.53-78.381 64zM224 352c20.832 0 38.425 13.418 45.053 32h-90.106c6.627-18.582 24.221-32 45.053-32zM352 64V32H96v32H32v80c0 40.051 29.686 73.018 68.153 78.8C114.003 278.531 163.984 320 224 320c60.016 0 109.997-41.469 123.846-97.2C386.313 217.018 416 184.051 416 144V64h-64zM96 189.053C77.417 182.426 64 164.832 64 144V96h32v93.053zM384 144c0 20.832-13.418 38.426-32 45.053V96h32v48z" /></svg>`;

            case 'Epic':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="20" height="20"><path fill="#FF8C00" d="M448 96c0 17.672-14.326 32-32 32v288H32V128c-17.674 0-32-14.328-32-32 0-17.674 14.326-32 32-32s32 14.326 32 32c0 11.191-6.094 20.564-14.797 26.283L136.727 256 216.79 94.543C202.699 91.191 192 79.113 192 64c0-17.674 14.326-32 32-32s32 14.326 32 32c0 15.113-10.699 27.191-24.789 30.543L311.273 256l87.523-133.717C390.094 116.564 384 107.191 384 96c0-17.674 14.326-32 32-32s32 14.326 32 32z" /></svg>`;

            case 'Task':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="20" height="20"><path fill="#FFC107" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zM128 96h64V64c0-17.641 14.359-32 32-32s32 14.359 32 32v32h64v32H128V96zm56 287.758l-79.844-79.828 31.688-31.688L184 320.414l128.156-128.172 31.688 31.688L184 383.758z" /></svg>`;

            case 'Issue':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="20" height="20"><path fill="#28A745" d="M320 64h-32c0-35.297-28.703-64-64-64s-64 28.703-64 64H64v384h320V64h-64zm-71.469 352h-49.063v-49.094h49.063V416zm0-84.109h-49.063V164.109h49.063v167.782zM320 128H128V96h64V64c0-17.643 14.357-32 32-32 17.641 0 32 14.357 32 32v32h64v32z" /></svg>`;

            case 'Bug':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" width="20" height="20"><path fill="#CC293D" d="M352 224c0-17.672 14.328-32 32-32h32v-32h-32c-8.828 0-16.938 2.797-23.656 7.516C350.391 140.234 324.078 120 293 120.781 287.016 108.297 275.547 99.828 262 96.781V64h32V32h-96v32h32v32.781c-13.547 3.047-25.016 11.516-31 24-31.078.781-57.391 21.016-67.344 48.297C125.938 163.797 117.828 161 109 161H77v32h32c17.672 0 32 14.328 32 32v32c0 17.672-14.328 32-32 32H77v32h32c8.828 0 16.938-2.797 23.656-7.516C142.609 340.766 168.922 361 200 360.219c5.984 12.484 17.453 20.953 31 24V417h-32v32h96v-32h-32v-32.781c13.547-3.047 25.016-11.516 31-24 31.078-.781 57.391-21.016 67.344-48.297C366.062 317.203 374.172 320 383 320h32v-32h-32c-17.672 0-32-14.328-32-32v-32zm-80 48c-26.469 0-48-21.531-48-48s21.531-48 48-48 48 21.531 48 48-21.531 48-48 48z" /></svg>`;

            default:
                return type;
        }
    }

    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    private sanitizeHtml(html: string): string {
        // Allow safe HTML tags for rich text display
        const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'img'];
        const allowedAttributes: Record<string, string[]> = {
            'a': ['href', 'title', 'data-vss-mention'],
            'span': ['style', 'class'],
            'div': ['style', 'class'],
            'p': ['class'],
            'img': ['src', 'alt', 'width', 'height'],
            'li': ['class']
        };

        // Basic sanitization - remove script tags and dangerous attributes
        let sanitized = html
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/javascript:/gi, '');

        return sanitized;
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

    private getFileIcon(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const iconMap: Record<string, string> = {
            'pdf': '📄',
            'doc': '📝', 'docx': '📝',
            'xls': '📊', 'xlsx': '📊',
            'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️',
            'zip': '📦', 'rar': '📦',
            'txt': '📃', 'md': '📃',
            'js': '💻', 'ts': '💻', 'py': '💻'
        };
        return iconMap[ext] || '📎';
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    private getInitials(name: string): string {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    private getAvatarColor(name: string): string {
        const colors = ['#0078d4', '#8764b8', '#00b7c3', '#8cbd18', '#ffb900', '#d13438', '#00cc6a', '#e3008c'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    public dispose() {
        // Unsubscribe from events
        if (this.eventSubscription) {
            this.eventSubscription.dispose();
            this.eventSubscription = null;
        }

        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
