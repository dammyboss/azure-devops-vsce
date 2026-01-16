import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

export class GitIntegration {
    private workspaceRoot: string;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    async getCurrentBranch(): Promise<string | null> {
        try {
            const { stdout } = await exec('git branch --show-current', { cwd: this.workspaceRoot });
            return stdout.trim();
        } catch (error) {
            console.error('Failed to get current branch:', error);
            return null;
        }
    }

    async createBranch(branchName: string, fromBranch: string = 'main'): Promise<boolean> {
        try {
            await exec(`git checkout -b ${branchName} ${fromBranch}`, { cwd: this.workspaceRoot });
            vscode.window.showInformationMessage(`Created and switched to branch: ${branchName}`);
            return true;
        } catch (error) {
            console.error('Failed to create branch:', error);
            vscode.window.showErrorMessage(`Failed to create branch: ${error}`);
            return false;
        }
    }

    async commitWithWorkItemLink(workItemId: number, message: string): Promise<boolean> {
        try {
            const commitMessage = `#${workItemId} ${message}`;
            await exec(`git commit -m "${commitMessage}"`, { cwd: this.workspaceRoot });
            vscode.window.showInformationMessage(`Committed with work item link: #${workItemId}`);
            return true;
        } catch (error) {
            console.error('Failed to commit:', error);
            vscode.window.showErrorMessage(`Failed to commit: ${error}`);
            return false;
        }
    }

    async getUncommittedChanges(): Promise<string[]> {
        try {
            const { stdout } = await exec('git status --porcelain', { cwd: this.workspaceRoot });
            return stdout.split('\n').filter(line => line.trim());
        } catch (error) {
            console.error('Failed to get uncommitted changes:', error);
            return [];
        }
    }

    async stageFiles(files: string[]): Promise<boolean> {
        try {
            if (files.length === 0) {
                await exec('git add .', { cwd: this.workspaceRoot });
            } else {
                await exec(`git add ${files.join(' ')}`, { cwd: this.workspaceRoot });
            }
            return true;
        } catch (error) {
            console.error('Failed to stage files:', error);
            return false;
        }
    }

    async getWorkItemIdsFromBranch(): Promise<number[]> {
        const branchName = await this.getCurrentBranch();
        if (!branchName) {
            return [];
        }

        // Extract work item IDs from branch name (e.g., feature/123-some-feature)
        const matches = branchName.match(/(\d+)/g);
        if (!matches) {
            return [];
        }

        return matches.map(match => parseInt(match, 10)).filter(id => !isNaN(id));
    }

    async getRecentCommits(limit: number = 10): Promise<Array<{ hash: string; message: string; date: string }>> {
        try {
            const { stdout } = await exec(
                `git log --oneline --pretty=format:"%H|%s|%ad" --date=short -n ${limit}`,
                { cwd: this.workspaceRoot }
            );

            return stdout.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [hash, message, date] = line.split('|');
                    return { hash, message, date };
                });
        } catch (error) {
            console.error('Failed to get recent commits:', error);
            return [];
        }
    }

    async isGitRepository(): Promise<boolean> {
        try {
            await exec('git rev-parse --git-dir', { cwd: this.workspaceRoot });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getRepositoryUrl(): Promise<string | null> {
        try {
            const { stdout } = await exec('git config --get remote.origin.url', { cwd: this.workspaceRoot });
            return stdout.trim();
        } catch (error) {
            console.error('Failed to get repository URL:', error);
            return null;
        }
    }

    async pushToRemote(branchName?: string): Promise<boolean> {
        try {
            const branch = branchName || await this.getCurrentBranch();
            if (!branch) {
                vscode.window.showErrorMessage('No branch to push');
                return false;
            }

            await exec(`git push origin ${branch}`, { cwd: this.workspaceRoot });
            vscode.window.showInformationMessage(`Pushed ${branch} to remote`);
            return true;
        } catch (error) {
            console.error('Failed to push:', error);
            vscode.window.showErrorMessage(`Failed to push: ${error}`);
            return false;
        }
    }

    async createPullRequest(title: string, description: string, targetBranch: string = 'main'): Promise<boolean> {
        try {
            const currentBranch = await this.getCurrentBranch();
            if (!currentBranch) {
                vscode.window.showErrorMessage('Not on a git branch');
                return false;
            }

            // First push the branch
            await this.pushToRemote(currentBranch);

            // Note: Creating a PR via CLI depends on the git hosting service
            // For Azure DevOps, we would need to use the REST API
            vscode.window.showInformationMessage(
                `Ready to create PR: ${title}\n` +
                `From: ${currentBranch}\n` +
                `To: ${targetBranch}\n\n` +
                `Please create the PR in Azure DevOps web interface.`
            );

            return true;
        } catch (error) {
            console.error('Failed to create pull request:', error);
            vscode.window.showErrorMessage(`Failed to create pull request: ${error}`);
            return false;
        }
    }

    dispose(): void {
        // Clean up any resources
    }
}