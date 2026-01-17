import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem } from '../models/workItem';

interface IterationInfo {
    id: string;
    name: string;
    path: string;
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
                    case 'updateField':
                        await this.updateField(message.field, message.value);
                        break;
                    case 'updateTags':
                        await this.updateTags(message.tags);
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
                // Convert markdown to HTML for Azure DevOps
                const htmlDescription = this.markdownToHtml(data.description);
                patchDocument.push({
                    op: htmlDescription ? 'replace' : 'remove',
                    path: '/fields/System.Description',
                    value: htmlDescription
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

            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [patchOp],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            vscode.window.showInformationMessage('Field updated');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update field: ${error}`);
        }
    }

    private async updateTags(tags: string[]) {
        if (!this._workItem) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            const tagsValue = tags.filter(t => t.trim()).join('; ');
            const patchOp = tagsValue
                ? { op: 'replace', path: '/fields/System.Tags', value: tagsValue }
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

            // Read file content
            const fs = require('fs');
            const fileContent = fs.readFileSync(filePath);

            // Upload attachment to Azure DevOps
            const uploadResponse = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/attachments`,
                fileContent,
                {
                    params: {
                        fileName: fileName,
                        'api-version': '7.0'
                    },
                    headers: {
                        'Content-Type': 'application/octet-stream'
                    }
                }
            );

            const attachmentUrl = uploadResponse.data.url;

            // Link attachment to work item
            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [{
                    op: 'add',
                    path: '/relations/-',
                    value: {
                        rel: 'AttachedFile',
                        url: attachmentUrl,
                        attributes: {
                            comment: `Uploaded from VS Code: ${fileName}`
                        }
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

            const response = await axiosInstance.get(url, {
                responseType: 'arraybuffer'
            });

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

            // Find the relation index for this attachment
            const relations = this._workItem.relations || [];
            const relationIndex = relations.findIndex((r: any) => r.url === url);

            if (relationIndex === -1) {
                vscode.window.showErrorMessage('Attachment not found');
                return;
            }

            // Remove the relation
            await axiosInstance.patch(
                `/_apis/wit/workitems/${this._workItem.id}`,
                [{
                    op: 'remove',
                    path: `/relations/${relationIndex}`
                }],
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );

            vscode.window.showInformationMessage('Attachment removed');
            await this.refreshWorkItem();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to remove attachment: ${error}`);
        }
    }

    private async addComment(comment: string) {
        if (!this._workItem || !comment.trim()) return;

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return;

            // Convert markdown to HTML for Azure DevOps
            const htmlComment = this.markdownToHtml(comment);

            await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workItems/${this._workItem.id}/comments`,
                { text: htmlComment },
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
            this.getLinkedItems(),
            this.getIterations(),
            this.getAreas(),
            this.getTeamMembers(),
            this.getExistingTags(),
            this.getAttachments()
        ]).then(([comments, linkedItems, iterations, areas, teamMembers, existingTags, attachments]) => {
            this._iterations = iterations;
            this._areas = areas;
            this._teamMembers = teamMembers;
            this._existingTags = existingTags;
            this._panel.webview.html = this._getHtmlForWebview(comments, linkedItems, attachments);
        });
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
                    // Extract file name from URL or attributes
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

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations`,
                { params: { 'api-version': '7.0' } }
            );

            return (response.data.value || []).map((iter: any) => ({
                id: iter.id,
                name: iter.name,
                path: iter.path
            }));
        } catch (error) {
            console.error('Failed to load iterations:', error);
            return [];
        }
    }

    private async getAreas(): Promise<AreaInfo[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return [];

            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/classificationnodes/Areas`,
                { params: { '$depth': 10, 'api-version': '7.0' } }
            );

            const areas: AreaInfo[] = [];
            const extractAreas = (node: any, parentPath: string = '') => {
                const path = parentPath ? `${parentPath}\\${node.name}` : node.name;
                areas.push({ id: node.id?.toString() || '', name: node.name, path });
                if (node.children) {
                    node.children.forEach((child: any) => extractAreas(child, path));
                }
            };

            if (response.data) {
                extractAreas(response.data);
            }

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

            if (!axiosInstance || !config?.defaultProject || !config?.defaultTeam) return [];

            const response = await axiosInstance.get(
                `/_apis/projects/${encodeURIComponent(config.defaultProject)}/teams/${encodeURIComponent(config.defaultTeam)}/members`,
                { params: { 'api-version': '7.0' } }
            );

            return (response.data.value || []).map((member: any) => ({
                id: member.identity?.id || '',
                displayName: member.identity?.displayName || '',
                uniqueName: member.identity?.uniqueName || ''
            }));
        } catch (error) {
            console.error('Failed to load team members:', error);
            return [];
        }
    }

    private async getExistingTags(): Promise<string[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) return [];

            // Query recent work items to get existing tags - removed the <> operator that causes error
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

    private _getHtmlForWebview(comments: any[] = [], linkedItems: any[] = [], attachments: any[] = []): string {
        if (!this._workItem) return '<html><body><p>No work item loaded</p></body></html>';

        const fields = this._workItem.fields;
        const title = this.escapeHtml(fields['System.Title'] || '');
        const description = fields['System.Description'] || '';
        const state = fields['System.State'] || '';
        const type = fields['System.WorkItemType'] || '';
        const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';
        const assignedToUniqueName = fields['System.AssignedTo']?.uniqueName || '';
        const createdDate = new Date(fields['System.CreatedDate']).toLocaleDateString();
        const changedDate = new Date(fields['System.ChangedDate']).toLocaleDateString();
        const priority = fields['Microsoft.VSTS.Common.Priority'] || 0;
        const effort = fields['Microsoft.VSTS.Scheduling.Effort'] || (fields as any)['Microsoft.VSTS.Scheduling.StoryPoints'] || '';
        const iterationPath = fields['System.IterationPath'] || '';
        const iterationPathDisplay = iterationPath.split('\\').pop() || 'None';
        const areaPath = fields['System.AreaPath'] || '';
        const areaPathDisplay = areaPath.split('\\').pop() || 'None';
        const tags = fields['System.Tags'] || '';
        const tagsArray = tags ? tags.split(';').map((t: string) => t.trim()).filter((t: string) => t) : [];

        // JSON data for dropdowns
        const iterationsJson = JSON.stringify(this._iterations);
        const areasJson = JSON.stringify(this._areas);
        const teamMembersJson = JSON.stringify(this._teamMembers);
        const existingTagsJson = JSON.stringify(this._existingTags);
        const currentTagsJson = JSON.stringify(tagsArray);

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

        /* RICH TEXT EDITOR */
        .rich-editor-container {
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            overflow: hidden;
        }
        .rich-editor-toolbar {
            display: flex;
            gap: 4px;
            padding: 8px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-input-border);
            flex-wrap: wrap;
        }
        .toolbar-btn {
            padding: 4px 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .toolbar-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .toolbar-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .toolbar-separator {
            width: 1px;
            background: var(--vscode-input-border);
            margin: 0 4px;
        }
        .rich-editor-content {
            min-height: 150px;
            padding: 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
        }
        .rich-editor-content textarea {
            width: 100%;
            min-height: 150px;
            border: none;
            background: transparent;
            color: inherit;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            line-height: 1.5;
            resize: vertical;
            padding: 0;
        }
        .rich-editor-content textarea:focus {
            outline: none;
            box-shadow: none;
        }
        .rich-editor-preview {
            min-height: 150px;
            padding: 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            display: none;
        }
        .rich-editor-preview.show {
            display: block;
        }
        .rich-editor-preview h1 { font-size: 1.5em; margin: 0.5em 0; }
        .rich-editor-preview h2 { font-size: 1.3em; margin: 0.5em 0; }
        .rich-editor-preview h3 { font-size: 1.1em; margin: 0.5em 0; }
        .rich-editor-preview p { margin: 0.5em 0; }
        .rich-editor-preview ul, .rich-editor-preview ol { margin: 0.5em 0; padding-left: 1.5em; }
        .rich-editor-preview li { margin: 0.25em 0; }
        .rich-editor-preview code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', monospace;
            font-size: 0.9em;
        }
        .rich-editor-preview pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
        }
        .rich-editor-preview pre code {
            padding: 0;
            background: transparent;
        }
        .rich-editor-preview blockquote {
            border-left: 3px solid var(--vscode-focusBorder);
            margin: 0.5em 0;
            padding-left: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .rich-editor-preview strong { font-weight: 700; }
        .rich-editor-preview em { font-style: italic; }
        .rich-editor-preview a { color: var(--vscode-textLink-foreground); }
        
        /* Formatted text in comments */
        .formatted-text {
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        .formatted-text strong, .formatted-text b {
            font-weight: 700;
        }
        .formatted-text em, .formatted-text i {
            font-style: italic;
        }
        .formatted-text u {
            text-decoration: underline;
        }
        .formatted-text code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', monospace;
            font-size: 0.9em;
        }
        .formatted-text pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .formatted-text pre code {
            padding: 0;
            background: transparent;
        }
        .formatted-text blockquote {
            border-left: 3px solid var(--vscode-focusBorder);
            margin: 8px 0;
            padding-left: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .formatted-text ul, .formatted-text ol {
            margin: 8px 0;
            padding-left: 2em;
        }
        .formatted-text li {
            margin: 4px 0;
        }
        .formatted-text h1, .formatted-text h2, .formatted-text h3,
        .formatted-text h4, .formatted-text h5, .formatted-text h6 {
            margin: 12px 0 8px 0;
            font-weight: 700;
        }
        .formatted-text h1 { font-size: 1.5em; }
        .formatted-text h2 { font-size: 1.3em; }
        .formatted-text h3 { font-size: 1.1em; }
        
        /* Rich Editor with Preview */
        .rich-editor-container {
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .rich-editor-content {
            display: flex;
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        #description {
            flex: 1;
            min-height: 200px;
            padding: 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: none;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            resize: vertical;
            transition: all 0.2s;
        }
        #description:focus {
            outline: none;
        }
        .preview-pane {
            flex: 1;
            padding: 12px;
            background: var(--vscode-editor-background);
            border-left: 1px solid var(--vscode-input-border);
            overflow-y: auto;
            font-size: 14px;
            line-height: 1.6;
        }
        .preview-pane.hidden {
            display: none;
        }
        .preview-content {
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        .preview-content h1 {
            font-size: 1.8em;
            font-weight: 700;
            margin: 16px 0 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }
        .preview-content h2 {
            font-size: 1.5em;
            font-weight: 700;
            margin: 14px 0 6px 0;
        }
        .preview-content h3 {
            font-size: 1.2em;
            font-weight: 700;
            margin: 12px 0 4px 0;
        }
        .preview-content p {
            margin: 8px 0;
        }
        .preview-content strong, .preview-content b {
            font-weight: 700;
        }
        .preview-content em, .preview-content i {
            font-style: italic;
        }
        .preview-content s, .preview-content del {
            text-decoration: line-through;
        }
        .preview-content code {
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textCodeBlock-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', monospace;
            font-size: 0.9em;
        }
        .preview-content pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .preview-content pre code {
            padding: 0;
            background: transparent;
            font-size: 1em;
        }
        .preview-content blockquote {
            border-left: 3px solid var(--vscode-focusBorder);
            margin: 8px 0;
            padding-left: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .preview-content ul, .preview-content ol {
            margin: 8px 0;
            padding-left: 2em;
        }
        .preview-content li {
            margin: 4px 0;
        }
        .preview-content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        .preview-content a:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        .preview-content hr {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 16px 0;
        }
        
        .mode-tabs {
            display: flex;
            margin-left: auto;
        }
        .mode-tab {
            padding: 4px 12px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.7;
            transition: all 0.2s;
        }
        .mode-tab:hover {
            opacity: 1;
        }
        .mode-tab.active {
            opacity: 1;
            border-bottom: 2px solid var(--vscode-focusBorder);
        }

        /* ATTACHMENTS */
        .attachments-section {
            margin-top: 16px;
        }
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
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            margin-right: 6px;
            margin-bottom: 6px;
        }
        .tag-chip .remove-tag {
            cursor: pointer;
            opacity: 0.7;
            font-size: 14px;
            line-height: 1;
            margin-left: 2px;
        }
        .tag-chip .remove-tag:hover {
            opacity: 1;
        }

        /* EDITABLE FIELDS */
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
        }
        .meta-select:hover {
            border-color: var(--vscode-focusBorder);
        }
        .meta-select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
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

        /* TAG INPUT */
        .tags-container {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px;
            padding: 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            min-height: 42px;
        }
        .tags-container:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }
        .tag-input {
            flex: 1;
            min-width: 100px;
            border: none;
            background: transparent;
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: 12px;
            padding: 4px;
            outline: none;
        }
        .tag-suggestions {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 6px;
            max-height: 150px;
            overflow-y: auto;
            z-index: 100;
            display: none;
        }
        .tag-suggestions.show {
            display: block;
        }
        .tag-suggestion {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
        }
        .tag-suggestion:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .tags-wrapper {
            position: relative;
            grid-column: span 2;
        }
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
        .comment-toolbar {
            display: flex;
            gap: 4px;
            padding: 8px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-bottom: none;
            border-radius: 6px 6px 0 0;
            flex-wrap: wrap;
        }
        .comment-input-area {
            display: flex;
            gap: 12px;
            align-items: flex-start;
        }
        .comment-input-area textarea {
            flex: 1;
            min-height: 80px;
            border-radius: 0 0 6px 6px;
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
                <div class="rich-editor-container">
                    <div class="rich-editor-toolbar">
                        <button class="toolbar-btn" onclick="insertMarkdown('**', '**')" title="Bold"><b>B</b></button>
                        <button class="toolbar-btn" onclick="insertMarkdown('_', '_')" title="Italic"><i>I</i></button>
                        <button class="toolbar-btn" onclick="insertMarkdown('~~', '~~')" title="Strikethrough"><s>S</s></button>
                        <span class="toolbar-separator"></span>
                        <button class="toolbar-btn" onclick="insertMarkdown('# ', '\\n')" title="Heading">H</button>
                        <button class="toolbar-btn" onclick="insertMarkdown('- ', '\\n')" title="Bullet List">•</button>
                        <button class="toolbar-btn" onclick="insertMarkdown('1. ', '\\n')" title="Numbered List">1.</button>
                        <span class="toolbar-separator"></span>
                        <button class="toolbar-btn" onclick="insertMarkdown('[', '](url)')" title="Link">🔗</button>
                        <button class="toolbar-btn" onclick="insertMarkdown('${String.fromCharCode(96)}', '${String.fromCharCode(96)}')" title="Inline Code">&lt;/&gt;</button>
                        <button class="toolbar-btn" onclick="insertMarkdown('${String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96)}\\n', '\\n${String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96)}')" title="Code Block">{ }</button>
                        <button class="toolbar-btn" onclick="insertMarkdown('> ', '\\n')" title="Quote">❝</button>
                        <span class="toolbar-separator"></span>
                        <button class="toolbar-btn" id="previewToggle" onclick="togglePreview()" title="Preview">👁️</button>
                    </div>
                    <div class="rich-editor-content" id="editorContent">
                        <textarea id="description" placeholder="Write your description using Markdown formatting..." onkeyup="updatePreview()">${this.escapeHtml(description)}</textarea>
                        <div id="previewPane" class="preview-pane hidden">
                            <div id="previewContent" class="preview-content"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="action-bar">
                <button class="btn-primary" onclick="saveWorkItem()">💾 Save Changes</button>
                <button class="btn-secondary" onclick="openInBrowser()">🌐 Open in Browser</button>
                <button class="btn-secondary" onclick="refresh()">🔄 Refresh</button>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Metadata (Editable)</div>
            <div class="metadata-grid">
                <div class="meta-item">
                    <span class="meta-label">Assigned To</span>
                    <select class="meta-select" id="assigneeSelect" onchange="updateAssignee()">
                        <option value="">Unassigned</option>
                        ${this._teamMembers.map(m => `<option value="${this.escapeHtml(m.uniqueName)}" ${m.uniqueName === assignedToUniqueName ? 'selected' : ''}>${this.escapeHtml(m.displayName)}</option>`).join('')}
                    </select>
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
                <div class="meta-item">
                    <span class="meta-label">State</span>
                    <span class="meta-value">${this.escapeHtml(state)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Sprint</span>
                    <select class="meta-select" id="sprintSelect" onchange="updateSprint()">
                        <option value="">None</option>
                        ${this._iterations.map(iter => `<option value="${this.escapeHtml(iter.path)}" ${iter.path === iterationPath ? 'selected' : ''}>${this.escapeHtml(iter.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Area</span>
                    <select class="meta-select" id="areaSelect" onchange="updateArea()">
                        ${this._areas.map(area => `<option value="${this.escapeHtml(area.path)}" ${area.path === areaPath ? 'selected' : ''}>${this.escapeHtml(area.path)}</option>`).join('')}
                    </select>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Created</span>
                    <span class="meta-value">${createdDate}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Modified</span>
                    <span class="meta-value">${changedDate}</span>
                </div>
                <div class="tags-wrapper">
                    <span class="meta-label">Tags</span>
                    <div class="tags-container" id="tagsContainer" onclick="focusTagInput()">
                        ${tagsArray.map((t: string) => `<span class="tag-chip" data-tag="${this.escapeHtml(t)}">${this.escapeHtml(t)}<span class="remove-tag" onclick="removeTag('${this.escapeHtml(t)}', event)">×</span></span>`).join('')}
                        <input type="text" class="tag-input" id="tagInput" placeholder="Add tag..." onkeydown="handleTagKeydown(event)" oninput="showTagSuggestions()">
                    </div>
                    <div class="tag-suggestions" id="tagSuggestions"></div>
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
            <div class="card-title">💬 Add Comment</div>
            <div class="comment-toolbar">
                <button class="toolbar-btn" onclick="insertCommentMarkdown('**', '**')" title="Bold"><b>B</b></button>
                <button class="toolbar-btn" onclick="insertCommentMarkdown('_', '_')" title="Italic"><i>I</i></button>
                <button class="toolbar-btn" onclick="insertCommentMarkdown('~~', '~~')" title="Strikethrough"><s>S</s></button>
                <span class="toolbar-separator"></span>
                <button class="toolbar-btn" onclick="insertCommentMarkdown('- ', '\\n')" title="Bullet List">•</button>
                <button class="toolbar-btn" onclick="insertCommentMarkdown('1. ', '\\n')" title="Numbered List">1.</button>
                <button class="toolbar-btn" onclick="insertCommentMarkdown('[', '](url)')" title="Link">🔗</button>
                <button class="toolbar-btn" onclick="insertCommentMarkdown('${String.fromCharCode(96)}', '${String.fromCharCode(96)}')" title="Inline Code">&lt;/&gt;</button>
            </div>
            <div class="comment-input-area">
                <textarea id="comment" placeholder="Write an update using Markdown formatting..."></textarea>
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
                            <div class="timeline-text">${this.renderCommentHtml(c.text || '')}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const existingTags = ${existingTagsJson};
        let currentTags = ${currentTagsJson};

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

        // ========== RICH TEXT EDITOR ==========

        function markdownToHtml(markdown) {
            let html = markdown;
            
            // Escape HTML special characters first (but not our markdown markers)
            html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            // Headers
            html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
            
            // Bold
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
            
            // Italic
            html = html.replace(/_(.*?)_/g, '<em>$1</em>');
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            // Strikethrough
            html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
            
            // Code blocks - construct regex to avoid template literal issues
            var codeBlockRegex = new RegExp(String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96) + '([\\s\\S]*?)' + String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96), 'g');
            html = html.replace(codeBlockRegex, '<pre><code>$1</code></pre>');
            
            // Inline code
            var inlineCodeRegex = new RegExp(String.fromCharCode(96) + '([^' + String.fromCharCode(96) + ']+)' + String.fromCharCode(96), 'g');
            html = html.replace(inlineCodeRegex, '<code>$1</code>');
            
            // Links
            html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
            
            // Blockquotes
            html = html.replace(/^&gt; (.*?)$/gm, '<blockquote>$1</blockquote>');
            
            // Line breaks to paragraphs
            html = html.replace(/\n\n/g, '</p><p>');
            html = '<p>' + html + '</p>';
            html = html.replace(/<p><\/p>/g, '');
            
            return html;
        }

        function updatePreview() {
            const textarea = document.getElementById('description');
            const previewContent = document.getElementById('previewContent');
            const markdown = textarea.value;
            const html = markdownToHtml(markdown);
            previewContent.innerHTML = html;
        }

        function togglePreview() {
            const previewPane = document.getElementById('previewPane');
            const toggleBtn = document.getElementById('previewToggle');
            previewPane.classList.toggle('hidden');
            
            if (!previewPane.classList.contains('hidden')) {
                updatePreview();
                toggleBtn.style.opacity = '1';
            } else {
                toggleBtn.style.opacity = '0.5';
            }
        }

        function insertMarkdown(before, after) {
            const textarea = document.getElementById('description');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const selectedText = text.substring(start, end);

            const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
            textarea.value = newText;

            const cursorPos = start + before.length + selectedText.length;
            textarea.setSelectionRange(cursorPos, cursorPos);
            textarea.focus();
            updatePreview();
        }

        function insertCommentMarkdown(before, after) {
            const textarea = document.getElementById('comment');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const selectedText = text.substring(start, end);

            const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
            textarea.value = newText;

            const cursorPos = start + before.length + selectedText.length;
            textarea.setSelectionRange(cursorPos, cursorPos);
            textarea.focus();
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

        // ========== ATTACHMENT FUNCTIONS ==========

        function uploadAttachment() {
            vscode.postMessage({ command: 'uploadAttachment' });
        }

        function downloadAttachment(url, name) {
            vscode.postMessage({ command: 'downloadAttachment', url, name });
        }

        function deleteAttachment(url) {
            vscode.postMessage({ command: 'deleteAttachment', url });
        }

        // ========== INLINE EDIT FUNCTIONS ==========

        function updateAssignee() {
            const select = document.getElementById('assigneeSelect');
            vscode.postMessage({ command: 'assignTo', uniqueName: select.value });
        }

        function updatePriority(priority) {
            // Update UI immediately
            document.querySelectorAll('.priority-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('.priority-btn.p' + priority).classList.add('active');
            // Send update
            vscode.postMessage({ command: 'updateField', field: 'Microsoft.VSTS.Common.Priority', value: priority });
        }

        function updateEffort() {
            const input = document.getElementById('effortInput');
            const value = input.value ? parseFloat(input.value) : null;
            vscode.postMessage({ command: 'updateField', field: 'Microsoft.VSTS.Scheduling.Effort', value: value });
        }

        function updateSprint() {
            const select = document.getElementById('sprintSelect');
            vscode.postMessage({ command: 'updateField', field: 'System.IterationPath', value: select.value || null });
        }

        function updateArea() {
            const select = document.getElementById('areaSelect');
            vscode.postMessage({ command: 'updateField', field: 'System.AreaPath', value: select.value });
        }

        // ========== TAG MANAGEMENT ==========

        function focusTagInput() {
            document.getElementById('tagInput').focus();
        }

        function handleTagKeydown(event) {
            const input = document.getElementById('tagInput');
            const value = input.value.trim();

            if (event.key === 'Enter' && value) {
                event.preventDefault();
                addTag(value);
                input.value = '';
                hideSuggestions();
            } else if (event.key === 'Backspace' && !value && currentTags.length > 0) {
                // Remove last tag on backspace when input is empty
                removeTag(currentTags[currentTags.length - 1], event);
            } else if (event.key === 'Escape') {
                hideSuggestions();
            }
        }

        function addTag(tag) {
            if (!tag || currentTags.includes(tag)) return;
            currentTags.push(tag);
            renderTags();
            vscode.postMessage({ command: 'updateTags', tags: currentTags });
        }

        function removeTag(tag, event) {
            if (event) {
                event.stopPropagation();
            }
            currentTags = currentTags.filter(t => t !== tag);
            renderTags();
            vscode.postMessage({ command: 'updateTags', tags: currentTags });
        }

        function renderTags() {
            const container = document.getElementById('tagsContainer');
            const input = document.getElementById('tagInput');

            // Remove existing tag chips
            container.querySelectorAll('.tag-chip').forEach(chip => chip.remove());

            // Add tag chips before input
            currentTags.forEach(tag => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                chip.dataset.tag = tag;
                chip.innerHTML = tag + '<span class="remove-tag" onclick="removeTag(' + JSON.stringify(tag) + ', event)">×</span>';
                container.insertBefore(chip, input);
            });
        }

        function showTagSuggestions() {
            const input = document.getElementById('tagInput');
            const suggestionsDiv = document.getElementById('tagSuggestions');
            const value = input.value.toLowerCase().trim();

            if (!value) {
                hideSuggestions();
                return;
            }

            const matches = existingTags.filter(tag =>
                tag.toLowerCase().includes(value) && !currentTags.includes(tag)
            ).slice(0, 5);

            if (matches.length === 0) {
                hideSuggestions();
                return;
            }

            suggestionsDiv.innerHTML = matches.map(tag =>
                '<div class="tag-suggestion" onclick="selectTagSuggestion(' + JSON.stringify(tag) + ')">' + tag + '</div>'
            ).join('');
            suggestionsDiv.classList.add('show');
        }

        function selectTagSuggestion(tag) {
            addTag(tag);
            document.getElementById('tagInput').value = '';
            hideSuggestions();
        }

        function hideSuggestions() {
            document.getElementById('tagSuggestions').classList.remove('show');
        }

        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tags-wrapper')) {
                hideSuggestions();
            }
        });
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

    private renderCommentHtml(html: string): string {
        if (!html) return '';
        
        // Azure DevOps stores comments as HTML, so we need to render them safely
        // Remove script tags and their content completely
        let sanitized = html;
        sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // Remove event handlers
        sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
        sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
        
        // Remove dangerous attributes like href with javascript:
        sanitized = sanitized.replace(/href\s*=\s*["']?javascript:[^"'>\s]*["']?/gi, 'href="#"');
        
        // Return the sanitized HTML
        return sanitized;
    }

    private markdownToHtml(markdown: string): string {
        if (!markdown) return '';
        
        let html = markdown;
        
        // Headers (must be done before other replacements)
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
        
        // Code blocks (must be done before inline code and bold/italic)
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Bold (must be done before italic)
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/_(.*?)_/g, '<em>$1</em>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Strikethrough
        html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Links
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
        
        // Blockquotes
        html = html.replace(/^&gt; (.*?)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>');
        
        // Bullet lists
        html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Numbered lists  
        html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
        
        // Line breaks
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        html = '<p>' + html + '</p>';
        html = html.replace(/<p><\/p>/g, '');
        
        return html;
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
            'ppt': '📽️', 'pptx': '📽️',
            'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'bmp': '🖼️',
            'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
            'txt': '📃', 'md': '📃', 'json': '📃', 'xml': '📃',
            'js': '💻', 'ts': '💻', 'py': '💻', 'cs': '💻', 'java': '💻', 'cpp': '💻', 'c': '💻',
            'html': '🌐', 'css': '🎨',
            'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵',
            'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'mkv': '🎬'
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

    public dispose() {
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
