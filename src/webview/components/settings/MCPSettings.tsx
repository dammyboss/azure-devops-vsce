import React, { useState } from 'react';
import { Server, ChevronRight, ChevronDown, Trash2, RefreshCw, Circle } from 'lucide-react';
import { MCPServerWithStatus, MCPServerStatus } from '../../types/settings';
import { vscode } from '../../utils/vscode';

interface MCPSettingsProps {
  servers: MCPServerWithStatus[];
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}

const getStatusColor = (status: MCPServerStatus, disabled?: boolean): string => {
  if (disabled) {
    return 'var(--vscode-descriptionForeground)';
  }

  switch (status) {
    case MCPServerStatus.Connected:
      return 'var(--vscode-testing-iconPassed)';
    case MCPServerStatus.Connecting:
    case MCPServerStatus.Reconnecting:
      return 'var(--vscode-charts-yellow)';
    case MCPServerStatus.Disconnected:
    case MCPServerStatus.Error:
      return 'var(--vscode-testing-iconFailed)';
    default:
      return 'var(--vscode-descriptionForeground)';
  }
};

const getStatusText = (status: MCPServerStatus): string => {
  switch (status) {
    case MCPServerStatus.Connected:
      return 'Connected';
    case MCPServerStatus.Connecting:
      return 'Connecting...';
    case MCPServerStatus.Reconnecting:
      return 'Reconnecting...';
    case MCPServerStatus.Disconnected:
      return 'Disconnected';
    case MCPServerStatus.Error:
      return 'Error';
    default:
      return 'Unknown';
  }
};

const ServerRow: React.FC<{
  server: MCPServerWithStatus;
  onToggle: () => void;
  onRestart: () => void;
  onDelete: () => void;
}> = ({ server, onToggle, onRestart, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandable = server.status === MCPServerStatus.Connected && !server.disabled;

  const handleRowClick = () => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div style={{ marginBottom: '10px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px',
          background: 'var(--vscode-textCodeBlock-background)',
          cursor: isExpandable ? 'pointer' : 'default',
          borderRadius: isExpanded ? '6px 6px 0 0' : '6px',
          opacity: server.disabled ? 0.6 : 1,
          border: '1px solid var(--vscode-panel-border)',
          transition: 'all 0.2s ease',
        }}
        onClick={handleRowClick}
        onMouseEnter={(e) => {
          if (isExpandable) {
            e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--vscode-textCodeBlock-background)';
        }}
      >
        {isExpandable && (
          <div style={{ marginRight: '8px' }}>
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        )}

        <Server size={16} style={{ marginRight: '12px', opacity: 0.7 }} />

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontWeight: 500, fontSize: '14px' }}>{server.name}</span>
            {server.type && (
              <span
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  background: 'var(--vscode-badge-background)',
                  color: 'var(--vscode-badge-foreground)',
                  textTransform: 'uppercase',
                }}
              >
                {server.type}
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Circle
              size={8}
              fill={getStatusColor(server.status, server.disabled)}
              stroke="none"
            />
            <span>{getStatusText(server.status)}</span>
            {server.status === MCPServerStatus.Connected && server.toolCount > 0 && (
              <span>• {server.toolCount} tools</span>
            )}
          </div>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onRestart}
            disabled={server.status === MCPServerStatus.Connecting}
            style={{
              padding: '6px',
              background: 'transparent',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px',
              cursor: server.status === MCPServerStatus.Connecting ? 'not-allowed' : 'pointer',
              color: 'var(--vscode-foreground)',
              display: 'flex',
              alignItems: 'center',
              opacity: server.status === MCPServerStatus.Connecting ? 0.5 : 1,
            }}
            title="Restart server"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={onDelete}
            style={{
              padding: '6px',
              background: 'transparent',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--vscode-testing-iconFailed)',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Delete server"
          >
            <Trash2 size={14} />
          </button>

          {/* Toggle Switch */}
          <label
            style={{
              position: 'relative',
              display: 'inline-block',
              width: '40px',
              height: '20px',
              marginLeft: '4px',
            }}
          >
            <input
              type="checkbox"
              checked={!server.disabled}
              onChange={onToggle}
              style={{
                opacity: 0,
                width: 0,
                height: 0,
              }}
            />
            <span
              style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: server.disabled
                  ? 'var(--vscode-input-background)'
                  : 'var(--vscode-button-background)',
                transition: '0.2s',
                borderRadius: '20px',
                border: '1px solid var(--vscode-panel-border)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  content: '',
                  height: '14px',
                  width: '14px',
                  left: server.disabled ? '2px' : '22px',
                  bottom: '2px',
                  background: 'white',
                  transition: '0.2s',
                  borderRadius: '50%',
                }}
              />
            </span>
          </label>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && isExpandable && (
        <div
          style={{
            background: 'var(--vscode-textCodeBlock-background)',
            padding: '16px',
            borderRadius: '0 0 6px 6px',
            border: '1px solid var(--vscode-panel-border)',
            borderTop: 'none',
            fontSize: '13px',
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>
              Tools ({server.tools?.length || 0})
            </h4>
            {server.tools && server.tools.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {server.tools.map((tool) => (
                  <div
                    key={tool.name}
                    style={{
                      padding: '8px',
                      background: 'var(--vscode-input-background)',
                      borderRadius: '4px',
                      border: '1px solid var(--vscode-panel-border)',
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>{tool.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                      {tool.description || 'No description'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>
                No tools available
              </div>
            )}
          </div>

          {server.lastError && (
            <div style={{ marginTop: '12px' }}>
              <div
                style={{
                  padding: '8px',
                  background: 'var(--vscode-inputValidation-errorBackground)',
                  border: '1px solid var(--vscode-inputValidation-errorBorder)',
                  borderRadius: '4px',
                  color: 'var(--vscode-errorForeground)',
                  fontSize: '12px',
                }}
              >
                {server.lastError}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show Error for Disconnected/Error Servers */}
      {!server.disabled && (server.status === MCPServerStatus.Error || server.status === MCPServerStatus.Disconnected) && server.lastError && !isExpanded && (
        <div
          style={{
            background: 'var(--vscode-textCodeBlock-background)',
            padding: '12px',
            borderRadius: '0 0 6px 6px',
            border: '1px solid var(--vscode-panel-border)',
            borderTop: 'none',
          }}
        >
          <div
            style={{
              padding: '8px',
              background: 'var(--vscode-inputValidation-errorBackground)',
              border: '1px solid var(--vscode-inputValidation-errorBorder)',
              borderRadius: '4px',
              color: 'var(--vscode-errorForeground)',
              fontSize: '12px',
              marginBottom: '8px',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            {server.lastError}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestart();
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--vscode-button-background)';
            }}
          >
            Retry Connection
          </button>
        </div>
      )}
    </div>
  );
};

export const MCPSettings: React.FC<MCPSettingsProps> = ({ servers, enabled, onToggleEnabled }) => {
  const handleToggleServer = (serverName: string) => {
    vscode.postMessage({
      type: 'toggleMcpServer',
      serverName,
    });
  };

  const handleRestartServer = (serverName: string) => {
    vscode.postMessage({
      type: 'restartMcpServer',
      serverName,
    });
  };

  const handleDeleteServer = (serverName: string) => {
    vscode.postMessage({
      type: 'deleteMcpServer',
      serverName,
    });
  };

  const handleRefreshAll = () => {
    vscode.postMessage({
      type: 'refreshAllMcpServers',
    });
  };

  const handleOpenSettings = () => {
    vscode.postMessage({
      type: 'openMcpSettings',
    });
  };

  return (
    <div>
      {/* MCP Enable Toggle */}
      <div style={{ marginBottom: '20px' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Enable MCP Servers</span>
        </label>
        <p
          style={{
            margin: '8px 0 0 30px',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            lineHeight: '1.6',
          }}
        >
          Model Context Protocol (MCP) allows AI models to use external tools and resources. Enable this to allow the AI to interact with configured MCP servers.
        </p>
      </div>

      {enabled && (
        <>
          {/* Server List */}
          {servers.length > 0 ? (
            <div style={{ marginBottom: '16px' }}>
              {servers.map((server) => (
                <ServerRow
                  key={server.name}
                  server={server}
                  onToggle={() => handleToggleServer(server.name)}
                  onRestart={() => handleRestartServer(server.name)}
                  onDelete={() => handleDeleteServer(server.name)}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '32px',
                background: 'var(--vscode-textCodeBlock-background)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '6px',
                textAlign: 'center',
                marginBottom: '16px',
              }}
            >
              <Server
                size={48}
                style={{
                  marginBottom: '12px',
                  opacity: 0.3,
                  color: 'var(--vscode-descriptionForeground)',
                }}
              />
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 500 }}>
                No MCP Servers Configured
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--vscode-descriptionForeground)' }}>
                Add MCP servers to extend AI capabilities with external tools and resources.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={handleOpenSettings}
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '10px 16px',
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--vscode-button-background)';
              }}
            >
              Edit MCP Settings
            </button>

            <button
              onClick={handleRefreshAll}
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '10px 16px',
                background: 'transparent',
                color: 'var(--vscode-foreground)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              Refresh All
            </button>
          </div>
        </>
      )}
    </div>
  );
};
