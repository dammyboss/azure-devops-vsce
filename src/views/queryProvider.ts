import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem } from '../models/workItem';

export interface Query {
    id: string;
    name: string;
    path: string;
    isFolder: boolean;
    hasChildren: boolean;
    children?: Query[];
    queryType?: string;
    wiql?: string;
}

export class QueryProvider implements vscode.TreeDataProvider<QueryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<QueryTreeItem | undefined | void> = new vscode.EventEmitter<QueryTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<QueryTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    private authenticationManager: AuthenticationManager;
    private queries: Query[] = [];
    private queryResults: Map<string, WorkItem[]> = new Map();

    constructor(context: vscode.ExtensionContext, authenticationManager: AuthenticationManager) {
        this.context = context;
        this.authenticationManager = authenticationManager;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
        this.loadQueries();
    }

    private async loadQueries(): Promise<void> {
        if (!this.authenticationManager.isConnected()) {
            this.queries = [];
            return;
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                this.queries = [];
                return;
            }

            // Get query folders and queries
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/queries`,
                {
                    params: {
                        '$depth': 2,
                        '$expand': 'all'
                    }
                }
            );

            this.queries = this.parseQueryHierarchy(response.data.value || []);
        } catch (error: any) {
            console.error('Failed to load queries:', error?.message || error);
            this.queries = [];
        }
    }

    private parseQueryHierarchy(items: any[]): Query[] {
        return items.map(item => ({
            id: item.id,
            name: item.name,
            path: item.path,
            isFolder: item.isFolder || false,
            hasChildren: item.hasChildren || false,
            children: item.children ? this.parseQueryHierarchy(item.children) : undefined,
            queryType: item.queryType,
            wiql: item.wiql
        }));
    }

    getTreeItem(element: QueryTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: QueryTreeItem): Promise<QueryTreeItem[]> {
        if (!this.authenticationManager.isConnected()) {
            return [];
        }

        if (!element) {
            // Root level - show query folders
            await this.loadQueries();

            if (this.queries.length === 0) {
                return [new QueryTreeItem('No queries found', vscode.TreeItemCollapsibleState.None)];
            }

            return this.queries.map(query => this.createQueryTreeItem(query));
        } else if (element.contextValue === 'queryFolder' && element.query?.children) {
            // Show child queries
            return element.query.children.map(query => this.createQueryTreeItem(query));
        } else if (element.contextValue === 'queryResults') {
            // Show query results
            const results = this.queryResults.get(element.queryId || '');
            if (!results || results.length === 0) {
                return [new QueryTreeItem('No results', vscode.TreeItemCollapsibleState.None)];
            }

            return results.map(item => {
                const title = item.fields['System.Title'];
                const state = item.fields['System.State'];
                const type = item.fields['System.WorkItemType'];

                const treeItem = new QueryTreeItem(
                    `#${item.id}: ${title}`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'azureDevOps.openWorkItem',
                        title: 'Open Work Item',
                        arguments: [item.id]
                    }
                );

                treeItem.description = `${type} • ${state}`;
                treeItem.contextValue = 'workItem';
                treeItem.workItemId = item.id;

                return treeItem;
            });
        }

        return [];
    }

    private createQueryTreeItem(query: Query): QueryTreeItem {
        const isFolder = query.isFolder || query.hasChildren;
        const collapsibleState = isFolder
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

        const command = isFolder ? undefined : {
            command: 'azureDevOps.runQuery',
            title: 'Run Query',
            arguments: [query]
        };

        const treeItem = new QueryTreeItem(query.name, collapsibleState, command);

        if (isFolder) {
            treeItem.contextValue = 'queryFolder';
            treeItem.iconPath = new vscode.ThemeIcon('folder');
        } else {
            treeItem.contextValue = 'query';
            treeItem.iconPath = new vscode.ThemeIcon('search');
        }

        treeItem.query = query;
        treeItem.tooltip = query.path;

        return treeItem;
    }

    async runQuery(query: Query): Promise<WorkItem[]> {
        if (!this.authenticationManager.isConnected()) {
            return [];
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                return [];
            }

            // Run the query
            const response = await axiosInstance.get(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql/${query.id}`
            );

            const workItemRefs = response.data.workItems || [];

            if (workItemRefs.length === 0) {
                return [];
            }

            // Get detailed work item information
            const workItemIds = workItemRefs.slice(0, 200).map((item: any) => item.id).join(',');
            const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: {
                    'ids': workItemIds,
                    '$expand': 'all'
                }
            });

            const results = detailsResponse.data.value || [];
            this.queryResults.set(query.id, results);

            return results;
        } catch (error) {
            console.error('Failed to run query:', error);
            vscode.window.showErrorMessage(`Failed to run query: ${error}`);
            return [];
        }
    }

    async runCustomQuery(wiql: string): Promise<WorkItem[]> {
        if (!this.authenticationManager.isConnected()) {
            return [];
        }

        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();

            if (!axiosInstance || !config?.defaultProject) {
                return [];
            }

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql }
            );

            const workItemRefs = response.data.workItems || [];

            if (workItemRefs.length === 0) {
                return [];
            }

            const workItemIds = workItemRefs.slice(0, 200).map((item: any) => item.id).join(',');
            const detailsResponse = await axiosInstance.get('/_apis/wit/workitems', {
                params: {
                    'ids': workItemIds,
                    '$expand': 'all'
                }
            });

            return detailsResponse.data.value || [];
        } catch (error) {
            console.error('Failed to run custom query:', error);
            return [];
        }
    }
}

export class QueryTreeItem extends vscode.TreeItem {
    public query?: Query;
    public queryId?: string;
    public workItemId?: number;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}
