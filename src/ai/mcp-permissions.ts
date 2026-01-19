import * as vscode from 'vscode';

export type PermissionAction = 'allow' | 'deny' | 'allow-always' | 'deny-always';

export interface ToolPermission {
    serverName: string;
    toolName: string;
    action: 'allow' | 'deny';
}

export class MCPPermissionsManager {
    private static instance: MCPPermissionsManager;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public static getInstance(context: vscode.ExtensionContext): MCPPermissionsManager {
        if (!MCPPermissionsManager.instance) {
            MCPPermissionsManager.instance = new MCPPermissionsManager(context);
        }
        return MCPPermissionsManager.instance;
    }

    private getPermissions(): ToolPermission[] {
        return this.context.globalState.get<ToolPermission[]>('mcp.permissions', []);
    }

    private async savePermissions(permissions: ToolPermission[]): Promise<void> {
        await this.context.globalState.update('mcp.permissions', permissions);
    }

    public async checkPermission(serverName: string, toolName: string, toolInput: any): Promise<boolean> {
        const permissions = this.getPermissions();
        const existing = permissions.find(p => p.serverName === serverName && p.toolName === toolName);

        if (existing) {
            return existing.action === 'allow';
        }

        // Ask user for permission
        const action = await this.promptForPermission(serverName, toolName, toolInput);
        
        if (action === 'allow-always') {
            await this.setPermission(serverName, toolName, 'allow');
            return true;
        } else if (action === 'deny-always') {
            await this.setPermission(serverName, toolName, 'deny');
            return false;
        } else if (action === 'allow') {
            return true;
        } else {
            return false;
        }
    }

    private async promptForPermission(serverName: string, toolName: string, toolInput: any): Promise<PermissionAction> {
        const inputPreview = JSON.stringify(toolInput, null, 2).substring(0, 200);
        
        const choice = await vscode.window.showWarningMessage(
            `MCP Tool Permission Required`,
            {
                modal: true,
                detail: `Server: ${serverName}\nTool: ${toolName}\n\nInput:\n${inputPreview}${inputPreview.length >= 200 ? '...' : ''}\n\nDo you want to allow this tool to execute?`
            },
            'Allow Once',
            'Allow Always',
            'Deny Once',
            'Deny Always'
        );

        switch (choice) {
            case 'Allow Once': return 'allow';
            case 'Allow Always': return 'allow-always';
            case 'Deny Once': return 'deny';
            case 'Deny Always': return 'deny-always';
            default: return 'deny';
        }
    }

    public async setPermission(serverName: string, toolName: string, action: 'allow' | 'deny'): Promise<void> {
        const permissions = this.getPermissions();
        const index = permissions.findIndex(p => p.serverName === serverName && p.toolName === toolName);

        if (index >= 0) {
            permissions[index].action = action;
        } else {
            permissions.push({ serverName, toolName, action });
        }

        await this.savePermissions(permissions);
    }

    public async removePermission(serverName: string, toolName: string): Promise<void> {
        const permissions = this.getPermissions();
        const filtered = permissions.filter(p => !(p.serverName === serverName && p.toolName === toolName));
        await this.savePermissions(filtered);
    }

    public getAllPermissions(): ToolPermission[] {
        return this.getPermissions();
    }

    public async clearAllPermissions(): Promise<void> {
        await this.savePermissions([]);
    }
}
