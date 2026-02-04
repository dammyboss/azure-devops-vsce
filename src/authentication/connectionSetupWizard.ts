import * as vscode from 'vscode';
import { AuthenticationManager } from './authenticationManager';
import { OrganizationManager, Organization, Project, Team } from './organizationManager';

/**
 * Manages the complete connection setup flow with organization and project selection
 */
export class ConnectionSetupWizard {
    private authManager: AuthenticationManager;
    private orgManager: OrganizationManager;
    private context: vscode.ExtensionContext;
    private currentSession: vscode.AuthenticationSession | null = null;

    constructor(context: vscode.ExtensionContext, authManager: AuthenticationManager, orgManager: OrganizationManager) {
        this.context = context;
        this.authManager = authManager;
        this.orgManager = orgManager;
    }

    /**
     * Run the complete setup wizard
     */
    async runSetup(): Promise<boolean> {
        try {
            // Step 1: Authenticate user
            const session = await this.authenticate();
            if (!session) {
                return false;
            }

            this.currentSession = session;
            vscode.window.showInformationMessage('✓ Authentication successful!');

            // Step 2: Get and select organization
            const org = await this.selectOrganizationStep(session.accessToken);
            if (!org) {
                return false;
            }

            vscode.window.showInformationMessage(`✓ Organization selected: ${org.name}`);

            // Step 3: Get and select project
            const project = await this.selectProjectStep(org, session.accessToken);
            if (!project) {
                return false;
            }

            vscode.window.showInformationMessage(`✓ Project selected: ${project.name}`);

            // Step 4: Optionally select team
            const team = await this.selectTeamStep(org, project, session.accessToken);
            if (team) {
                vscode.window.showInformationMessage(`✓ Team selected: ${team.name}`);
            }

            // Step 5: Save configuration
            await this.saveConfiguration(org, project, team, session);
            vscode.window.showInformationMessage('✓ Configuration saved!');

            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Setup failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Step 1: Authenticate user
     */
    private async authenticate(): Promise<vscode.AuthenticationSession | null> {
        // Get existing session from AuthenticationManager (includes tenant scope if set)
        const session = await this.authManager.getSession();

        if (!session) {
            vscode.window.showErrorMessage('Not authenticated. Please sign in first.');
            return null;
        }

        return session;
    }

    /**
     * Step 2: Select organization
     */
    private async selectOrganizationStep(accessToken: string): Promise<Organization | undefined> {
        try {
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Discovering your Azure DevOps organizations...',
                    cancellable: false
                },
                async () => {
                    // Auto-discover organizations using profile API
                    const organizations = await this.discoverOrganizations(accessToken);

                    if (!organizations || organizations.length === 0) {
                        throw new Error('No Azure DevOps organizations found. Please make sure you have access to at least one organization.');
                    }

                    // Show discovered organizations
                    const orgItems = organizations.map(org => ({
                        label: org.name,
                        description: org.url,
                        detail: `Select this organization`,
                        org
                    }));

                    const selectedOrg = await vscode.window.showQuickPick(orgItems, {
                        placeHolder: `Select an organization (found ${organizations.length})`,
                        ignoreFocusOut: true,
                        matchOnDescription: true
                    });

                    return selectedOrg?.org;
                }
            );
        } catch (error: any) {
            throw new Error(`Failed to select organization: ${error.message}`);
        }
    }

    /**
     * Auto-discover organizations using Azure DevOps profile API
     */
    private async discoverOrganizations(accessToken: string): Promise<Organization[]> {
        const axios = require('axios');
        
        try {
            // Get user profile
            const profileResponse = await axios.get(
                'https://app.vssps.visualstudio.com/_apis/profile/profiles/me',
                {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    params: { 'api-version': '7.1' }
                }
            );

            const memberId = profileResponse.data.id;

            // Get organizations for this user
            const accountsResponse = await axios.get(
                'https://app.vssps.visualstudio.com/_apis/accounts',
                {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    params: {
                        'memberId': memberId,
                        'api-version': '7.1'
                    }
                }
            );

            if (accountsResponse.data && accountsResponse.data.count > 0) {
                return accountsResponse.data.value.map((account: any) => {
                    let accountUri = account.accountUri || '';

                    // Normalize URL
                    if (accountUri) {
                        accountUri = accountUri.replace('vssps.dev.azure.com', 'dev.azure.com');
                        accountUri = accountUri.replace('.vssps.visualstudio.com', '.visualstudio.com');
                        accountUri = accountUri.replace(/\/+$/, '');
                    }

                    if (!accountUri || !accountUri.startsWith('http')) {
                        accountUri = `https://dev.azure.com/${account.accountName}`;
                    }

                    return {
                        id: account.accountId,
                        name: account.accountName,
                        url: accountUri
                    };
                });
            }

            return [];
        } catch (error: any) {
            throw new Error(`Unable to discover organizations: ${error.message}`);
        }
    }

    /**
     * Step 3: Select project
     */
    private async selectProjectStep(org: Organization, accessToken: string): Promise<Project | undefined> {
        try {
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Loading projects from ${org.name}...`,
                    cancellable: false
                },
                async () => {
                    const projects = await this.getProjects(org.url, accessToken);
                    
                    if (!projects || projects.length === 0) {
                        throw new Error(`No projects found in organization "${org.name}".`);
                    }

                    const projectItems = projects.map(project => ({
                        label: project.name,
                        project
                    }));

                    const selectedProject = await vscode.window.showQuickPick(projectItems, {
                        placeHolder: 'Select a project',
                        ignoreFocusOut: true
                    });

                    return selectedProject?.project;
                }
            );
        } catch (error: any) {
            throw new Error(`Failed to select project: ${error.message}`);
        }
    }

    /**
     * Get projects from organization
     */
    private async getProjects(organizationUrl: string, accessToken: string): Promise<Project[]> {
        const axios = require('axios');
        
        try {
            const cleanUrl = organizationUrl.trim().replace(/\/+$/, '');
            const projectsUrl = `${cleanUrl}/_apis/projects`;

            const response = await axios.get(projectsUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { 'api-version': '7.1' }
            });

            return response.data.value || [];
        } catch (error: any) {
            if (error.response?.status === 401) {
                throw new Error('Authentication failed. Your access token may have expired.');
            } else if (error.response?.status === 404) {
                throw new Error('Organization not found. Please verify the organization name.');
            } else {
                throw new Error(`Failed to access organization: ${error.message}`);
            }
        }
    }

    /**
     * Step 4: Select team (optional)
     */
    private async selectTeamStep(org: Organization, project: Project, accessToken: string): Promise<Team | undefined> {
        try {
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Loading teams from ${project.name}...`,
                    cancellable: false
                },
                async () => {
                    const teams = await this.getTeams(org.url, project.id, accessToken);
                    
                    if (!teams || teams.length === 0) {
                        return undefined;
                    }

                    const teamItems = teams.map(team => ({
                        label: team.name,
                        team
                    }));

                    const selectedTeam = await vscode.window.showQuickPick(teamItems, {
                        placeHolder: 'Select a team (optional)',
                        ignoreFocusOut: true
                    });

                    return selectedTeam?.team;
                }
            );
        } catch (error: any) {
            console.error('Team selection error (non-critical):', error);
            return undefined;
        }
    }

    /**
     * Get teams from project
     */
    private async getTeams(organizationUrl: string, projectId: string, accessToken: string): Promise<Team[]> {
        const axios = require('axios');
        
        try {
            const cleanUrl = organizationUrl.trim().replace(/\/+$/, '');
            const teamsUrl = `${cleanUrl}/_apis/projects/${encodeURIComponent(projectId)}/teams`;

            const response = await axios.get(teamsUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { 'api-version': '7.1-preview.3' }
            });

            return response.data.value || [];
        } catch (error: any) {
            console.error('Failed to get teams:', error);
            return [];
        }
    }

    /**
     * Step 5: Save configuration
     */
    private async saveConfiguration(org: Organization, project: Project, team: Team | undefined, session: vscode.AuthenticationSession): Promise<void> {
        const config = vscode.workspace.getConfiguration('azureDevOps');

        // Save organization URL
        await config.update('organizationUrl', org.url, vscode.ConfigurationTarget.Global);

        // Save project
        await config.update('defaultProject', project.name, vscode.ConfigurationTarget.Global);

        // Save team if selected
        if (team) {
            await config.update('defaultTeam', team.name, vscode.ConfigurationTarget.Global);
        }

        // Save to global state for later reference
        await this.context.globalState.update('azure-devops.currentOrg', org);
        await this.context.globalState.update('azure-devops.currentProject', project);
        if (team) {
            await this.context.globalState.update('azure-devops.currentTeam', team);
        }

        // Update auth manager with new config
        this.authManager.setConfig({
            organizationUrl: org.url,
            personalAccessToken: session.accessToken,
            defaultProject: project.name,
            defaultTeam: team?.name
        });
    }

    /**
     * Get saved configuration
     */
    async getSavedConfiguration(): Promise<{ org?: Organization; project?: Project; team?: Team }> {
        const org = await this.context.globalState.get<Organization>('azure-devops.currentOrg');
        const project = await this.context.globalState.get<Project>('azure-devops.currentProject');
        const team = await this.context.globalState.get<Team>('azure-devops.currentTeam');

        return { org, project, team };
    }
}
