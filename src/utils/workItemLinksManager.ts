import * as vscode from 'vscode';
import { AuthenticationManager } from '../authentication/authenticationManager';

export interface WorkItemLink {
    rel: string;
    url: string;
    attributes?: {
        name?: string;
    };
}

export interface LinkedWorkItem {
    id: number;
    title: string;
    state: string;
    type: string;
    linkType: string;
}

export class WorkItemLinksManager {
    constructor(private authenticationManager: AuthenticationManager) {}

    async getLinkedWorkItems(workItemId: number): Promise<LinkedWorkItem[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return [];

            const response = await axiosInstance.get(`/_apis/wit/workitems/${workItemId}`, {
                params: { '$expand': 'relations', 'api-version': '7.0' }
            });

            const relations = response.data.relations || [];
            const linkedItems: LinkedWorkItem[] = [];

            for (const relation of relations) {
                if (relation.rel && relation.url && relation.url.includes('workItems')) {
                    const linkedIdMatch = relation.url.match(/workItems\/(\d+)/);
                    if (linkedIdMatch) {
                        const linkedId = parseInt(linkedIdMatch[1]);
                        const linkedItem = await this.getWorkItemById(linkedId);
                        if (linkedItem) {
                            linkedItems.push({
                                id: linkedId,
                                title: linkedItem.fields['System.Title'],
                                state: linkedItem.fields['System.State'],
                                type: linkedItem.fields['System.WorkItemType'],
                                linkType: this.getLinkTypeName(relation.rel)
                            });
                        }
                    }
                }
            }

            return linkedItems;
        } catch (error) {
            console.error('Failed to get linked work items:', error);
            return [];
        }
    }

    async addLink(sourceId: number, targetId: number, linkType: string): Promise<boolean> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return false;

            const patchDocument = [{
                op: 'add',
                path: '/relations/-',
                value: {
                    rel: this.getLinkTypeRel(linkType),
                    url: await this.getWorkItemUrl(targetId),
                    attributes: { comment: `Linked via VS Code extension` }
                }
            }];

            await axiosInstance.patch(
                `/_apis/wit/workitems/${sourceId}`,
                patchDocument,
                { headers: { 'Content-Type': 'application/json-patch+json' }, params: { 'api-version': '7.0' } }
            );

            return true;
        } catch (error) {
            console.error('Failed to add link:', error);
            return false;
        }
    }

    async removeLink(sourceId: number, targetId: number, linkType: string): Promise<boolean> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return false;

            const response = await axiosInstance.get(`/_apis/wit/workitems/${sourceId}`, {
                params: { '$expand': 'relations', 'api-version': '7.0' }
            });

            const relations = response.data.relations || [];
            const targetUrl = await this.getWorkItemUrl(targetId);
            const linkRel = this.getLinkTypeRel(linkType);

            const relationIndex = relations.findIndex((r: any) => 
                r.url === targetUrl && r.rel === linkRel
            );

            if (relationIndex === -1) return false;

            const patchDocument = [{
                op: 'remove',
                path: `/relations/${relationIndex}`
            }];

            await axiosInstance.patch(
                `/_apis/wit/workitems/${sourceId}`,
                patchDocument,
                { headers: { 'Content-Type': 'application/json-patch+json' }, params: { 'api-version': '7.0' } }
            );

            return true;
        } catch (error) {
            console.error('Failed to remove link:', error);
            return false;
        }
    }

    async searchWorkItems(searchTerm: string): Promise<any[]> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            const config = this.authenticationManager.getConfig();
            
            if (!axiosInstance || !config?.defaultProject) return [];

            const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo]
                          FROM WorkItems
                          WHERE [System.TeamProject] = @project
                          AND ([System.Title] CONTAINS '${searchTerm}' OR [System.Id] = '${searchTerm}')
                          ORDER BY [System.ChangedDate] DESC`;

            const response = await axiosInstance.post(
                `/${encodeURIComponent(config.defaultProject)}/_apis/wit/wiql`,
                { query: wiql },
                { params: { 'api-version': '7.0' } }
            );

            const workItemRefs = response.data.workItems || [];
            if (workItemRefs.length === 0) return [];

            const workItemIds = workItemRefs.slice(0, 20).map((item: any) => item.id).join(',');
            const detailsResponse = await axiosInstance.get(`/_apis/wit/workitems`, {
                params: { ids: workItemIds, 'api-version': '7.0' }
            });

            return detailsResponse.data.value || [];
        } catch (error) {
            console.error('Failed to search work items:', error);
            return [];
        }
    }

    private async getWorkItemById(id: number): Promise<any> {
        try {
            const axiosInstance = this.authenticationManager.getAxiosInstance();
            if (!axiosInstance) return null;

            const response = await axiosInstance.get(`/_apis/wit/workitems/${id}`, {
                params: { 'api-version': '7.0' }
            });
            return response.data;
        } catch (error) {
            return null;
        }
    }

    private async getWorkItemUrl(id: number): Promise<string> {
        const config = this.authenticationManager.getConfig();
        if (!config) return '';
        return `${config.organizationUrl}/_apis/wit/workItems/${id}`;
    }

    private getLinkTypeRel(linkType: string): string {
        const map: Record<string, string> = {
            'Parent': 'System.LinkTypes.Hierarchy-Reverse',
            'Child': 'System.LinkTypes.Hierarchy-Forward',
            'Related': 'System.LinkTypes.Related',
            'Predecessor': 'System.LinkTypes.Dependency-Reverse',
            'Successor': 'System.LinkTypes.Dependency-Forward'
        };
        return map[linkType] || 'System.LinkTypes.Related';
    }

    private getLinkTypeName(rel: string): string {
        const map: Record<string, string> = {
            'System.LinkTypes.Hierarchy-Reverse': 'Parent',
            'System.LinkTypes.Hierarchy-Forward': 'Child',
            'System.LinkTypes.Related': 'Related',
            'System.LinkTypes.Dependency-Reverse': 'Predecessor',
            'System.LinkTypes.Dependency-Forward': 'Successor'
        };
        return map[rel] || 'Related';
    }
}
