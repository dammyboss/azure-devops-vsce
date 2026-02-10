import * as vscode from 'vscode';
import { WorkItem } from '../models/workItem';
import { SearchService } from '../services/searchService';
import { AuthenticationManager } from '../authentication/authenticationManager';

interface WorkItemQuickPickItem extends vscode.QuickPickItem {
    workItemId?: number;
    workItem?: WorkItem;
}

export class WorkItemQuickPick {
    private quickPick: vscode.QuickPick<WorkItemQuickPickItem> | undefined;

    constructor(
        private authManager: AuthenticationManager,
        private searchService: SearchService
    ) {}

    /**
     * Show the quick pick UI for work item selection
     */
    async show(): Promise<void> {
        if (!this.authManager.isConnected()) {
            vscode.window.showErrorMessage('Please connect to Azure DevOps first');
            return;
        }

        this.quickPick = vscode.window.createQuickPick<WorkItemQuickPickItem>();
        this.quickPick.placeholder = 'Type # followed by ID or search by title... (e.g., #123 or "bug fix")';
        this.quickPick.matchOnDescription = true;
        this.quickPick.matchOnDetail = true;

        // Load recent items initially
        await this.loadRecentItems();

        // Handle input changes for live search
        this.quickPick.onDidChangeValue(async (value) => {
            if (!value || value.trim().length === 0) {
                // Show recent items when input is empty
                await this.loadRecentItems();
                return;
            }

            // Show loading
            this.quickPick!.busy = true;

            try {
                const trimmedValue = value.trim();

                // Debounce search for text queries (not IDs)
                if (!trimmedValue.startsWith('#') && !/^\d+$/.test(trimmedValue)) {
                    // Wait a bit for user to finish typing
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Check if value changed while waiting
                    if (this.quickPick!.value !== value) {
                        return;
                    }
                }

                await this.performSearch(trimmedValue);
            } finally {
                this.quickPick!.busy = false;
            }
        });

        // Handle selection
        this.quickPick.onDidAccept(() => {
            const selected = this.quickPick!.activeItems[0];
            if (selected && selected.workItemId) {
                this.openWorkItem(selected.workItemId);
                this.quickPick!.hide();
            }
        });

        // Clean up on hide
        this.quickPick.onDidHide(() => {
            this.quickPick?.dispose();
            this.quickPick = undefined;
        });

        this.quickPick.show();
    }

    /**
     * Load and display recent work items
     */
    private async loadRecentItems(): Promise<void> {
        if (!this.quickPick) return;

        this.quickPick.busy = true;

        try {
            const recentItems = await this.searchService.getRecentWorkItems();

            if (recentItems.length === 0) {
                this.quickPick.items = [{
                    label: '$(info) No recent work items',
                    description: 'Type to search for work items',
                    alwaysShow: true
                }];
                return;
            }

            this.quickPick.items = [
                {
                    label: '$(history) Recent Work Items',
                    kind: vscode.QuickPickItemKind.Separator
                },
                ...recentItems.map(item => this.formatWorkItem(item))
            ];
        } catch (error: any) {
            console.error('[WorkItemQuickPick] Failed to load recent items:', error);
            this.quickPick.items = [{
                label: '$(error) Failed to load recent items',
                description: error?.message || 'Unknown error'
            }];
        } finally {
            this.quickPick.busy = false;
        }
    }

    /**
     * Perform search and update quick pick items
     */
    private async performSearch(searchTerm: string): Promise<void> {
        if (!this.quickPick) return;

        try {
            const results = await this.searchService.searchWorkItems(searchTerm, 50);

            if (results.length === 0) {
                this.quickPick.items = [{
                    label: '$(search) No work items found',
                    description: `Try a different search term or work item ID`,
                    alwaysShow: true
                }];
                return;
            }

            // Format search results
            const isIdSearch = searchTerm.startsWith('#') || /^\d+$/.test(searchTerm);
            const headerLabel = isIdSearch
                ? `$(search) Found ${results.length} work item(s)`
                : `$(search) Search Results (${results.length})`;

            this.quickPick.items = [
                {
                    label: headerLabel,
                    kind: vscode.QuickPickItemKind.Separator
                },
                ...results.map(item => this.formatWorkItem(item))
            ];
        } catch (error: any) {
            console.error('[WorkItemQuickPick] Search failed:', error);
            this.quickPick.items = [{
                label: '$(error) Search failed',
                description: error?.message || 'Unknown error'
            }];
        }
    }

    /**
     * Format work item as quick pick item
     */
    private formatWorkItem(workItem: WorkItem): WorkItemQuickPickItem {
        const fields = workItem.fields;
        const type = fields['System.WorkItemType'];
        const state = fields['System.State'];
        const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';
        const title = fields['System.Title'];

        // Choose icon based on work item type
        const icon = this.getIconForType(type);

        return {
            label: `$(${icon}) #${workItem.id}: ${title}`,
            description: `${type} • ${state}`,
            detail: `Assigned to: ${assignedTo}`,
            workItemId: workItem.id,
            workItem: workItem,
            alwaysShow: true
        };
    }

    /**
     * Get codicon for work item type
     */
    private getIconForType(type: string): string {
        const iconMap: Record<string, string> = {
            'User Story': 'book',
            'Product Backlog Item': 'book',
            'Feature': 'star-full',
            'Epic': 'flame',
            'Task': 'tasklist',
            'Bug': 'bug',
            'Issue': 'issues',
            'Test Case': 'beaker',
            'Test Plan': 'beaker',
            'Test Suite': 'beaker',
            'Impediment': 'warning',
            'Risk': 'alert'
        };

        return iconMap[type] || 'circle-outline';
    }

    /**
     * Open work item details panel
     */
    private openWorkItem(workItemId: number): void {
        // Add to recent items
        this.searchService.addToRecent(workItemId);

        // Open work item details panel
        vscode.commands.executeCommand('azureDevOps.viewWorkItemDetails', workItemId);
    }
}
