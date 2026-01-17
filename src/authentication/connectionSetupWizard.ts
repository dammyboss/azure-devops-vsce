import * as vscode from 'vscode';
import axios from 'axios';
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
        try {
            const session = await vscode.authentication.getSession('microsoft', [
                'https://app.vssps.visualstudio.com/.default'
            ], { createIfNone: true });

            if (!session) {
                vscode.window.showErrorMessage('Authentication cancelled or failed.');
                return null;
            }

            return session;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Authentication error: ${error.message}`);
            return null;
        }
    }

    /**
     * Step 2: Get organization name
     */
    private async selectOrganizationStep(accessToken: string): Promise<Organization | undefined> {
        try {
            // Prompt user for organization name
            const orgInput = await vscode.window.showInputBox({
                prompt: 'Enter your Azure DevOps organization name',
                placeHolder: 'e.g., myorganization (or https://dev.azure.com/myorganization)',
                ignoreFocusOut: true
            });

            if (!orgInput) {
                throw new Error('Organization name is required.');
            }

            // Extract organization name from URL or use as-is
            let orgName = orgInput.trim();
            
            // Handle various URL formats
            if (orgName.includes('dev.azure.com')) {
                // Extract from URL like https://dev.azure.com/dammyboss or dev.azure.com/dammyboss
                const match = orgName.match(/dev\.azure\.com\/([^\/\s]+)/);
                if (match && match[1]) {
                    orgName = match[1];
                }
            }

            console.log(`Verifying organization: ${orgName}`);

            // Verify the organization exists by trying to fetch projects
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Verifying organization: ${orgName}...`,
                    cancellable: false
                },
                async () => {
                    try {
                        // Test if organization exists
                        const response = await axios.get(`https://dev.azure.com/${orgName}/_apis/projects`, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            params: { '$top': 1, 'api-version': '7.1-preview.4' }
                        });

                        console.log(`Organization ${orgName} verified successfully`);

                        // Organization exists
                        const org: Organization = {
                            id: orgName,
                            name: orgName,
                            url: `https://dev.azure.com/${orgName}`,
                            accountUri: `https://dev.azure.com/${orgName}`
                        };

                        return org;
                    } catch (error: any) {
                        console.error(`Failed to access organization ${orgName}:`, error.response?.status, error.message);
                        throw new Error(`Organization "${orgName}" not found or access denied. Status: ${error.response?.status}`);
                    }
                }
            );
        } catch (error: any) {
            throw new Error(`Failed to select organization: ${error.message}`);
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
                    title: `Fetching projects from ${org.name}...`,
                    cancellable: false
                },
                async () => {
                    try {
                        const projects = await this.orgManager.getProjects(org.url, accessToken);
                        if (projects.length === 0) {
                            throw new Error('No projects found in this organization.');
                        }
                        return await this.orgManager.selectProject(projects);
                    } catch (error: any) {
                        console.error('Project fetch error:', error.message);
                        throw error;
                    }
                }
            );
        } catch (error: any) {
            throw new Error(`Failed to select project: ${error.message}`);
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
                    title: `Fetching teams from ${project.name}...`,
                    cancellable: false
                },
                async () => {
                    const teams = await this.orgManager.getTeams(org.url, project.id, accessToken);
                    return await this.orgManager.selectTeam(teams);
                }
            );
        } catch (error: any) {
            console.error('Team selection error (non-critical):', error);
            return undefined;
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
