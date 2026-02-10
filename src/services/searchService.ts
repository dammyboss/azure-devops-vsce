import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';
import { WorkItem } from '../models/workItem';
import { CacheManager } from '../utils/cacheManager';

export class SearchService {
    private cacheManager: CacheManager;
    private static readonly RECENT_ITEMS_KEY = 'recentWorkItems';
    private static readonly MAX_RECENT_ITEMS = 20;
    private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor(
        private context: vscode.ExtensionContext,
        private authManager: AuthenticationManager
    ) {
        this.cacheManager = new CacheManager();
    }

    /**
     * Search for work items using WIQL query
     * Supports ID-based search (#123) and text search
     */
    async searchWorkItems(searchTerm: string, maxResults: number = 50): Promise<WorkItem[]> {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        const axiosInstance = this.authManager.getAxiosInstance();
        const config = this.authManager.getConfig();

        if (!axiosInstance || !config?.defaultProject) {
            return [];
        }

        try {
            // Parse search term
            const parsed = this.parseSearchTerm(searchTerm.trim());

            let wiql: string;
            if (parsed.isId) {
                // ID-based search
                wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo]
                        FROM WorkItems
                        WHERE [System.TeamProject] = @project
                        AND [System.Id] = ${parsed.value}`;
            } else {
                // Text-based search - search in Title and Description
                const escapedTerm = parsed.value.replace(/'/g, "''");
                wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo]
                        FROM WorkItems
                        WHERE [System.TeamProject] = @project
                        AND ([System.Title] CONTAINS '${escapedTerm}' OR [System.Description] CONTAINS '${escapedTerm}')
                        ORDER BY [System.ChangedDate] DESC`;
            }

            // Check cache
            const cacheKey = `search:${searchTerm}`;
            const cached = this.cacheManager.get<WorkItem[]>(cacheKey);
            if (cached) {
                return cached;
            }

            // Execute WIQL query
            const wiqlResponse = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql },
                { params: { 'api-version': '7.1' } }
            );

            const workItemRefs = wiqlResponse.data.workItems || [];
            if (workItemRefs.length === 0) {
                return [];
            }

            // Get detailed work item information (limit to maxResults)
            const workItemIds = workItemRefs.slice(0, maxResults).map((ref: any) => ref.id);
            const detailsResponse = await axiosInstance.get(
                '/_apis/wit/workitems',
                {
                    params: {
                        'ids': workItemIds.join(','),
                        '$expand': 'relations',
                        'api-version': '7.1'
                    }
                }
            );

            const workItems = detailsResponse.data.value || [];

            // Cache results
            this.cacheManager.set(cacheKey, workItems, SearchService.CACHE_TTL);

            return workItems;
        } catch (error: any) {
            console.error('[SearchService] Search failed:', error?.message || error);
            return [];
        }
    }

    /**
     * Get work item by ID
     */
    async getWorkItemById(id: number): Promise<WorkItem | null> {
        const axiosInstance = this.authManager.getAxiosInstance();
        if (!axiosInstance) {
            return null;
        }

        try {
            const response = await axiosInstance.get(
                `/_apis/wit/workitems/${id}`,
                {
                    params: {
                        '$expand': 'all',
                        'api-version': '7.1'
                    }
                }
            );

            return response.data;
        } catch (error: any) {
            console.error(`[SearchService] Failed to get work item ${id}:`, error?.message || error);
            return null;
        }
    }

    /**
     * Get recent work items accessed by the user
     */
    async getRecentWorkItems(): Promise<WorkItem[]> {
        const recentIds = this.getRecentWorkItemIds();
        if (recentIds.length === 0) {
            return [];
        }

        const axiosInstance = this.authManager.getAxiosInstance();
        if (!axiosInstance) {
            return [];
        }

        try {
            // Get work items in batch
            const response = await axiosInstance.get(
                '/_apis/wit/workitems',
                {
                    params: {
                        'ids': recentIds.join(','),
                        '$expand': 'relations',
                        'api-version': '7.1'
                    }
                }
            );

            const workItems = response.data.value || [];

            // Sort by recent order (maintain the order of IDs)
            return workItems.sort((a: WorkItem, b: WorkItem) => {
                return recentIds.indexOf(a.id) - recentIds.indexOf(b.id);
            });
        } catch (error: any) {
            console.error('[SearchService] Failed to get recent work items:', error?.message || error);
            return [];
        }
    }

    /**
     * Add a work item to recent list
     */
    addToRecent(workItemId: number): void {
        let recentIds = this.getRecentWorkItemIds();

        // Remove if already exists
        recentIds = recentIds.filter(id => id !== workItemId);

        // Add to front
        recentIds.unshift(workItemId);

        // Limit to max items
        recentIds = recentIds.slice(0, SearchService.MAX_RECENT_ITEMS);

        // Save to global state
        this.context.globalState.update(SearchService.RECENT_ITEMS_KEY, recentIds);
    }

    /**
     * Get recent work item IDs from storage
     */
    private getRecentWorkItemIds(): number[] {
        return this.context.globalState.get<number[]>(SearchService.RECENT_ITEMS_KEY, []);
    }

    /**
     * Parse search term to determine if it's an ID or text search
     */
    private parseSearchTerm(term: string): { isId: boolean; value: string } {
        // Check if it starts with # (e.g., #123)
        if (term.startsWith('#')) {
            const id = term.substring(1);
            if (/^\d+$/.test(id)) {
                return { isId: true, value: id };
            }
        }

        // Check if it's just a number
        if (/^\d+$/.test(term)) {
            return { isId: true, value: term };
        }

        // Otherwise, it's a text search
        return { isId: false, value: term };
    }

    /**
     * Clear search cache
     */
    clearCache(): void {
        this.cacheManager.invalidatePattern('search:');
    }
}
