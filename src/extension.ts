import * as vscode from 'vscode';
import { AuthenticationManager } from './authentication/authenticationManager';
import { WorkItemProvider } from './views/workItemProvider';
import { BacklogProvider } from './views/backlogProvider';
import { BoardProvider } from './views/boardProvider';
import { SprintProvider } from './views/sprintProvider';
import { QueryProvider } from './views/queryProvider';
import { registerCommands } from './commands/commandManager';
import { GitIntegration } from './gitIntegration/gitIntegration';
import { StatusBarManager } from './utils/statusBarManager';
import { WorkItemLinksManager } from './utils/workItemLinksManager';

export let authenticationManager: AuthenticationManager;
export let workItemProvider: WorkItemProvider;
export let backlogProvider: BacklogProvider;
export let boardProvider: BoardProvider;
export let sprintProvider: SprintProvider;
export let queryProvider: QueryProvider;
export let gitIntegration: GitIntegration;
export let statusBarManager: StatusBarManager;
export let workItemLinksManager: WorkItemLinksManager;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Azure DevOps Boards extension is now active!');

    // Initialize managers
    authenticationManager = new AuthenticationManager(context);
    statusBarManager = new StatusBarManager();
    gitIntegration = new GitIntegration();
    workItemLinksManager = new WorkItemLinksManager(authenticationManager);

    // Initialize providers
    workItemProvider = new WorkItemProvider(context, authenticationManager);
    backlogProvider = new BacklogProvider(context, authenticationManager);
    boardProvider = new BoardProvider(context, authenticationManager);
    sprintProvider = new SprintProvider(context, authenticationManager);
    queryProvider = new QueryProvider(context, authenticationManager);

    // Register tree views
    const workItemsTreeView = vscode.window.createTreeView('azureDevOpsWorkItems', {
        treeDataProvider: workItemProvider,
        showCollapseAll: true
    });

    const backlogsTreeView = vscode.window.createTreeView('azureDevOpsBacklogs', {
        treeDataProvider: backlogProvider,
        showCollapseAll: true
    });

    const boardsTreeView = vscode.window.createTreeView('azureDevOpsBoards', {
        treeDataProvider: boardProvider,
        showCollapseAll: true
    });

    const sprintsTreeView = vscode.window.createTreeView('azureDevOpsSprints', {
        treeDataProvider: sprintProvider,
        showCollapseAll: true
    });

    const queriesTreeView = vscode.window.createTreeView('azureDevOpsQueries', {
        treeDataProvider: queryProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(workItemsTreeView, backlogsTreeView, boardsTreeView, sprintsTreeView, queriesTreeView);

    // Register commands
    registerCommands(context, {
        authenticationManager,
        workItemProvider,
        backlogProvider,
        boardProvider,
        sprintProvider,
        queryProvider,
        gitIntegration,
        statusBarManager,
        extensionUri: context.extensionUri,
        workItemLinksManager
    });

    // Register configuration change listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('azureDevOps')) {
                await authenticationManager.refreshConfiguration();
                workItemProvider.refresh();
                backlogProvider.refresh();
                boardProvider.refresh();
                sprintProvider.refresh();
                queryProvider.refresh();
            }
        })
    );

    // Auto-refresh interval
    const config = vscode.workspace.getConfiguration('azureDevOps');
    const refreshInterval = config.get<number>('autoRefreshInterval', 300);

    if (refreshInterval > 0) {
        const intervalId = setInterval(() => {
            if (authenticationManager.isConnected()) {
                workItemProvider.refresh();
                backlogProvider.refresh();
                boardProvider.refresh();
                sprintProvider.refresh();
            }
        }, refreshInterval * 1000);

        context.subscriptions.push({
            dispose: () => clearInterval(intervalId)
        });
    }

    // Initialize status bar
    statusBarManager.updateStatus('disconnected');

    // Try to auto-connect if credentials are available
    try {
        const isConnected = await authenticationManager.autoConnect();
        if (isConnected) {
            vscode.commands.executeCommand('setContext', 'azureDevOps.connected', true);
            statusBarManager.updateStatus('connected');
            const showNotifications = config.get<boolean>('showNotifications', true);
            if (showNotifications) {
                vscode.window.showInformationMessage('Connected to Azure DevOps');
            }
            // Refresh ALL views
            workItemProvider.refresh();
            backlogProvider.refresh();
            boardProvider.refresh();
            sprintProvider.refresh();
            queryProvider.refresh();
        } else {
            vscode.commands.executeCommand('setContext', 'azureDevOps.connected', false);
            statusBarManager.updateStatus('disconnected');
        }
    } catch (error) {
        console.log('Auto-connect failed:', error);
        vscode.commands.executeCommand('setContext', 'azureDevOps.connected', false);
        statusBarManager.updateStatus('disconnected');
    }

    console.log('Azure DevOps Boards extension initialized successfully');
}

export function deactivate() {
    console.log('Azure DevOps Boards extension deactivated');
    if (gitIntegration) {
        gitIntegration.dispose();
    }
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
