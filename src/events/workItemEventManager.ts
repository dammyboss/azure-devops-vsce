import * as vscode from 'vscode';

/**
 * Event data for work item updates
 */
export interface WorkItemUpdateEvent {
    workItemId: number;
    updateType: 'create' | 'update' | 'delete' | 'state-change' | 'assign' | 'link';
    changes?: {
        field: string;
        oldValue?: any;
        newValue?: any;
    }[];
}

/**
 * Centralized event manager for work item updates
 * All views subscribe to this to stay in sync
 */
export class WorkItemEventManager {
    private static instance: WorkItemEventManager;

    private _onWorkItemUpdated = new vscode.EventEmitter<WorkItemUpdateEvent>();
    public readonly onWorkItemUpdated = this._onWorkItemUpdated.event;

    private constructor() {}

    static getInstance(): WorkItemEventManager {
        if (!WorkItemEventManager.instance) {
            WorkItemEventManager.instance = new WorkItemEventManager();
        }
        return WorkItemEventManager.instance;
    }

    /**
     * Broadcast a work item update event to all subscribers
     */
    notifyWorkItemUpdated(event: WorkItemUpdateEvent): void {
        this._onWorkItemUpdated.fire(event);
    }

    /**
     * Dispose of the event emitter
     */
    dispose(): void {
        this._onWorkItemUpdated.dispose();
    }
}
