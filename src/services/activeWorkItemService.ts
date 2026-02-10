import * as vscode from 'vscode';
import { WorkItem } from '../models/workItem';
import { AuthenticationManager } from '../authentication/authenticationManager';

interface ActiveWorkItemState {
    id: number;
    title: string;
    state: string;
    type: string;
    startTime: number;
}

export class ActiveWorkItemService {
    private static readonly ACTIVE_WORK_ITEM_KEY = 'activeWorkItem';
    private activeWorkItem: WorkItem | null = null;
    private startTime: number = 0;
    private onActiveWorkItemChanged: vscode.EventEmitter<WorkItem | null>;
    readonly onDidChangeActiveWorkItem: vscode.Event<WorkItem | null>;

    constructor(
        private context: vscode.ExtensionContext,
        private authManager: AuthenticationManager
    ) {
        this.onActiveWorkItemChanged = new vscode.EventEmitter<WorkItem | null>();
        this.onDidChangeActiveWorkItem = this.onActiveWorkItemChanged.event;

        // Try to restore active work item from previous session
        this.restoreActiveWorkItem();
    }

    /**
     * Set a work item as active
     */
    async setActive(workItem: WorkItem): Promise<void> {
        this.activeWorkItem = workItem;
        this.startTime = Date.now();

        // Persist to storage
        const state: ActiveWorkItemState = {
            id: workItem.id,
            title: workItem.fields['System.Title'],
            state: workItem.fields['System.State'],
            type: workItem.fields['System.WorkItemType'],
            startTime: this.startTime
        };

        await this.context.globalState.update(ActiveWorkItemService.ACTIVE_WORK_ITEM_KEY, state);

        // Notify listeners
        this.onActiveWorkItemChanged.fire(workItem);

        console.log('[ActiveWorkItemService] Set active work item:', workItem.id);
    }

    /**
     * Clear the active work item
     */
    async clearActive(): Promise<void> {
        this.activeWorkItem = null;
        this.startTime = 0;

        await this.context.globalState.update(ActiveWorkItemService.ACTIVE_WORK_ITEM_KEY, undefined);

        // Notify listeners
        this.onActiveWorkItemChanged.fire(null);

        console.log('[ActiveWorkItemService] Cleared active work item');
    }

    /**
     * Get the current active work item
     */
    getActive(): WorkItem | null {
        return this.activeWorkItem;
    }

    /**
     * Get time spent on current work item (in human-readable format)
     */
    getTimeSpent(): string {
        if (!this.activeWorkItem || !this.startTime) {
            return '0m';
        }

        const elapsedMs = Date.now() - this.startTime;
        const minutes = Math.floor(elapsedMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m`;
        }
    }

    /**
     * Get elapsed time in minutes
     */
    getElapsedMinutes(): number {
        if (!this.activeWorkItem || !this.startTime) {
            return 0;
        }

        return Math.floor((Date.now() - this.startTime) / 60000);
    }

    /**
     * Restore active work item from previous session
     */
    private async restoreActiveWorkItem(): Promise<void> {
        try {
            const state = this.context.globalState.get<ActiveWorkItemState>(
                ActiveWorkItemService.ACTIVE_WORK_ITEM_KEY
            );

            if (!state) {
                return;
            }

            // Verify the work item still exists and fetch full details
            const axiosInstance = this.authManager.getAxiosInstance();
            if (!axiosInstance) {
                console.log('[ActiveWorkItemService] Cannot restore: not connected');
                return;
            }

            const response = await axiosInstance.get(
                `/_apis/wit/workitems/${state.id}`,
                {
                    params: {
                        '$expand': 'all',
                        'api-version': '7.1'
                    }
                }
            );

            if (response.data) {
                this.activeWorkItem = response.data;
                this.startTime = state.startTime;

                // Notify listeners
                this.onActiveWorkItemChanged.fire(this.activeWorkItem);

                console.log('[ActiveWorkItemService] Restored active work item:', state.id);
            }
        } catch (error: any) {
            console.log('[ActiveWorkItemService] Failed to restore active work item:', error?.message);
            // Clear invalid state
            await this.context.globalState.update(ActiveWorkItemService.ACTIVE_WORK_ITEM_KEY, undefined);
        }
    }

    /**
     * Check if a work item is currently active
     */
    isActive(workItemId: number): boolean {
        return this.activeWorkItem?.id === workItemId;
    }

    /**
     * Refresh the active work item data
     */
    async refresh(): Promise<void> {
        if (!this.activeWorkItem) {
            return;
        }

        try {
            const axiosInstance = this.authManager.getAxiosInstance();
            if (!axiosInstance) {
                return;
            }

            const response = await axiosInstance.get(
                `/_apis/wit/workitems/${this.activeWorkItem.id}`,
                {
                    params: {
                        '$expand': 'all',
                        'api-version': '7.1'
                    }
                }
            );

            if (response.data) {
                this.activeWorkItem = response.data;
                this.onActiveWorkItemChanged.fire(this.activeWorkItem);
                console.log('[ActiveWorkItemService] Refreshed active work item');
            }
        } catch (error: any) {
            console.error('[ActiveWorkItemService] Failed to refresh active work item:', error?.message);
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.onActiveWorkItemChanged.dispose();
    }
}
