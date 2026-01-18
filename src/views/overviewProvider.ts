import * as vscode from 'vscode';
import { WorkItemProvider } from './workItemProvider';
import { BacklogProvider } from './backlogProvider';
import { BoardProvider } from './boardProvider';
import { SprintProvider } from './sprintProvider';
import { QueryProvider } from './queryProvider';

export interface SectionItem {
    id: string;
    label: string;
    icon: string;
}

/**
 * Provides an overview of all sections with drag and drop reordering
 */
export class OverviewProvider implements vscode.TreeDataProvider<SectionItem>, vscode.TreeDragAndDropController<SectionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SectionItem | undefined | null | void> = 
        new vscode.EventEmitter<SectionItem | undefined | null | void>();
    
    readonly onDidChangeTreeData: vscode.Event<SectionItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    dropMimeTypes = ['application/vnd.code.tree.overviewProvider'];
    dragMimeTypes = ['application/vnd.code.tree.overviewProvider'];

    private defaultSections: SectionItem[] = [
        { id: 'workItems', label: 'Work Items', icon: '$(tasklist)' },
        { id: 'backlogs', label: 'Backlogs', icon: '$(list-tree)' },
        { id: 'boards', label: 'Boards', icon: '$(project)' },
        { id: 'sprints', label: 'Sprints', icon: '$(calendar)' },
        { id: 'queries', label: 'Queries', icon: '$(search)' }
    ];

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get section order from global state or use defaults
     */
    private getSectionOrder(): SectionItem[] {
        const saved = this.context.globalState.get<string[]>('azure-devops.sectionOrder');
        if (saved && saved.length > 0) {
            return saved
                .map(id => this.defaultSections.find(s => s.id === id))
                .filter((s): s is SectionItem => !!s);
        }
        return this.defaultSections;
    }

    /**
     * Save section order to global state
     */
    private async saveSectionOrder(sections: SectionItem[]): Promise<void> {
        const ids = sections.map(s => s.id);
        await this.context.globalState.update('azure-devops.sectionOrder', ids);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: SectionItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon(element.icon);
        item.contextValue = 'section-item';
        item.id = element.id;
        return item;
    }

    async getChildren(element?: SectionItem): Promise<SectionItem[]> {
        if (!element) {
            return this.getSectionOrder();
        }
        
        // No children for sections
        return [];
    }

    /**
     * Handle drag operations
     */
    async onDragStart(source: readonly SectionItem[], dataTransfer: vscode.DataTransfer): Promise<void> {
        const item = source[0];
        dataTransfer.set('application/vnd.code.tree.overviewProvider', 
            new vscode.DataTransferItem(JSON.stringify(item)));
    }

    /**
     * Handle drop operations
     */
    async onDrop(target: SectionItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const items = dataTransfer.get('application/vnd.code.tree.overviewProvider');
        if (!items || !target) {
            return;
        }

        try {
            const draggedData = JSON.parse(await items.asString()) as SectionItem;
            const sections = this.getSectionOrder();
            
            const draggedIndex = sections.findIndex(s => s.id === draggedData.id);
            const targetIndex = sections.findIndex(s => s.id === target.id);

            if (draggedIndex === -1 || targetIndex === -1) {
                return;
            }

            // Move the dragged item
            const [draggedItem] = sections.splice(draggedIndex, 1);
            sections.splice(targetIndex, 0, draggedItem);

            // Save new order
            await this.saveSectionOrder(sections);
            
            // Refresh the tree
            this.refresh();

            vscode.window.showInformationMessage(`Sections reordered`);
        } catch (error) {
            console.error('Error during drop:', error);
        }
    }

    /**
     * Get the current section order as IDs (for external use)
     */
    getSectionIds(): string[] {
        return this.getSectionOrder().map(s => s.id);
    }
}
