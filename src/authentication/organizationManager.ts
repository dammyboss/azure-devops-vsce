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
     * Get user's organizations by prompting for organization name
     * Since we're using Azure DevOps app scope, we'll prompt the user
     */
    async getOrganizations(accessToken: string): Promise<Organization[]> {
        try {
            // With Azure DevOps app scope, automatic organization discovery via API may not work
            // Instead, prompt the user for their organization name
            const orgName = await vscode.window.showInputBox({
                title: 'Enter Azure DevOps Organization',
                placeHolder: 'e.g., myorg or https://dev.azure.com/myorg',
                prompt: 'Enter your Azure DevOps organization name or full URL'
            });

            if (!orgName) {
                throw new Error('Organization name is required');
            }

            // Parse organization name from URL or use as-is
            let cleanOrgName = orgName.trim();
            if (cleanOrgName.includes('/')) {
                // Extract from URL like https://dev.azure.com/myorg
                const parts = cleanOrgName.split('/');
                cleanOrgName = parts[parts.length - 1];
            }

            // Verify the organization exists by trying to fetch its projects
            const verifyUrl = `https://dev.azure.com/${cleanOrgName}/_apis/projects`;
            await axios.get(verifyUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: { 'api-version': '7.1' }
            });

            // If verification succeeds, return the organization
            const organization: Organization = {
                id: cleanOrgName,
                name: cleanOrgName,
                url: `https://dev.azure.com/${cleanOrgName}`,
                accountUri: `https://dev.azure.com/${cleanOrgName}`
            };

            return [organization];
        } catch (error: any) {
            console.error('Failed to fetch organizations:', error.message);
            if (error.response?.status === 404) {
                vscode.window.showErrorMessage(`Organization not found or not accessible: "${error.config?.url}"`);
            } else if (error.response?.status === 401) {
                vscode.window.showErrorMessage('Authentication failed. Your token may have expired.');
            } else if (error.message === 'Organization name is required') {
                // User cancelled
                throw error;
            } else {
                vscode.window.showErrorMessage('Failed to verify organization. Please check the name and try again.');
            }
            throw new Error('Failed to fetch organizations.');
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
