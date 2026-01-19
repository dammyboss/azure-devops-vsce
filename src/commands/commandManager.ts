import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItemProvider } from '../views/workItemProvider';
import { BacklogProvider } from '../views/backlogProvider';
import { BoardProvider } from '../views/boardProvider';
import { SprintProvider } from '../views/sprintProvider';
import { QueryProvider, Query } from '../views/queryProvider';
import { GitIntegration } from '../gitIntegration/gitIntegration';
import { StatusBarManager } from '../utils/statusBarManager';
import { WorkItemPanel } from '../views/workItemPanel';
import { BoardPanel } from '../views/boardPanel';
import { AzureDevOpsKanbanPanel } from '../boards/azureDevOpsKanban';
import { WorkItemTypeEnum } from '../models/workItem';
import { ConnectionSetupWizard } from '../authentication/connectionSetupWizard';
import { OrganizationManager } from '../authentication/organizationManager';
import { ConnectionStatusProvider } from '../authentication/connectionStatusProvider';

import { WorkItemLinksManager } from '../utils/workItemLinksManager';
import { SettingsUIProvider } from '../ai/settings-ui';

interface ExtensionComponents {
    authenticationManager: AuthenticationManager;
    workItemProvider: WorkItemProvider;
    backlogProvider: BacklogProvider;
    boardProvider: BoardProvider;
    sprintProvider: SprintProvider;
    queryProvider: QueryProvider;
    gitIntegration: GitIntegration;
    statusBarManager: StatusBarManager;
    extensionUri: vscode.Uri;
    workItemLinksManager: WorkItemLinksManager;
    connectionStatusProvider: any;
}

interface WorkItemQuickPickItem extends vscode.QuickPickItem {
    id: number;
}

interface TeamMemberQuickPickItem extends vscode.QuickPickItem {
    uniqueName: string;
}

export function registerCommands(context: vscode.ExtensionContext, components: ExtensionComponents): void {
    // Connect command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.connect', async () => {
            const connected = await components.authenticationManager.connect();
            if (connected) {
                // Set context for all views
                vscode.commands.executeCommand('setContext', 'azureDevOps.connected', true);

                components.statusBarManager.updateStatus('connected');
                
                // Refresh ALL views
                components.workItemProvider.refresh();
                components.backlogProvider.refresh();
                components.boardProvider.refresh();
                components.sprintProvider.refresh();
                components.queryProvider.refresh();
                components.connectionStatusProvider.refresh();
            } else {
                vscode.commands.executeCommand('setContext', 'azureDevOps.connected', false);
            }
        })
    );

    // Setup Wizard command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.setupWizard', async () => {
            try {
                const wizard = new ConnectionSetupWizard(
                    context,
                    components.authenticationManager,
                    new OrganizationManager(context)
                );

                const success = await wizard.runSetup();
                if (success) {
                    // Auto-connect after setup
                    const connected = await components.authenticationManager.autoConnect();
                    if (connected) {
                        vscode.commands.executeCommand('setContext', 'azureDevOps.connected', true);
                        components.statusBarManager.updateStatus('connected');
                        components.workItemProvider.refresh();
                        components.backlogProvider.refresh();
                        components.boardProvider.refresh();
                        components.sprintProvider.refresh();
                        components.queryProvider.refresh();
                        components.connectionStatusProvider.refresh();
                    }
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Setup wizard error: ${error.message}`);
            }
        })
    );

    // Disconnect command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.disconnect', async () => {
            await components.authenticationManager.disconnect();
            vscode.commands.executeCommand('setContext', 'azureDevOps.connected', false);
            components.statusBarManager.updateStatus('disconnected');
            
            // Refresh ALL views to show disconnected state
            components.workItemProvider.refresh();
            components.backlogProvider.refresh();
            components.boardProvider.refresh();
            components.sprintProvider.refresh();
            components.queryProvider.refresh();
            components.connectionStatusProvider.refresh();
        })
    );

    // Select project command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.selectProject', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            try {
                const projects = await components.authenticationManager.getProjects();
                const projectItems = projects.map(p => ({
                    label: p.name,
                    description: p.description || '',
                    id: p.id
                }));

                const selectedProject = await vscode.window.showQuickPick(projectItems, {
                    placeHolder: 'Select a project'
                });

                if (selectedProject) {
                    await vscode.workspace.getConfiguration('azureDevOps').update('defaultProject', selectedProject.label, true);

                    // Now select team
                    await vscode.commands.executeCommand('azureDevOps.selectTeam');

                    // Refresh all views
                    components.workItemProvider.refresh();
                    components.boardProvider.refresh();
                    components.sprintProvider.refresh();
                    components.queryProvider.refresh();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to get projects: ${error}`);
            }
        })
    );

    // Select team command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.selectTeam', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject) {
                vscode.window.showErrorMessage('Please select a project first');
                return;
            }

            try {
                const teams = await components.authenticationManager.getTeams(config.defaultProject);
                const teamItems = teams.map(t => ({
                    label: t.name,
                    description: t.description || '',
                    id: t.id
                }));

                const selectedTeam = await vscode.window.showQuickPick(teamItems, {
                    placeHolder: 'Select a team'
                });

                if (selectedTeam) {
                    await vscode.workspace.getConfiguration('azureDevOps').update('defaultTeam', selectedTeam.label, true);
                    vscode.window.showInformationMessage(`Selected team: ${selectedTeam.label}`);

                    // Refresh views
                    components.boardProvider.refresh();
                    components.sprintProvider.refresh();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to get teams: ${error}`);
            }
        })
    );

    // Create work item command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.createWorkItem', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const config = vscode.workspace.getConfiguration('azureDevOps');
            const defaultType = config.get<string>('defaultWorkItemType', 'Task');

            const workItemType = await vscode.window.showQuickPick(
                Object.values(WorkItemTypeEnum),
                {
                    placeHolder: 'Select work item type',
                    title: 'Create Work Item'
                }
            );

            if (!workItemType) {
                return;
            }

            const title = await vscode.window.showInputBox({
                prompt: 'Enter work item title',
                placeHolder: 'Work item title',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Title is required';
                    }
                    return null;
                }
            });

            if (!title) {
                return;
            }

            const description = await vscode.window.showInputBox({
                prompt: 'Enter description (optional)',
                placeHolder: 'Work item description'
            });

            const workItem = await components.workItemProvider.createWorkItem(workItemType, title, description);

            if (workItem) {
                // Invalidate cache and refresh to show new work item
                components.workItemProvider.refresh();
                
                const action = await vscode.window.showInformationMessage(
                    `Created ${workItemType} #${workItem.id}: ${title}`,
                    'Open in Browser',
                    'View Details',
                    'Create Branch'
                );

                if (action === 'Open in Browser') {
                    vscode.commands.executeCommand('azureDevOps.openWorkItem', workItem.id);
                } else if (action === 'View Details') {
                    vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', workItem.id);
                } else if (action === 'Create Branch') {
                    vscode.commands.executeCommand('azureDevOps.createBranchFromWorkItem', workItem.id);
                }
            }
        })
    );

    // Search work items command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.searchWorkItems', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const searchTerm = await vscode.window.showInputBox({
                prompt: 'Search work items',
                placeHolder: 'Enter search term (searches in title and description)'
            });

            if (!searchTerm) {
                return;
            }

            try {
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                const config = components.authenticationManager.getConfig();

                if (!axiosInstance || !config?.defaultProject) {
                    return;
                }

                // Use WIQL to search
                const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
                              FROM WorkItems
                              WHERE [System.TeamProject] = @project
                              AND ([System.Title] CONTAINS '${searchTerm}' OR [System.Description] CONTAINS '${searchTerm}')
                              ORDER BY [System.ChangedDate] DESC`;

                const response = await axiosInstance.post(`/${config.defaultProject}/_apis/wit/wiql`, {
                    query: wiql
                });

                const workItemRefs = response.data.workItems || [];

                if (workItemRefs.length === 0) {
                    vscode.window.showInformationMessage(`No work items found for: "${searchTerm}"`);
                    return;
                }

                // Get work item details
                const workItemIds = workItemRefs.slice(0, 50).map((item: any) => item.id).join(',');
                const detailsResponse = await axiosInstance.get(`/_apis/wit/workitems?ids=${workItemIds}&$expand=all`);
                const workItems = detailsResponse.data.value || [];

                // Show results in QuickPick
                const items: WorkItemQuickPickItem[] = workItems.map((item: any) => ({
                    label: `#${item.id}: ${item.fields['System.Title']}`,
                    description: `${item.fields['System.WorkItemType']} • ${item.fields['System.State']}`,
                    detail: item.fields['System.AssignedTo']?.displayName || 'Unassigned',
                    id: item.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Found ${items.length} work items`,
                    matchOnDescription: true,
                    matchOnDetail: true
                });

                if (selected) {
                    const action = await vscode.window.showQuickPick(
                        ['Open in Browser', 'View Details', 'Start Working', 'Create Branch'],
                        { placeHolder: `Actions for #${selected.id}` }
                    );

                    switch (action) {
                        case 'Open in Browser':
                            vscode.commands.executeCommand('azureDevOps.openWorkItem', selected.id);
                            break;
                        case 'View Details':
                            vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', selected.id);
                            break;
                        case 'Start Working':
                            components.statusBarManager.updateStatus('working', selected.id.toString());
                            vscode.window.showInformationMessage(`Started working on #${selected.id}`);
                            break;
                        case 'Create Branch':
                            vscode.commands.executeCommand('azureDevOps.createBranchFromWorkItem', selected.id);
                            break;
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Search failed: ${error}`);
            }
        })
    );

    // Refresh commands
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.refresh', () => {
            components.workItemProvider.refresh();
            components.boardProvider.refresh();
            components.sprintProvider.refresh();
            components.queryProvider.refresh();
            vscode.window.showInformationMessage('Azure DevOps data refreshed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.refreshWorkItems', () => {
            components.workItemProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.refreshBoards', () => {
            components.boardProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.refreshSprints', () => {
            components.sprintProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.refreshQueries', () => {
            components.queryProvider.refresh();
        })
    );

    // Open board in browser command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.openBoard', async (boardItem?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject || !config.defaultTeam) {
                vscode.window.showErrorMessage('Please select a project and team first');
                return;
            }

            let boardName = typeof boardItem?.label === 'string' ? boardItem.label : boardItem?.boardName;

            if (!boardName) {
                // Get available boards and let user select
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                try {
                    const response = await axiosInstance.get(
                        `/${config.defaultProject}/${config.defaultTeam}/_apis/work/boards`
                    );
                    const boards = response.data.value || [];

                    if (boards.length === 0) {
                        vscode.window.showInformationMessage('No boards found');
                        return;
                    }

                    interface BoardQuickPickItem extends vscode.QuickPickItem {
                        id: string;
                    }

                    const boardItems: BoardQuickPickItem[] = boards.map((b: any) => ({
                        label: b.name,
                        id: b.id
                    }));

                    const selected = await vscode.window.showQuickPick(boardItems, {
                        placeHolder: 'Select a board to open'
                    });

                    if (selected) {
                        boardName = selected.label;
                    } else {
                        return;
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to get boards: ${error}`);
                    return;
                }
            }

            const boardUrl = `${config.organizationUrl}/${config.defaultProject}/_boards/board/t/${config.defaultTeam}/${encodeURIComponent(boardName)}`;
            vscode.env.openExternal(vscode.Uri.parse(boardUrl));
        })
    );

    // Open Azure DevOps Kanban board
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.openAzureKanban', async (boardItem?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject || !config.defaultTeam) {
                vscode.window.showErrorMessage('Please select a project and team first');
                return;
            }

            const axiosInstance = components.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            try {
                let boardId = boardItem?.boardId;
                let boardName = boardItem?.boardName || boardItem?.label;

                if (!boardId) {
                    const boardsResponse = await axiosInstance.get(
                        `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards`
                    );
                    const boards = boardsResponse.data.value || [];

                    if (boards.length === 0) {
                        vscode.window.showInformationMessage('No boards found');
                        return;
                    }

                    const selected = await vscode.window.showQuickPick(
                        boards.map((b: any) => ({ label: b.name, id: b.id, name: b.name })),
                        { placeHolder: 'Select a board' }
                    );

                    if (!selected) return;
                    boardId = (selected as any).id;
                    boardName = (selected as any).name;
                }

                await AzureDevOpsKanbanPanel.show(components.authenticationManager, boardId, boardName);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open board: ${error}`);
            }
        })
    );

    // Open board panel (interactive Kanban) command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.openBoardPanel', async (boardItem?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject || !config.defaultTeam) {
                vscode.window.showErrorMessage('Please select a project and team first');
                return;
            }

            let boardId = boardItem?.boardId;
            let boardName = typeof boardItem?.label === 'string' ? boardItem.label : boardItem?.boardName;

            if (!boardId || !boardName) {
                // Get available boards and let user select
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                try {
                    const response = await axiosInstance.get(
                        `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/boards`
                    );
                    const boards = response.data.value || [];

                    if (boards.length === 0) {
                        vscode.window.showInformationMessage('No boards found');
                        return;
                    }

                    interface BoardQuickPickItem extends vscode.QuickPickItem {
                        id: string;
                        name: string;
                    }

                    const boardItems: BoardQuickPickItem[] = boards.map((b: any) => ({
                        label: b.name,
                        id: b.id,
                        name: b.name
                    }));

                    const selected = await vscode.window.showQuickPick(boardItems, {
                        placeHolder: 'Select a board to open'
                    });

                    if (selected) {
                        boardId = selected.id;
                        boardName = selected.name;
                    } else {
                        return;
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to get boards: ${error}`);
                    return;
                }
            }

            // Open the board panel
            BoardPanel.createOrShow(
                components.extensionUri,
                components.authenticationManager,
                boardId,
                boardName
            );
        })
    );

    // Open sprint in browser command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.openSprint', async (sprintItem?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject || !config.defaultTeam) {
                vscode.window.showErrorMessage('Please select a project and team first');
                return;
            }

            let sprintPath = sprintItem?.sprintPath || (typeof sprintItem?.label === 'string' ? sprintItem.label : undefined);

            if (!sprintPath) {
                // Get available sprints and let user select
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                try {
                    const response = await axiosInstance.get(
                        `/${config.defaultProject}/${config.defaultTeam}/_apis/work/teamsettings/iterations`
                    );
                    const sprints = response.data.value || [];

                    if (sprints.length === 0) {
                        vscode.window.showInformationMessage('No sprints found');
                        return;
                    }

                    interface SprintQuickPickItem extends vscode.QuickPickItem {
                        path: string;
                    }

                    const sprintItems: SprintQuickPickItem[] = sprints.map((s: any) => ({
                        label: s.name,
                        description: s.attributes?.startDate
                            ? `${new Date(s.attributes.startDate).toLocaleDateString()} - ${new Date(s.attributes.finishDate).toLocaleDateString()}`
                            : '',
                        path: s.path
                    }));

                    const selected = await vscode.window.showQuickPick(sprintItems, {
                        placeHolder: 'Select a sprint to open'
                    });

                    if (selected) {
                        sprintPath = selected.path || selected.label;
                    } else {
                        return;
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to get sprints: ${error}`);
                    return;
                }
            }

            const sprintUrl = `${config.organizationUrl}/${config.defaultProject}/_sprints/taskboard/${config.defaultTeam}/${encodeURIComponent(sprintPath)}`;
            vscode.env.openExternal(vscode.Uri.parse(sprintUrl));
        })
    );

    // Start working command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.startWorking', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;

            // If called from context menu with a work item
            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (!workItemId) {
                // Get work items assigned to current user
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                const config = components.authenticationManager.getConfig();

                if (!axiosInstance || !config?.defaultProject) {
                    return;
                }

                try {
                    const currentUser = await components.authenticationManager.getCurrentUser();
                    const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
                                  FROM WorkItems
                                  WHERE [System.TeamProject] = @project
                                  AND [System.AssignedTo] = '${currentUser.uniqueName}'
                                  AND [System.State] <> 'Closed'
                                  AND [System.State] <> 'Done'
                                  AND [System.State] <> 'Removed'
                                  ORDER BY [Microsoft.VSTS.Common.Priority], [System.ChangedDate] DESC`;

                    const response = await axiosInstance.post(`/${config.defaultProject}/_apis/wit/wiql`, {
                        query: wiql
                    });

                    const workItemRefs = response.data.workItems || [];

                    if (workItemRefs.length === 0) {
                        vscode.window.showInformationMessage('No active work items assigned to you');
                        return;
                    }

                    // Get detailed info
                    const workItemIds = workItemRefs.slice(0, 20).map((item: any) => item.id).join(',');
                    const detailsResponse = await axiosInstance.get(`/_apis/wit/workitems?ids=${workItemIds}`);
                    const workItems = detailsResponse.data.value || [];

                    const items: WorkItemQuickPickItem[] = workItems.map((wi: any) => ({
                        label: `#${wi.id}: ${wi.fields['System.Title']}`,
                        description: `${wi.fields['System.WorkItemType']} • ${wi.fields['System.State']}`,
                        id: wi.id
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: 'Select work item to start working on'
                    });

                    if (selected) {
                        workItemId = selected.id;
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to get work items: ${error}`);
                    return;
                }
            }

            if (workItemId) {
                components.statusBarManager.updateStatus('working', workItemId.toString());

                // Optionally update work item state to "In Progress" or "Active"
                const shouldUpdateState = await vscode.window.showQuickPick(
                    ['Yes', 'No'],
                    { placeHolder: 'Update work item state to "Active" or "In Progress"?' }
                );

                if (shouldUpdateState === 'Yes') {
                    try {
                        const axiosInstance = components.authenticationManager.getAxiosInstance();
                        if (axiosInstance) {
                            await axiosInstance.patch(
                                `/_apis/wit/workitems/${workItemId}`,
                                [{ op: 'replace', path: '/fields/System.State', value: 'Active' }],
                                { headers: { 'Content-Type': 'application/json-patch+json' } }
                            );
                        }
                    } catch (error) {
                        // State transition might fail if not valid, that's okay
                        console.log('Could not update state:', error);
                    }
                }

                vscode.window.showInformationMessage(`Started working on #${workItemId}`);
            }
        })
    );

    // Stop working command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.stopWorking', () => {
            const currentWorkItemId = components.statusBarManager.getCurrentWorkItemId();
            components.statusBarManager.updateStatus('connected');

            if (currentWorkItemId) {
                vscode.window.showInformationMessage(`Stopped working on #${currentWorkItemId}`);
            }
        })
    );

    // Open work item in browser command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.openWorkItem', async (workItemIdOrItem: number | any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number;

            if (typeof workItemIdOrItem === 'number') {
                workItemId = workItemIdOrItem;
            } else if (workItemIdOrItem?.workItemId) {
                workItemId = workItemIdOrItem.workItemId;
            } else {
                // Prompt for work item ID
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID',
                    placeHolder: '12345'
                });
                if (!input) return;
                workItemId = parseInt(input, 10);
                if (isNaN(workItemId)) {
                    vscode.window.showErrorMessage('Invalid work item ID');
                    return;
                }
            }

            const config = components.authenticationManager.getConfig();
            if (config) {
                const workItemUrl = `${config.organizationUrl}/${config.defaultProject}/_workitems/edit/${workItemId}`;
                vscode.env.openExternal(vscode.Uri.parse(workItemUrl));
            }
        })
    );

    // View work item details command (webview panel)
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.viewWorkItemDetails', async (workItemIdOrItem: number | any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number;

            if (typeof workItemIdOrItem === 'number') {
                workItemId = workItemIdOrItem;
            } else if (workItemIdOrItem?.workItemId) {
                workItemId = workItemIdOrItem.workItemId;
            } else {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID',
                    placeHolder: '12345'
                });
                if (!input) return;
                workItemId = parseInt(input, 10);
                if (isNaN(workItemId)) {
                    vscode.window.showErrorMessage('Invalid work item ID');
                    return;
                }
            }

            const workItem = await components.workItemProvider.getWorkItemById(workItemId);
            if (workItem) {
                WorkItemPanel.createOrShow(
                    components.extensionUri,
                    components.authenticationManager,
                    workItem
                );
            } else {
                vscode.window.showErrorMessage(`Work item #${workItemId} not found`);
            }
        })
    );

    // Edit work item command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.editWorkItem', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;

            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (!workItemId) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID to edit',
                    placeHolder: '12345'
                });
                if (!input) return;
                workItemId = parseInt(input, 10);
            }

            const workItem = await components.workItemProvider.getWorkItemById(workItemId);
            if (!workItem) {
                vscode.window.showErrorMessage(`Work item #${workItemId} not found`);
                return;
            }

            const newTitle = await vscode.window.showInputBox({
                prompt: 'Edit title',
                value: workItem.fields['System.Title'],
                validateInput: (value) => value ? null : 'Title is required'
            });

            if (newTitle === undefined) return;

            try {
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                const patchDocument = [];

                if (newTitle !== workItem.fields['System.Title']) {
                    patchDocument.push({
                        op: 'replace',
                        path: '/fields/System.Title',
                        value: newTitle
                    });
                }

                if (patchDocument.length > 0) {
                    await axiosInstance.patch(
                        `/_apis/wit/workitems/${workItemId}`,
                        patchDocument,
                        { headers: { 'Content-Type': 'application/json-patch+json' } }
                    );

                    vscode.window.showInformationMessage(`Work item #${workItemId} updated`);
                    components.workItemProvider.refresh();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to update work item: ${error}`);
            }
        })
    );

    // Change work item state command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.changeWorkItemState', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;

            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (!workItemId) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID',
                    placeHolder: '12345'
                });
                if (!input) return;
                workItemId = parseInt(input, 10);
            }

            try {
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                // Get work item to find its type and current state
                const wiResponse = await axiosInstance.get(`/_apis/wit/workitems/${workItemId}`);
                const workItemType = wiResponse.data.fields['System.WorkItemType'];
                const currentState = wiResponse.data.fields['System.State'];

                // Get valid states for this work item type
                const config = components.authenticationManager.getConfig();
                if (!config?.defaultProject) return;

                const statesResponse = await axiosInstance.get(
                    `/${encodeURIComponent(config.defaultProject)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/states`
                );

                const validStates = statesResponse.data.value.map((s: any) => s.name);

                const newState = await vscode.window.showQuickPick(validStates, {
                    placeHolder: `Select new state (current: ${currentState})`
                });

                if (!newState) return;

                await axiosInstance.patch(
                    `/_apis/wit/workitems/${workItemId}`,
                    [{ op: 'replace', path: '/fields/System.State', value: newState }],
                    { headers: { 'Content-Type': 'application/json-patch+json' } }
                );

                vscode.window.showInformationMessage(`Work item #${workItemId} state changed to: ${newState}`);
                components.workItemProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to change state: ${error}`);
            }
        })
    );

    // Assign work item command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.assignWorkItem', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;

            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (!workItemId) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID',
                    placeHolder: '12345'
                });
                if (!input) return;
                workItemId = parseInt(input, 10);
            }

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject || !config.defaultTeam) {
                vscode.window.showErrorMessage('Please select a project and team first');
                return;
            }

            try {
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                // Get team members
                const membersResponse = await axiosInstance.get(
                    `/_apis/projects/${config.defaultProject}/teams/${config.defaultTeam}/members`
                );
                const members = membersResponse.data.value || [];

                const memberItems: TeamMemberQuickPickItem[] = [
                    { label: 'Unassigned', description: 'Remove assignment', uniqueName: '' },
                    ...members.map((m: any) => ({
                        label: m.identity.displayName,
                        description: m.identity.uniqueName,
                        uniqueName: m.identity.uniqueName
                    }))
                ];

                const selected = await vscode.window.showQuickPick(memberItems, {
                    placeHolder: 'Select team member to assign'
                });

                if (selected === undefined) return;

                const patchValue = selected.uniqueName || null;
                const patchOp = patchValue ? 'replace' : 'remove';

                await axiosInstance.patch(
                    `/_apis/wit/workitems/${workItemId}`,
                    [{ op: patchOp, path: '/fields/System.AssignedTo', value: patchValue }],
                    { headers: { 'Content-Type': 'application/json-patch+json' } }
                );

                vscode.window.showInformationMessage(
                    patchValue
                        ? `Work item #${workItemId} assigned to ${selected.label}`
                        : `Work item #${workItemId} unassigned`
                );
                components.workItemProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to assign work item: ${error}`);
            }
        })
    );

    // ========== BULK OPERATIONS ==========

    // Bulk change state command (works with multi-select)
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.bulkChangeState', async (...args: any[]) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            // Get selected work items - can come from context menu (single item) or multi-select
            const workItemIds: number[] = [];

            // Handle different argument formats
            if (args.length > 0) {
                // First arg might be the clicked item, rest might be selected items
                const items = args.flat();
                for (const item of items) {
                    if (item?.workItemId) {
                        workItemIds.push(item.workItemId);
                    } else if (typeof item === 'number') {
                        workItemIds.push(item);
                    }
                }
            }

            if (workItemIds.length === 0) {
                vscode.window.showWarningMessage('No work items selected');
                return;
            }

            // Remove duplicates
            const uniqueIds = [...new Set(workItemIds)];

            // Show state picker with common states
            const states = ['New', 'To Do', 'Active', 'In Progress', 'Resolved', 'Done', 'Closed'];
            const newState = await vscode.window.showQuickPick(states, {
                placeHolder: `Select new state for ${uniqueIds.length} work item(s)`
            });

            if (!newState) return;

            const axiosInstance = components.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            let successCount = 0;
            let errorCount = 0;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Changing state of ${uniqueIds.length} work items...`,
                cancellable: true
            }, async (progress, token) => {
                for (let i = 0; i < uniqueIds.length; i++) {
                    if (token.isCancellationRequested) break;

                    progress.report({ increment: 100 / uniqueIds.length, message: `${i + 1}/${uniqueIds.length}` });

                    try {
                        await axiosInstance.patch(
                            `/_apis/wit/workitems/${uniqueIds[i]}`,
                            [{ op: 'replace', path: '/fields/System.State', value: newState }],
                            { headers: { 'Content-Type': 'application/json-patch+json' } }
                        );
                        successCount++;
                    } catch (error) {
                        errorCount++;
                        console.error(`Failed to update work item ${uniqueIds[i]}:`, error);
                    }
                }
            });

            if (successCount > 0) {
                vscode.window.showInformationMessage(`Changed state to "${newState}" for ${successCount} work item(s)${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
                components.workItemProvider.refresh();
            } else {
                vscode.window.showErrorMessage('Failed to change state for any work items');
            }
        })
    );

    // Bulk assign command (works with multi-select)
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.bulkAssign', async (...args: any[]) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            // Get selected work items
            const workItemIds: number[] = [];
            const items = args.flat();
            for (const item of items) {
                if (item?.workItemId) {
                    workItemIds.push(item.workItemId);
                } else if (typeof item === 'number') {
                    workItemIds.push(item);
                }
            }

            if (workItemIds.length === 0) {
                vscode.window.showWarningMessage('No work items selected');
                return;
            }

            const uniqueIds = [...new Set(workItemIds)];

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject || !config.defaultTeam) {
                vscode.window.showErrorMessage('Please select a project and team first');
                return;
            }

            const axiosInstance = components.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            // Get team members
            const membersResponse = await axiosInstance.get(
                `/_apis/projects/${config.defaultProject}/teams/${config.defaultTeam}/members`
            );
            const members = membersResponse.data.value || [];

            const memberItems: TeamMemberQuickPickItem[] = [
                { label: 'Unassigned', description: 'Remove assignment', uniqueName: '' },
                { label: 'Assign to me', description: 'Assign to current user', uniqueName: '__ME__' },
                ...members.map((m: any) => ({
                    label: m.identity.displayName,
                    description: m.identity.uniqueName,
                    uniqueName: m.identity.uniqueName
                }))
            ];

            const selected = await vscode.window.showQuickPick(memberItems, {
                placeHolder: `Assign ${uniqueIds.length} work item(s) to...`
            });

            if (selected === undefined) return;

            let assignTo = selected.uniqueName;
            if (assignTo === '__ME__') {
                const currentUser = await components.authenticationManager.getCurrentUser();
                assignTo = currentUser?.uniqueName || '';
            }

            let successCount = 0;
            let errorCount = 0;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Assigning ${uniqueIds.length} work items...`,
                cancellable: true
            }, async (progress, token) => {
                for (let i = 0; i < uniqueIds.length; i++) {
                    if (token.isCancellationRequested) break;

                    progress.report({ increment: 100 / uniqueIds.length, message: `${i + 1}/${uniqueIds.length}` });

                    try {
                        const patchOp = assignTo
                            ? { op: 'replace', path: '/fields/System.AssignedTo', value: assignTo }
                            : { op: 'remove', path: '/fields/System.AssignedTo' };

                        await axiosInstance.patch(
                            `/_apis/wit/workitems/${uniqueIds[i]}`,
                            [patchOp],
                            { headers: { 'Content-Type': 'application/json-patch+json' } }
                        );
                        successCount++;
                    } catch (error) {
                        errorCount++;
                        console.error(`Failed to assign work item ${uniqueIds[i]}:`, error);
                    }
                }
            });

            if (successCount > 0) {
                const message = assignTo
                    ? `Assigned ${successCount} work item(s) to ${selected.label}`
                    : `Unassigned ${successCount} work item(s)`;
                vscode.window.showInformationMessage(`${message}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
                components.workItemProvider.refresh();
            } else {
                vscode.window.showErrorMessage('Failed to assign any work items');
            }
        })
    );

    // Bulk move to sprint command (works with multi-select)
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.bulkMoveToSprint', async (...args: any[]) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            // Get selected work items
            const workItemIds: number[] = [];
            const items = args.flat();
            for (const item of items) {
                if (item?.workItemId) {
                    workItemIds.push(item.workItemId);
                } else if (typeof item === 'number') {
                    workItemIds.push(item);
                }
            }

            if (workItemIds.length === 0) {
                vscode.window.showWarningMessage('No work items selected');
                return;
            }

            const uniqueIds = [...new Set(workItemIds)];

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject || !config.defaultTeam) {
                vscode.window.showErrorMessage('Please select a project and team first');
                return;
            }

            const axiosInstance = components.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return;

            // Get team iterations
            const iterResponse = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/${encodeURIComponent(config.defaultTeam)}/_apis/work/teamsettings/iterations`,
                { params: { 'api-version': '7.0' } }
            );

            const iterations = iterResponse.data.value || [];

            interface SprintQuickPickItem extends vscode.QuickPickItem {
                path: string;
            }

            const sprintItems: SprintQuickPickItem[] = iterations.map((iter: any) => ({
                label: iter.name,
                description: iter.path,
                path: iter.path
            }));

            const selected = await vscode.window.showQuickPick(sprintItems, {
                placeHolder: `Move ${uniqueIds.length} work item(s) to sprint...`
            });

            if (!selected) return;

            let successCount = 0;
            let errorCount = 0;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Moving ${uniqueIds.length} work items to ${selected.label}...`,
                cancellable: true
            }, async (progress, token) => {
                for (let i = 0; i < uniqueIds.length; i++) {
                    if (token.isCancellationRequested) break;

                    progress.report({ increment: 100 / uniqueIds.length, message: `${i + 1}/${uniqueIds.length}` });

                    try {
                        await axiosInstance.patch(
                            `/_apis/wit/workitems/${uniqueIds[i]}`,
                            [{ op: 'replace', path: '/fields/System.IterationPath', value: selected.path }],
                            { headers: { 'Content-Type': 'application/json-patch+json' } }
                        );
                        successCount++;
                    } catch (error) {
                        errorCount++;
                        console.error(`Failed to move work item ${uniqueIds[i]}:`, error);
                    }
                }
            });

            if (successCount > 0) {
                vscode.window.showInformationMessage(`Moved ${successCount} work item(s) to ${selected.label}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
                components.workItemProvider.refresh();
            } else {
                vscode.window.showErrorMessage('Failed to move any work items');
            }
        })
    );

    // Add comment to work item command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.addWorkItemComment', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;

            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (!workItemId) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID',
                    placeHolder: '12345'
                });
                if (!input) return;
                workItemId = parseInt(input, 10);
            }

            const comment = await vscode.window.showInputBox({
                prompt: 'Enter comment',
                placeHolder: 'Your comment here...',
                validateInput: (value) => value?.trim() ? null : 'Comment cannot be empty'
            });

            if (!comment) return;

            try {
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                const config = components.authenticationManager.getConfig();

                if (!axiosInstance || !config?.defaultProject) return;

                await axiosInstance.post(
                    `/${config.defaultProject}/_apis/wit/workItems/${workItemId}/comments`,
                    { text: comment },
                    { params: { 'api-version': '7.1-preview.3' } }
                );

                vscode.window.showInformationMessage(`Comment added to work item #${workItemId}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to add comment: ${error}`);
            }
        })
    );

    // Filter work items command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.filterWorkItems', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const filterOptions = [
                { label: '$(list-flat) Show All', state: null, type: null, assignedToMe: false },
                { label: '$(person) Assigned to Me', state: null, type: null, assignedToMe: true },
                { label: '$(play) Active Items', state: 'Active', type: null, assignedToMe: false },
                { label: '$(circle-outline) New Items', state: 'New', type: null, assignedToMe: false },
                { label: '$(check) Done Items', state: 'Done', type: null, assignedToMe: false },
                { label: '$(book) User Stories', state: null, type: 'User Story', assignedToMe: false },
                { label: '$(checklist) Tasks', state: null, type: 'Task', assignedToMe: false },
                { label: '$(bug) Bugs', state: null, type: 'Bug', assignedToMe: false },
                { label: '$(rocket) Epics', state: null, type: 'Epic', assignedToMe: false },
                { label: '$(star) Features', state: null, type: 'Feature', assignedToMe: false }
            ];

            const selected = await vscode.window.showQuickPick(filterOptions, {
                placeHolder: 'Select filter'
            });

            if (selected) {
                components.workItemProvider.setFilter(selected.state, selected.type, selected.assignedToMe);
            }
        })
    );

    // Group work items command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.groupWorkItems', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const currentGroupBy = components.workItemProvider.getGroupBy();
            const groupOptions = [
                { label: '$(symbol-event) Group by State', value: 'state' as const, description: currentGroupBy === 'state' ? '(Current)' : '' },
                { label: '$(symbol-class) Group by Type', value: 'type' as const, description: currentGroupBy === 'type' ? '(Current)' : '' },
                { label: '$(person) Group by Assigned To', value: 'assignedTo' as const, description: currentGroupBy === 'assignedTo' ? '(Current)' : '' },
                { label: '$(calendar) Group by Sprint', value: 'sprint' as const, description: currentGroupBy === 'sprint' ? '(Current)' : '' },
                { label: '$(list-flat) No Grouping', value: 'none' as const, description: currentGroupBy === 'none' ? '(Current)' : '' }
            ];

            const selected = await vscode.window.showQuickPick(groupOptions, {
                placeHolder: 'Select grouping option'
            });

            if (selected) {
                components.workItemProvider.setGroupBy(selected.value);
            }
        })
    );

    // Copy work item ID command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.copyWorkItemId', async (item?: any) => {
            let workItemId: number | undefined;

            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (workItemId) {
                await vscode.env.clipboard.writeText(workItemId.toString());
                vscode.window.showInformationMessage(`Copied work item ID: ${workItemId}`);
            }
        })
    );

    // Copy work item URL command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.copyWorkItemUrl', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;

            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (workItemId) {
                const config = components.authenticationManager.getConfig();
                if (config) {
                    const url = `${config.organizationUrl}/${config.defaultProject}/_workitems/edit/${workItemId}`;
                    await vscode.env.clipboard.writeText(url);
                    vscode.window.showInformationMessage('Work item URL copied to clipboard');
                }
            }
        })
    );

    // Assign to me command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.assignToMe', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;

            if (item?.workItemId) {
                workItemId = item.workItemId;
            } else if (typeof item === 'number') {
                workItemId = item;
            }

            if (!workItemId) return;

            try {
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                const currentUser = await components.authenticationManager.getCurrentUser();
                if (!currentUser?.uniqueName) {
                    vscode.window.showErrorMessage('Could not get current user');
                    return;
                }

                await axiosInstance.patch(
                    `/_apis/wit/workitems/${workItemId}`,
                    [{ op: 'replace', path: '/fields/System.AssignedTo', value: currentUser.uniqueName }],
                    { headers: { 'Content-Type': 'application/json-patch+json' } }
                );

                vscode.window.showInformationMessage(`Work item #${workItemId} assigned to you`);
                components.workItemProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to assign work item: ${error}`);
            }
        })
    );

    // Create branch from work item command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.createBranchFromWorkItem', async (workItemIdOrItem?: number | any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const isGitRepo = await components.gitIntegration.isGitRepository();
            if (!isGitRepo) {
                vscode.window.showErrorMessage('Not in a Git repository');
                return;
            }

            let workItemId: number | undefined;
            let workItemTitle: string | undefined;

            if (typeof workItemIdOrItem === 'number') {
                workItemId = workItemIdOrItem;
            } else if (workItemIdOrItem?.workItemId) {
                workItemId = workItemIdOrItem.workItemId;
            }

            if (workItemId) {
                const workItem = await components.workItemProvider.getWorkItemById(workItemId);
                if (workItem) {
                    workItemTitle = workItem.fields['System.Title'];
                }
            } else {
                // Get work items and let user select
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                const config = components.authenticationManager.getConfig();

                if (!axiosInstance || !config?.defaultProject) return;

                try {
                    const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
                                  FROM WorkItems
                                  WHERE [System.TeamProject] = @project
                                  AND [System.State] <> 'Closed'
                                  AND [System.State] <> 'Done'
                                  ORDER BY [System.ChangedDate] DESC`;

                    const response = await axiosInstance.post(`/${config.defaultProject}/_apis/wit/wiql`, {
                        query: wiql
                    });

                    const workItemRefs = response.data.workItems?.slice(0, 30) || [];

                    if (workItemRefs.length === 0) {
                        vscode.window.showInformationMessage('No active work items found');
                        return;
                    }

                    const workItemIds = workItemRefs.map((item: any) => item.id).join(',');
                    const detailsResponse = await axiosInstance.get(`/_apis/wit/workitems?ids=${workItemIds}`);
                    const workItems = detailsResponse.data.value || [];

                    const items: WorkItemQuickPickItem[] = workItems.map((wi: any) => ({
                        label: `#${wi.id}: ${wi.fields['System.Title']}`,
                        description: `${wi.fields['System.WorkItemType']} • ${wi.fields['System.State']}`,
                        id: wi.id
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: 'Select work item to create branch from'
                    });

                    if (selected) {
                        workItemId = selected.id;
                        workItemTitle = selected.label.substring(selected.label.indexOf(':') + 2);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to get work items: ${error}`);
                    return;
                }
            }

            if (!workItemId || !workItemTitle) return;

            // Generate branch name
            const branchConfig = vscode.workspace.getConfiguration('azureDevOps');
            const branchFormat = branchConfig.get<string>('branchNameFormat', 'feature/{id}-{title}');

            const sanitizedTitle = workItemTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .substring(0, 40);

            let defaultBranchName = branchFormat
                .replace('{id}', workItemId.toString())
                .replace('{title}', sanitizedTitle);

            const branchName = await vscode.window.showInputBox({
                prompt: 'Enter branch name',
                value: defaultBranchName,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Branch name is required';
                    }
                    if (/\s/.test(value)) {
                        return 'Branch name cannot contain spaces';
                    }
                    return null;
                }
            });

            if (!branchName) return;

            // Select base branch
            const currentBranch = await components.gitIntegration.getCurrentBranch();
            const baseBranch = await vscode.window.showInputBox({
                prompt: 'Enter base branch name',
                value: 'main',
                placeHolder: 'main, master, develop...'
            });

            if (!baseBranch) return;

            const success = await components.gitIntegration.createBranch(branchName, baseBranch);
            if (success) {
                // Also update the work item to link the branch (optional)
                vscode.window.showInformationMessage(`Created and switched to branch: ${branchName}`);
            }
        })
    );

    // Commit with work item link command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.commitWithWorkItem', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const isGitRepo = await components.gitIntegration.isGitRepository();
            if (!isGitRepo) {
                vscode.window.showErrorMessage('Not in a Git repository');
                return;
            }

            // Check for uncommitted changes
            const changes = await components.gitIntegration.getUncommittedChanges();
            if (changes.length === 0) {
                vscode.window.showInformationMessage('No changes to commit');
                return;
            }

            // Try to get work item ID from branch name
            const workItemIds = await components.gitIntegration.getWorkItemIdsFromBranch();
            let workItemId: number | undefined = workItemIds[0];

            // Or from status bar
            const currentWorkItemId = components.statusBarManager.getCurrentWorkItemId();
            if (currentWorkItemId) {
                workItemId = parseInt(currentWorkItemId, 10);
            }

            if (!workItemId) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID to link (or leave empty for no link)',
                    placeHolder: '12345'
                });
                if (input) {
                    workItemId = parseInt(input, 10);
                }
            }

            const commitMessage = await vscode.window.showInputBox({
                prompt: 'Enter commit message',
                placeHolder: 'Your commit message',
                validateInput: (value) => value?.trim() ? null : 'Commit message is required'
            });

            if (!commitMessage) return;

            // Stage all changes
            await components.gitIntegration.stageFiles([]);

            // Commit with work item link
            if (workItemId) {
                await components.gitIntegration.commitWithWorkItemLink(workItemId, commitMessage);
            } else {
                // Regular commit via Git extension
                vscode.commands.executeCommand('git.commit');
            }
        })
    );

    // Create pull request command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.createPullRequest', async () => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            const isGitRepo = await components.gitIntegration.isGitRepository();
            if (!isGitRepo) {
                vscode.window.showErrorMessage('Not in a Git repository');
                return;
            }

            const currentBranch = await components.gitIntegration.getCurrentBranch();
            if (!currentBranch) {
                vscode.window.showErrorMessage('Could not determine current branch');
                return;
            }

            const config = components.authenticationManager.getConfig();
            if (!config?.defaultProject) {
                vscode.window.showErrorMessage('Please select a project first');
                return;
            }

            const title = await vscode.window.showInputBox({
                prompt: 'Enter pull request title',
                value: currentBranch.replace(/[-_]/g, ' ').replace(/^feature\/|^bugfix\/|^hotfix\//i, ''),
                validateInput: (value) => value?.trim() ? null : 'Title is required'
            });

            if (!title) return;

            const description = await vscode.window.showInputBox({
                prompt: 'Enter pull request description (optional)',
                placeHolder: 'Describe your changes...'
            });

            const targetBranch = await vscode.window.showInputBox({
                prompt: 'Enter target branch',
                value: 'main',
                placeHolder: 'main, master, develop...'
            });

            if (!targetBranch) return;

            try {
                // Push the branch first
                await components.gitIntegration.pushToRemote(currentBranch);

                // Get repository ID
                const axiosInstance = components.authenticationManager.getAxiosInstance();
                if (!axiosInstance) return;

                // Try to get repo from git remote
                const repoUrl = await components.gitIntegration.getRepositoryUrl();

                // For Azure DevOps repos, create PR via API
                if (repoUrl && repoUrl.includes('dev.azure.com')) {
                    // Extract repo name from URL
                    const repoMatch = repoUrl.match(/\/([^\/]+?)(?:\.git)?$/);
                    const repoName = repoMatch ? repoMatch[1].replace('.git', '') : '';

                    if (repoName) {
                        try {
                            const reposResponse = await axiosInstance.get(
                                `/${config.defaultProject}/_apis/git/repositories`
                            );
                            const repos = reposResponse.data.value || [];
                            const repo = repos.find((r: any) =>
                                r.name.toLowerCase() === repoName.toLowerCase()
                            );

                            if (repo) {
                                const prResponse = await axiosInstance.post(
                                    `/${config.defaultProject}/_apis/git/repositories/${repo.id}/pullrequests`,
                                    {
                                        sourceRefName: `refs/heads/${currentBranch}`,
                                        targetRefName: `refs/heads/${targetBranch}`,
                                        title: title,
                                        description: description || ''
                                    }
                                );

                                const prUrl = `${config.organizationUrl}/${config.defaultProject}/_git/${repo.name}/pullrequest/${prResponse.data.pullRequestId}`;

                                const action = await vscode.window.showInformationMessage(
                                    `Pull request #${prResponse.data.pullRequestId} created successfully!`,
                                    'Open in Browser'
                                );

                                if (action === 'Open in Browser') {
                                    vscode.env.openExternal(vscode.Uri.parse(prUrl));
                                }
                                return;
                            }
                        } catch (error) {
                            console.error('Failed to create PR via API:', error);
                        }
                    }
                }

                // Fallback: open Azure DevOps in browser for PR creation
                const prUrl = `${config.organizationUrl}/${config.defaultProject}/_git/pullrequestcreate?sourceRef=${encodeURIComponent(currentBranch)}&targetRef=${encodeURIComponent(targetBranch)}`;
                vscode.env.openExternal(vscode.Uri.parse(prUrl));
                vscode.window.showInformationMessage('Opening Azure DevOps to create pull request...');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create pull request: ${error}`);
            }
        })
    );

    // Run saved query command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.runQuery', async (query?: Query) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            if (!query) {
                vscode.window.showInformationMessage('Please select a query from the Queries view');
                return;
            }

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Running query: ${query.name}`,
                    cancellable: false
                },
                async () => {
                    const results = await components.queryProvider.runQuery(query);

                    if (results.length === 0) {
                        vscode.window.showInformationMessage(`Query "${query.name}" returned no results`);
                        return;
                    }

                    // Show results in QuickPick
                    const items: WorkItemQuickPickItem[] = results.map((item: any) => ({
                        label: `#${item.id}: ${item.fields['System.Title']}`,
                        description: `${item.fields['System.WorkItemType']} • ${item.fields['System.State']}`,
                        detail: item.fields['System.AssignedTo']?.displayName || 'Unassigned',
                        id: item.id
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: `${results.length} results from "${query.name}"`,
                        matchOnDescription: true,
                        matchOnDetail: true
                    });

                    if (selected) {
                        vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', selected.id);
                    }
                }
            );
        })
    );

    // Link to existing work item
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.linkToExisting', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let workItemId: number | undefined;
            if (item?.workItemId) {
                workItemId = item.workItemId;
            }

            if (!workItemId) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter work item ID',
                    placeHolder: '12345'
                });
                if (!input) return;
                workItemId = parseInt(input, 10);
            }

            const linkType = await vscode.window.showQuickPick([
                { label: 'Parent', description: 'Link as parent of this work item' },
                { label: 'Child', description: 'Link as child of this work item' },
                { label: 'Related', description: 'Link as related work item' },
                { label: 'Predecessor', description: 'This work item depends on the linked item' },
                { label: 'Successor', description: 'The linked item depends on this work item' }
            ], { placeHolder: 'Select link type' });

            if (!linkType) return;

            const searchTerm = await vscode.window.showInputBox({
                prompt: 'Search work items by ID or title',
                placeHolder: 'Enter ID or search term'
            });

            if (!searchTerm) return;

            const results = await components.workItemLinksManager.searchWorkItems(searchTerm);
            if (results.length === 0) {
                vscode.window.showInformationMessage('No work items found');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                results.map(wi => ({
                    label: `#${wi.id}: ${wi.fields['System.Title']}`,
                    description: `${wi.fields['System.WorkItemType']} • ${wi.fields['System.State']}`,
                    detail: wi.fields['System.AssignedTo']?.displayName || 'Unassigned',
                    id: wi.id
                })),
                { placeHolder: 'Select work item to link' }
            );

            if (!selected) return;

            const success = await components.workItemLinksManager.addLink(workItemId, (selected as any).id, linkType.label);
            if (success) {
                vscode.window.showInformationMessage(`Linked as ${linkType.label}`);
                components.workItemProvider.refresh();
            } else {
                vscode.window.showErrorMessage('Failed to create link');
            }
        })
    );

    // Create and link new work item
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.createAndLink', async (item?: any) => {
            if (!components.authenticationManager.isConnected()) {
                vscode.window.showErrorMessage('Please connect to Azure DevOps first');
                return;
            }

            let sourceWorkItemId: number | undefined;
            if (item?.workItemId) {
                sourceWorkItemId = item.workItemId;
            }

            if (!sourceWorkItemId) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter source work item ID',
                    placeHolder: '12345'
                });
                if (!input) return;
                sourceWorkItemId = parseInt(input, 10);
            }

            const workItemType = await vscode.window.showQuickPick([
                { label: 'Task', description: 'Create a task' },
                { label: 'Bug', description: 'Create a bug' },
                { label: 'User Story', description: 'Create a user story' },
                { label: 'Feature', description: 'Create a feature' }
            ], { placeHolder: 'Select work item type to create' });

            if (!workItemType) return;

            const title = await vscode.window.showInputBox({
                prompt: 'Enter work item title',
                placeHolder: 'Work item title',
                validateInput: (value) => value?.trim() ? null : 'Title is required'
            });

            if (!title) return;

            const linkType = await vscode.window.showQuickPick([
                { label: 'Child', description: 'Create as child of current work item' },
                { label: 'Related', description: 'Create as related work item' },
                { label: 'Successor', description: 'Create as successor (depends on current)' }
            ], { placeHolder: 'Select link type' });

            if (!linkType) return;

            const newWorkItem = await components.workItemProvider.createWorkItem(workItemType.label, title);
            if (!newWorkItem) {
                vscode.window.showErrorMessage('Failed to create work item');
                return;
            }

            const success = await components.workItemLinksManager.addLink(sourceWorkItemId, newWorkItem.id, linkType.label);
            if (success) {
                const action = await vscode.window.showInformationMessage(
                    `Created and linked ${workItemType.label} #${newWorkItem.id}`,
                    'Open',
                    'Stay Here'
                );

                if (action === 'Open') {
                    vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', newWorkItem.id);
                }

                components.workItemProvider.refresh();
            } else {
                vscode.window.showErrorMessage('Work item created but failed to link');
            }
        })
    );

    // AI Settings command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.openAISettings', async () => {
            const outputChannel = vscode.window.createOutputChannel('Azure DevOps AI');
            SettingsUIProvider.createSettingsPanel(context, outputChannel);
        })
    );
}
