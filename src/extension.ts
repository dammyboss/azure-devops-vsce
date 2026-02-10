import * as vscode from 'vscode';
import { AuthenticationManager } from './authentication/authenticationManager';
import { ConnectionStatusProvider } from './authentication/connectionStatusProvider';
import { WorkItemProvider } from './views/workItemProvider';
import { BacklogProvider } from './views/backlogProvider';
import { BoardProvider } from './views/boardProvider';
import { SprintProvider } from './views/sprintProvider';
import { QueryProvider } from './views/queryProvider';
import { registerCommands } from './commands/commandManager';
import { GitIntegration } from './gitIntegration/gitIntegration';
import { StatusBarManager } from './utils/statusBarManager';
import { WorkItemLinksManager } from './utils/workItemLinksManager';
import { WhatsNewPanel } from './views/whatsNewPanel';
import { SearchService } from './services/searchService';
import { ActiveWorkItemService } from './services/activeWorkItemService';
// DISABLED: AI Chat features - uncomment to re-enable in future
// import { AIChatProvider } from './ai/chat-provider';
// import { ChatEditorProvider, openChatEditor } from './ai/chat-editor';
// import { AzureDevOpsChatParticipant } from './ai/chat-participant';

export let authenticationManager: AuthenticationManager;
export let workItemProvider: WorkItemProvider;
export let backlogProvider: BacklogProvider;
export let boardProvider: BoardProvider;
export let sprintProvider: SprintProvider;
export let queryProvider: QueryProvider;
export let gitIntegration: GitIntegration;
export let statusBarManager: StatusBarManager;
export let workItemLinksManager: WorkItemLinksManager;
export let connectionStatusProvider: ConnectionStatusProvider;
export let outputChannel: vscode.OutputChannel;
export let searchService: SearchService;
export let activeWorkItemService: ActiveWorkItemService;
// DISABLED: AI Chat features - uncomment to re-enable in future
// export let aiChatProvider: AIChatProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Azure DevOps Boards extension is now active!');

    // Initialize output channel
    outputChannel = vscode.window.createOutputChannel('Azure DevOps');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Azure DevOps Boards extension activated');

    // Initialize managers
    authenticationManager = new AuthenticationManager(context);
    await authenticationManager.initialize();
    context.subscriptions.push(...authenticationManager.registerListeners());

    statusBarManager = new StatusBarManager();
    gitIntegration = new GitIntegration();
    workItemLinksManager = new WorkItemLinksManager(authenticationManager);
    connectionStatusProvider = new ConnectionStatusProvider(authenticationManager, context);
    searchService = new SearchService(context, authenticationManager);
    activeWorkItemService = new ActiveWorkItemService(context, authenticationManager);

    // Connect status bar to active work item service
    statusBarManager.setActiveWorkItemService(activeWorkItemService);

    // DISABLED: AI Chat features - uncomment to re-enable in future
    // // Initialize AI output channel
    // const aiOutputChannel = vscode.window.createOutputChannel('Azure DevOps AI');
    // context.subscriptions.push(aiOutputChannel);

    // // Initialize AI chat provider
    // aiChatProvider = new AIChatProvider(context.extensionUri, aiOutputChannel, context);
    // context.subscriptions.push(
    //     vscode.window.registerWebviewViewProvider('azureDevOpsAIChat', aiChatProvider)
    // );

    // // Register chat editor provider
    // context.subscriptions.push(
    //     ChatEditorProvider.register(context, aiOutputChannel)
    // );

    // // Register command to open chat in editor
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('azureDevOps.openAIChatEditor', () => openChatEditor(context))
    // );

    // // Alias command for backwards compatibility: openAIChat -> openAIChatEditor
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('azureDevOps.openAIChat', () => vscode.commands.executeCommand('azureDevOps.openAIChatEditor'))
    // );

    // // Register chat participant for VSCode's built-in chat
    // const chatParticipant = new AzureDevOpsChatParticipant(aiOutputChannel, context);
    // const participant = vscode.chat.createChatParticipant('azure-devops.chat', async (request, chatContext, stream, token) => {
    //     await chatParticipant.handleChatRequest(request, chatContext, stream, token);
    // });
    // participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    // context.subscriptions.push(participant);

    // Initialize providers
    workItemProvider = new WorkItemProvider(context, authenticationManager);
    backlogProvider = new BacklogProvider(context, authenticationManager);
    boardProvider = new BoardProvider(context, authenticationManager);
    sprintProvider = new SprintProvider(context, authenticationManager);
    queryProvider = new QueryProvider(context, authenticationManager);

    // Register connection status tree view
    const connectionStatusTreeView = vscode.window.createTreeView('azureDevOpsConnection', {
        treeDataProvider: connectionStatusProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(connectionStatusTreeView);

    // Register tree views
    const workItemsTreeView = vscode.window.createTreeView('azureDevOpsWorkItems', {
        treeDataProvider: workItemProvider,
        showCollapseAll: true,
        dragAndDropController: workItemProvider,
        canSelectMany: true
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

    // Register What's New command
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevOps.showWhatsNew', async () => {
            await WhatsNewPanel.forceShow(context);
        })
    );

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
        workItemLinksManager,
        connectionStatusProvider,
        searchService,
        activeWorkItemService
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
                connectionStatusProvider.refresh();
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
                connectionStatusProvider.refresh();
            }
        }, refreshInterval * 1000);

        context.subscriptions.push({
            dispose: () => clearInterval(intervalId)
        });
    }

    // Initialize status bar
    statusBarManager.updateStatus('disconnected');
    connectionStatusProvider.refresh();

    // Try to auto-connect if credentials are available
    try {
        const isConnected = await authenticationManager.autoConnect();
        if (isConnected) {
            vscode.commands.executeCommand('setContext', 'azureDevOps.connected', true);
            statusBarManager.updateStatus('connected');
            const showNotifications = config.get<boolean>('showNotifications', true);
            if (showNotifications) {
                vscode.window.showInformationMessage('✓ Connected to Azure DevOps');
            }
            // Refresh ALL views
            workItemProvider.refresh();
            backlogProvider.refresh();
            boardProvider.refresh();
            sprintProvider.refresh();
            queryProvider.refresh();
            connectionStatusProvider.refresh();

            // Check and show what's new
            await WhatsNewPanel.show(context);
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
