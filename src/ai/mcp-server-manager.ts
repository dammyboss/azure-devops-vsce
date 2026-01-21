import * as vscode from 'vscode';
import { MCPServerConfig } from './mcp-client';

/**
 * MCP Server Status
 */
export enum MCPServerStatus {
    Disconnected = 'disconnected',
    Connecting = 'connecting',
    Connected = 'connected',
    Error = 'error',
    Reconnecting = 'reconnecting'
}

/**
 * MCP Server Health Info
 */
export interface MCPServerHealth {
    serverName: string;
    status: MCPServerStatus;
    lastHealthCheck: number;
    consecutiveFailures: number;
    lastError?: string;
    toolCount: number;
    uptime: number; // milliseconds since connection
    connectedAt?: number;
}

/**
 * Health Check Result
 */
interface HealthCheckResult {
    success: boolean;
    latency: number;
    error?: string;
}

/**
 * Manages MCP server lifecycle, health checks, and auto-reconnection
 */
export class MCPServerManager {
    private serverHealth = new Map<string, MCPServerHealth>();
    private healthCheckIntervals = new Map<string, NodeJS.Timeout>();
    private reconnectTimeouts = new Map<string, NodeJS.Timeout>();
    private outputChannel: vscode.OutputChannel;
    private healthCheckCallback?: (serverName: string) => Promise<boolean>;
    private reconnectCallback?: (serverName: string) => Promise<boolean>;

    // Configuration
    private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    private readonly HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
    private readonly MAX_CONSECUTIVE_FAILURES = 3;
    private readonly RECONNECT_DELAY_BASE = 5000; // 5 seconds
    private readonly RECONNECT_DELAY_MAX = 60000; // 1 minute

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Set health check callback
     */
    setHealthCheckCallback(callback: (serverName: string) => Promise<boolean>): void {
        this.healthCheckCallback = callback;
    }

    /**
     * Set reconnect callback
     */
    setReconnectCallback(callback: (serverName: string) => Promise<boolean>): void {
        this.reconnectCallback = callback;
    }

    /**
     * Register a server for monitoring
     */
    registerServer(serverName: string, type: 'local' | 'remote'): void {
        const health: MCPServerHealth = {
            serverName: serverName,
            status: MCPServerStatus.Disconnected,
            lastHealthCheck: Date.now(),
            consecutiveFailures: 0,
            toolCount: 0,
            uptime: 0
        };

        this.serverHealth.set(serverName, health);
        this.outputChannel.appendLine(`✅ Registered MCP server: ${serverName} (${type})`);
    }

    /**
     * Unregister a server from monitoring
     */
    unregisterServer(serverName: string): void {
        this.stopHealthChecks(serverName);
        this.serverHealth.delete(serverName);

        // Clear any pending reconnect timeouts
        const timeout = this.reconnectTimeouts.get(serverName);
        if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(serverName);
        }

        this.outputChannel.appendLine(`❌ Unregistered MCP server: ${serverName}`);
    }

    /**
     * Mark server as connected
     */
    markConnected(serverName: string, toolCount: number): void {
        const health = this.serverHealth.get(serverName);
        if (health) {
            health.status = MCPServerStatus.Connected;
            health.connectedAt = Date.now();
            health.toolCount = toolCount;
            health.consecutiveFailures = 0;
            health.lastError = undefined;

            this.outputChannel.appendLine(`🟢 ${serverName}: Connected with ${toolCount} tools`);

            // Start health checks
            this.startHealthChecks(serverName);
        }
    }

    /**
     * Mark server as disconnected
     */
    markDisconnected(serverName: string, error?: string): void {
        const health = this.serverHealth.get(serverName);
        if (health) {
            health.status = MCPServerStatus.Disconnected;
            health.lastError = error;
            health.connectedAt = undefined;

            this.outputChannel.appendLine(`🔴 ${serverName}: Disconnected${error ? ` (${error})` : ''}`);

            // Stop health checks
            this.stopHealthChecks(serverName);
        }
    }

    /**
     * Mark server as error
     */
    markError(serverName: string, error: string): void {
        const health = this.serverHealth.get(serverName);
        if (health) {
            health.status = MCPServerStatus.Error;
            health.lastError = error;
            health.consecutiveFailures++;

            this.outputChannel.appendLine(`❌ ${serverName}: Error (${health.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}): ${error}`);

            // Trigger reconnection if max failures reached
            if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
                this.scheduleReconnect(serverName);
            }
        }
    }

    /**
     * Start health checks for a server
     */
    private startHealthChecks(serverName: string): void {
        // Clear existing interval if any
        this.stopHealthChecks(serverName);

        // Start new interval
        const interval = setInterval(() => {
            this.performHealthCheck(serverName);
        }, this.HEALTH_CHECK_INTERVAL);

        this.healthCheckIntervals.set(serverName, interval);
        this.outputChannel.appendLine(`💓 ${serverName}: Health checks started (every ${this.HEALTH_CHECK_INTERVAL/1000}s)`);
    }

    /**
     * Stop health checks for a server
     */
    private stopHealthChecks(serverName: string): void {
        const interval = this.healthCheckIntervals.get(serverName);
        if (interval) {
            clearInterval(interval);
            this.healthCheckIntervals.delete(serverName);
            this.outputChannel.appendLine(`💤 ${serverName}: Health checks stopped`);
        }
    }

    /**
     * Perform health check on a server
     */
    private async performHealthCheck(serverName: string): Promise<void> {
        const health = this.serverHealth.get(serverName);
        if (!health || health.status !== MCPServerStatus.Connected) {
            return;
        }

        health.lastHealthCheck = Date.now();

        // Use callback to perform actual health check if available
        if (this.healthCheckCallback) {
            try {
                const isHealthy = await this.healthCheckCallback(serverName);
                if (isHealthy) {
                    health.consecutiveFailures = 0;
                    if (health.connectedAt) {
                        health.uptime = Date.now() - health.connectedAt;
                    }
                    this.outputChannel.appendLine(`💓 ${serverName}: Health check passed (uptime: ${Math.floor(health.uptime/1000)}s)`);
                } else {
                    health.consecutiveFailures++;
                    this.outputChannel.appendLine(`⚠️ ${serverName}: Health check failed (${health.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES})`);

                    if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
                        this.markError(serverName, 'Health check failed');
                        this.scheduleReconnect(serverName);
                    }
                }
            } catch (error: any) {
                health.consecutiveFailures++;
                this.outputChannel.appendLine(`⚠️ ${serverName}: Health check error: ${error.message}`);
            }
        } else {
            // No callback, just update uptime
            if (health.connectedAt) {
                health.uptime = Date.now() - health.connectedAt;
            }
        }
    }

    /**
     * Schedule reconnection attempt
     */
    private scheduleReconnect(serverName: string): void {
        const health = this.serverHealth.get(serverName);
        if (!health) return;

        // Calculate exponential backoff delay
        const attempt = health.consecutiveFailures - this.MAX_CONSECUTIVE_FAILURES + 1;
        const delay = Math.min(
            this.RECONNECT_DELAY_BASE * Math.pow(2, attempt),
            this.RECONNECT_DELAY_MAX
        );

        this.outputChannel.appendLine(`🔄 ${serverName}: Scheduling reconnect in ${delay/1000}s (attempt ${attempt})`);

        // Clear existing timeout
        const existingTimeout = this.reconnectTimeouts.get(serverName);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // Schedule reconnection
        health.status = MCPServerStatus.Reconnecting;
        const timeout = setTimeout(() => {
            this.attemptReconnect(serverName);
        }, delay);

        this.reconnectTimeouts.set(serverName, timeout);
    }

    /**
     * Attempt to reconnect a server
     */
    private async attemptReconnect(serverName: string): Promise<void> {
        this.outputChannel.appendLine(`🔄 ${serverName}: Attempting reconnection...`);

        if (this.reconnectCallback) {
            try {
                const success = await this.reconnectCallback(serverName);
                if (!success) {
                    // Retry after a delay
                    const health = this.serverHealth.get(serverName);
                    if (health) {
                        health.consecutiveFailures++;
                        this.scheduleReconnect(serverName);
                    }
                }
            } catch (error: any) {
                this.outputChannel.appendLine(`❌ ${serverName}: Reconnection error: ${error.message}`);
                const health = this.serverHealth.get(serverName);
                if (health) {
                    health.consecutiveFailures++;
                    this.scheduleReconnect(serverName);
                }
            }
        }
        // In a full implementation, we'd have a callback or event emitter
    }

    /**
     * Get server health
     */
    getServerHealth(serverName: string): MCPServerHealth | undefined {
        return this.serverHealth.get(serverName);
    }

    /**
     * Get all server health
     */
    getAllServerHealth(): MCPServerHealth[] {
        return Array.from(this.serverHealth.values());
    }

    /**
     * Get health summary
     */
    getHealthSummary(): {
        total: number;
        connected: number;
        disconnected: number;
        error: number;
        reconnecting: number;
    } {
        const servers = Array.from(this.serverHealth.values());

        return {
            total: servers.length,
            connected: servers.filter(s => s.status === MCPServerStatus.Connected).length,
            disconnected: servers.filter(s => s.status === MCPServerStatus.Disconnected).length,
            error: servers.filter(s => s.status === MCPServerStatus.Error).length,
            reconnecting: servers.filter(s => s.status === MCPServerStatus.Reconnecting).length
        };
    }

    /**
     * Check if a server is healthy
     */
    isServerHealthy(serverName: string): boolean {
        const health = this.serverHealth.get(serverName);
        return health?.status === MCPServerStatus.Connected &&
               health.consecutiveFailures < this.MAX_CONSECUTIVE_FAILURES;
    }

    /**
     * Get servers by status
     */
    getServersByStatus(status: MCPServerStatus): MCPServerHealth[] {
        return Array.from(this.serverHealth.values()).filter(h => h.status === status);
    }

    /**
     * Reset server health (clear failures)
     */
    resetServerHealth(serverName: string): void {
        const health = this.serverHealth.get(serverName);
        if (health) {
            health.consecutiveFailures = 0;
            health.lastError = undefined;
            this.outputChannel.appendLine(`🔄 ${serverName}: Health reset`);
        }
    }

    /**
     * Dispose (cleanup all timers)
     */
    dispose(): void {
        // Clear all health check intervals
        for (const interval of this.healthCheckIntervals.values()) {
            clearInterval(interval);
        }
        this.healthCheckIntervals.clear();

        // Clear all reconnect timeouts
        for (const timeout of this.reconnectTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.reconnectTimeouts.clear();

        this.outputChannel.appendLine('🛑 MCP Server Manager disposed');
    }

    /**
     * Get formatted status report
     */
    getStatusReport(): string {
        const summary = this.getHealthSummary();
        const servers = this.getAllServerHealth();

        let report = '=== MCP Server Status Report ===\n';
        report += `Total: ${summary.total} | `;
        report += `🟢 Connected: ${summary.connected} | `;
        report += `🔴 Disconnected: ${summary.disconnected} | `;
        report += `❌ Error: ${summary.error} | `;
        report += `🔄 Reconnecting: ${summary.reconnecting}\n\n`;

        for (const server of servers) {
            const statusEmoji = this.getStatusEmoji(server.status);
            report += `${statusEmoji} ${server.serverName}\n`;
            report += `  Status: ${server.status}\n`;
            report += `  Tools: ${server.toolCount}\n`;

            if (server.connectedAt) {
                const uptime = Math.floor((Date.now() - server.connectedAt) / 1000);
                report += `  Uptime: ${uptime}s\n`;
            }

            if (server.consecutiveFailures > 0) {
                report += `  Failures: ${server.consecutiveFailures}\n`;
            }

            if (server.lastError) {
                report += `  Last Error: ${server.lastError}\n`;
            }

            report += '\n';
        }

        return report;
    }

    /**
     * Get emoji for status
     */
    private getStatusEmoji(status: MCPServerStatus): string {
        switch (status) {
            case MCPServerStatus.Connected: return '🟢';
            case MCPServerStatus.Connecting: return '🟡';
            case MCPServerStatus.Disconnected: return '🔴';
            case MCPServerStatus.Error: return '❌';
            case MCPServerStatus.Reconnecting: return '🔄';
            default: return '⚪';
        }
    }
}
