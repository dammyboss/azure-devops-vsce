import * as vscode from 'vscode';
import { WorkItem } from '../models/workItem';
import { ActiveWorkItemService } from '../services/activeWorkItemService';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private activeWorkItemService: ActiveWorkItemService | null = null;
    private timeUpdateInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.show();
        this.updateStatus('disconnected');
    }

    /**
     * Set the active work item service
     */
    setActiveWorkItemService(service: ActiveWorkItemService): void {
        this.activeWorkItemService = service;

        // Listen for active work item changes
        service.onDidChangeActiveWorkItem((workItem) => {
            if (workItem) {
                this.showActiveWorkItem(workItem);
            } else {
                this.updateStatus('connected');
            }
        });

        // Update time display every minute
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }

        this.timeUpdateInterval = setInterval(() => {
            const active = service.getActive();
            if (active) {
                this.showActiveWorkItem(active);
            }
        }, 60000); // Update every minute
    }

    /**
     * Update basic status (connected/disconnected)
     */
    updateStatus(status: 'connected' | 'disconnected' | 'working', workItemId?: string): void {
        switch (status) {
            case 'connected':
                this.statusBarItem.text = '$(check) Azure DevOps';
                this.statusBarItem.tooltip = new vscode.MarkdownString(
                    '**Azure DevOps**\n\nConnected and ready\n\n---\n\n' +
                    '_Click to open Quick Open_'
                );
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.command = 'azureDevOps.quickOpenWorkItem';
                break;

            case 'disconnected':
                this.statusBarItem.text = '$(azure) Azure DevOps';
                this.statusBarItem.tooltip = 'Click to connect to Azure DevOps';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.statusBarItem.command = 'azureDevOps.connect';
                break;

            case 'working':
                // Legacy support - redirects to activeWorkItemService
                if (workItemId && this.activeWorkItemService) {
                    // Fetch and set as active
                    console.log('[StatusBarManager] Legacy working mode - use activeWorkItemService instead');
                }
                break;
        }
    }

    /**
     * Show active work item in status bar
     */
    private showActiveWorkItem(workItem: WorkItem): void {
        const fields = workItem.fields;
        const id = workItem.id;
        const title = fields['System.Title'];
        const state = fields['System.State'];
        const type = fields['System.WorkItemType'];
        const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';

        // Get icon for state
        const icon = this.getIconForState(state);

        // Get time spent
        const timeSpent = this.activeWorkItemService?.getTimeSpent() || '0m';

        // Update status bar
        this.statusBarItem.text = `$(${icon}) #${id}`;
        this.statusBarItem.tooltip = new vscode.MarkdownString(
            `**#${id}**: ${title}\n\n` +
            `**Type**: ${type}\n` +
            `**State**: ${state}\n` +
            `**Assigned**: ${assignedTo}\n` +
            `**Time**: ${timeSpent}\n\n` +
            `---\n\n` +
            `_Click for quick actions_`
        );
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        this.statusBarItem.command = 'azureDevOps.showActiveWorkItemActions';
    }

    /**
     * Get icon for work item state
     */
    private getIconForState(state: string): string {
        const normalizedState = state.toLowerCase();

        if (normalizedState.includes('new') || normalizedState.includes('to do') || normalizedState.includes('proposed')) {
            return 'circle-outline';
        } else if (normalizedState.includes('active') || normalizedState.includes('in progress') || normalizedState.includes('doing')) {
            return 'sync~spin';
        } else if (normalizedState.includes('resolved') || normalizedState.includes('ready for review')) {
            return 'pass';
        } else if (normalizedState.includes('closed') || normalizedState.includes('done') || normalizedState.includes('completed')) {
            return 'check';
        } else if (normalizedState.includes('removed')) {
            return 'circle-slash';
        }

        return 'circle';
    }

    /**
     * Get current work item ID (legacy support)
     */
    getCurrentWorkItemId(): string | null {
        const active = this.activeWorkItemService?.getActive();
        return active ? String(active.id) : null;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        this.statusBarItem.dispose();
    }
}
