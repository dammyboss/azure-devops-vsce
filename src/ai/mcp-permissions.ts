import * as vscode from 'vscode';

export type PermissionAction = 'allow' | 'deny' | 'allow-always' | 'deny-always';

export interface ToolPermission {
    serverName: string;
    toolName: string;
    action: 'allow' | 'deny';
}

export interface PendingPermission {
    id: string;
    serverName: string;
    toolName: string;
    toolInput: any;
    resolve: (action: PermissionAction) => void;
}

export class MCPPermissionsManager {
    private static instance: MCPPermissionsManager;
    private context: vscode.ExtensionContext;
    private pendingPermissions = new Map<string, PendingPermission>();
    private permissionCallbacks = new Map<string, (action: PermissionAction) => void>();

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

    public async checkPermission(
        serverName: string, 
        toolName: string, 
        toolInput: any,
        onPrompt: (id: string, serverName: string, toolName: string, toolInput: any) => void
    ): Promise<boolean> {
        const permissions = this.getPermissions();
        const existing = permissions.find(p => p.serverName === serverName && p.toolName === toolName);

        if (existing) {
            return existing.action === 'allow';
        }

        // Create pending permission request
        const id = `${serverName}_${toolName}_${Date.now()}`;
        
        return new Promise<boolean>((resolve) => {
            this.permissionCallbacks.set(id, async (action: PermissionAction) => {
                if (action === 'allow-always') {
                    await this.setPermission(serverName, toolName, 'allow');
                    resolve(true);
                } else if (action === 'deny-always') {
                    await this.setPermission(serverName, toolName, 'deny');
                    resolve(false);
                } else if (action === 'allow') {
                    resolve(true);
                } else {
                    resolve(false);
                }
                this.permissionCallbacks.delete(id);
            });

            // Notify UI to show permission prompt
            onPrompt(id, serverName, toolName, toolInput);
        });
    }

    public respondToPermission(id: string, action: PermissionAction): void {
        const callback = this.permissionCallbacks.get(id);
        if (callback) {
            callback(action);
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
