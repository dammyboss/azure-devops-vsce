import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private currentWorkItemId: string | null = null;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.show();
    }

    updateStatus(status: 'connected' | 'disconnected' | 'working', workItemId?: string): void {
        this.currentWorkItemId = workItemId || null;
        
        switch (status) {
            case 'connected':
                this.statusBarItem.text = '$(azure) Azure DevOps Board: Connected';
                this.statusBarItem.tooltip = 'Connected to Azure DevOps Board';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case 'disconnected':
                this.statusBarItem.text = '$(azure) Azure DevOps Board: Disconnected';
                this.statusBarItem.tooltip = 'Click to connect to Azure DevOps Board';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.statusBarItem.command = 'azureDevOps.connect';
                break;
                
            case 'working':
                if (workItemId) {
                    this.statusBarItem.text = `$(play-circle) Working on #${workItemId}`;
                    this.statusBarItem.tooltip = 'Click to stop working';
                    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.activeBackground');
                    this.statusBarItem.command = 'azureDevOps.stopWorking';
                }
                break;
        }
    }

    getCurrentWorkItemId(): string | null {
        return this.currentWorkItemId;
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}