import * as vscode from 'vscode';
import axios from 'axios';

export interface Organization {
    id: string;
    name: string;
    url: string;
    accountUri?: string;
}

export interface Project {
    id: string;
    name: string;
    url: string;
}

export interface Team {
    id: string;
    name: string;
    url: string;
}

/**
 * Manages organization discovery and selection
 */
export class OrganizationManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Get user's organizations from Azure DevOps
     */
    async getOrganizations(accessToken: string): Promise<Organization[]> {
        try {
            // Try multiple endpoints - Azure DevOps API that accepts bearer tokens
            const response = await axios.get('https://dev.azure.com/_apis/organizations', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: { 'api-version': '7.1-preview.1' }
            });

            const organizations: Organization[] = (response.data.value || []).map((org: any) => ({
                id: org.id,
                name: org.name,
                url: `https://dev.azure.com/${org.name}`,
                accountUri: `https://dev.azure.com/${org.name}`
            }));

            return organizations;
        } catch (error: any) {
            console.error('Failed to fetch organizations:', error.message);
            throw new Error('Failed to fetch organizations. Make sure your account has proper permissions.');
        }
    }

    /**
     * Get organizations from cached settings
     */
    async getCachedOrganizations(): Promise<Organization[]> {
        const cached = this.context.globalState.get<Organization[]>('azure-devops.organizations', []);
        return cached;
    }

    /**
     * Cache organizations
     */
    async cacheOrganizations(orgs: Organization[]): Promise<void> {
        await this.context.globalState.update('azure-devops.organizations', orgs);
    }

    /**
     * Show organization picker
     */
    async selectOrganization(organizations: Organization[]): Promise<Organization | undefined> {
        if (organizations.length === 0) {
            vscode.window.showErrorMessage('No organizations found.');
            return undefined;
        }

        if (organizations.length === 1) {
            return organizations[0];
        }

        const selected = await vscode.window.showQuickPick(
            organizations.map(org => ({
                label: `$(organization) ${org.name}`,
                description: org.url,
                organization: org
            })),
            {
                title: 'Select Azure DevOps Organization',
                placeHolder: 'Choose the organization to connect to...'
            }
        );

        return selected?.organization;
    }

    /**
     * Get projects from organization
     */
    async getProjects(organizationUrl: string, accessToken: string): Promise<Project[]> {
        try {
            const response = await axios.get(`${organizationUrl}/_apis/projects`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: { 'api-version': '7.1-preview.4' }
            });

            const projects: Project[] = (response.data.value || []).map((proj: any) => ({
                id: proj.id,
                name: proj.name,
                url: proj.url
            }));

            return projects;
        } catch (error: any) {
            console.error('Failed to fetch projects:', error.message);
            throw new Error('Failed to fetch projects from organization.');
        }
    }

    /**
     * Show project picker
     */
    async selectProject(projects: Project[]): Promise<Project | undefined> {
        if (projects.length === 0) {
            vscode.window.showErrorMessage('No projects found in this organization.');
            return undefined;
        }

        if (projects.length === 1) {
            return projects[0];
        }

        const selected = await vscode.window.showQuickPick(
            projects.map(proj => ({
                label: `$(project) ${proj.name}`,
                description: proj.url,
                project: proj
            })),
            {
                title: 'Select Azure DevOps Project',
                placeHolder: 'Choose the project to work with...'
            }
        );

        return selected?.project;
    }

    /**
     * Get teams from project
     */
    async getTeams(organizationUrl: string, projectId: string, accessToken: string): Promise<Team[]> {
        try {
            const response = await axios.get(
                `${organizationUrl}/_apis/projects/${encodeURIComponent(projectId)}/teams`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    params: { 'api-version': '7.1-preview.3' }
                }
            );

            const teams: Team[] = (response.data.value || []).map((team: any) => ({
                id: team.id,
                name: team.name,
                url: team.url
            }));

            return teams;
        } catch (error: any) {
            console.error('Failed to fetch teams:', error.message);
            // Teams are optional, so return empty array
            return [];
        }
    }

    /**
     * Show team picker
     */
    async selectTeam(teams: Team[]): Promise<Team | undefined> {
        if (teams.length === 0) {
            return undefined;
        }

        if (teams.length === 1) {
            return teams[0];
        }

        const selected = await vscode.window.showQuickPick(
            teams.map(team => ({
                label: `$(people) ${team.name}`,
                description: team.url,
                team: team
            })),
            {
                title: 'Select Team (Optional)',
                placeHolder: 'Choose a team or press Escape to skip...',
                canPickMany: false
            }
        );

        return selected?.team;
    }

    /**
     * Clear cached organizations
     */
    async clearCache(): Promise<void> {
        await this.context.globalState.update('azure-devops.organizations', undefined);
    }
}
