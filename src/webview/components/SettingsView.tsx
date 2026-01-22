import React, { forwardRef, useState, useImperativeHandle, useEffect } from 'react';
import { Server, Key, Shield, ArrowLeft } from 'lucide-react';
import { MCPSettings } from './settings/MCPSettings';
import { APIProviderSettings } from './settings/APIProviderSettings';
import { PermissionsSettings, PermissionsConfig } from './settings/PermissionsSettings';
import { MCPServerWithStatus, MCPServerStatus, AIProviderConfig } from '../types/settings';
import { vscode } from '../utils/vscode';

interface SettingsViewProps {
  onDone: () => void;
  targetSection?: string;
}

export interface SettingsViewRef {
  checkUnsaveChanges: (then: () => void) => void;
}

type SectionType = 'providers' | 'mcp' | 'permissions';

const Section: React.FC<{
  title: string;
  description: string;
  comingSoon?: boolean;
  children?: React.ReactNode;
}> = ({ title, description, comingSoon = true, children }) => (
  <div style={{ marginBottom: '24px' }}>
    <h3 style={{
      margin: '0 0 12px 0',
      color: 'var(--vscode-foreground)',
      fontSize: '15px',
      fontWeight: 600
    }}>
      {title}
    </h3>
    <div
      style={{
        background: 'var(--vscode-textCodeBlock-background)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: '6px',
        padding: '16px',
      }}
    >
      <p style={{
        margin: 0,
        color: 'var(--vscode-descriptionForeground)',
        fontSize: '13px',
        lineHeight: '1.6'
      }}>
        {description}
      </p>
      {comingSoon && (
        <p style={{
          margin: '12px 0 0 0',
          color: 'var(--vscode-descriptionForeground)',
          fontSize: '12px',
          fontStyle: 'italic',
          opacity: 0.8
        }}>
          Coming soon...
        </p>
      )}
      {children}
    </div>
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      width: '100%',
      background: active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
      color: active ? 'var(--vscode-foreground)' : 'var(--vscode-foreground)',
      border: 'none',
      borderLeft: `2px solid ${active ? 'var(--vscode-focusBorder)' : 'transparent'}`,
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: active ? 500 : 400,
      opacity: active ? 1 : 0.7,
      transition: 'all 0.2s ease',
      textAlign: 'left',
    }}
    onMouseEnter={(e) => {
      if (!active) {
        e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
        e.currentTarget.style.opacity = '1';
      }
    }}
    onMouseLeave={(e) => {
      if (!active) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.opacity = '0.7';
      }
    }}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export const SettingsView = forwardRef<SettingsViewRef, SettingsViewProps>(
  ({ onDone, targetSection }, ref) => {
    const [activeSection, setActiveSection] = useState<SectionType>(
      (targetSection as SectionType) || 'providers'
    );
    const [hasUnsavedChanges] = useState(false);

    // MCP Settings State
    const [mcpServers, setMcpServers] = useState<MCPServerWithStatus[]>([]);
    const [mcpEnabled, setMcpEnabled] = useState(true);

    // API Provider State
    const [apiConfig, setApiConfig] = useState<AIProviderConfig>({
      provider: 'anthropic',
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 4096,
    });

    // Permissions State
    const [permissions, setPermissions] = useState<PermissionsConfig>({
      autoApproveEnabled: false,
      alwaysAllowReadOnly: false,
      alwaysAllowWrite: false,
      alwaysAllowBrowser: false,
      alwaysAllowMcp: false,
      alwaysAllowExecute: false,
      alwaysAllowTodoList: false,
      allowedCommands: [],
      allowedMaxRequests: undefined,
      allowedMaxCost: undefined,
    });

    // Load settings from extension
    useEffect(() => {
      vscode.postMessage({ type: 'getSettings' });

      const handleMessage = (event: MessageEvent) => {
        const message = event.data;

        if (message.type === 'settingsLoaded') {
          if (message.mcpServers) {
            setMcpServers(message.mcpServers);
          }
          if (message.mcpEnabled !== undefined) {
            setMcpEnabled(message.mcpEnabled);
          }
          if (message.apiConfig) {
            setApiConfig(message.apiConfig);
          }
          if (message.permissions) {
            setPermissions(message.permissions);
          }
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, []);

    useImperativeHandle(ref, () => ({
      checkUnsaveChanges: (then) => {
        if (hasUnsavedChanges) {
          // TODO: Show confirmation dialog
          console.log('[SettingsView] Has unsaved changes, showing dialog');
          then();
        } else {
          then();
        }
      },
    }));

    const handleToggleMcpEnabled = (enabled: boolean) => {
      setMcpEnabled(enabled);
      vscode.postMessage({
        type: 'setMcpEnabled',
        enabled,
      });
    };

    const renderSectionContent = () => {
      switch (activeSection) {
        case 'providers':
          return (
            <>
              <h3 style={{
                margin: '0 0 16px 0',
                color: 'var(--vscode-foreground)',
                fontSize: '16px',
                fontWeight: 600
              }}>
                API Provider Configuration
              </h3>
              <APIProviderSettings
                config={apiConfig}
                onChange={setApiConfig}
              />
            </>
          );
        case 'mcp':
          return (
            <>
              <h3 style={{
                margin: '0 0 16px 0',
                color: 'var(--vscode-foreground)',
                fontSize: '16px',
                fontWeight: 600
              }}>
                MCP Servers
              </h3>
              <MCPSettings
                servers={mcpServers}
                enabled={mcpEnabled}
                onToggleEnabled={handleToggleMcpEnabled}
              />
            </>
          );
        case 'permissions':
          return (
            <>
              <h3 style={{
                margin: '0 0 16px 0',
                color: 'var(--vscode-foreground)',
                fontSize: '16px',
                fontWeight: 600
              }}>
                Auto-Approval Settings
              </h3>
              <PermissionsSettings
                autoApproveEnabled={permissions.autoApproveEnabled}
                alwaysAllowReadOnly={permissions.alwaysAllowReadOnly}
                alwaysAllowWrite={permissions.alwaysAllowWrite}
                alwaysAllowBrowser={permissions.alwaysAllowBrowser}
                alwaysAllowMcp={permissions.alwaysAllowMcp}
                alwaysAllowExecute={permissions.alwaysAllowExecute}
                alwaysAllowTodoList={permissions.alwaysAllowTodoList}
                allowedCommands={permissions.allowedCommands}
                allowedMaxRequests={permissions.allowedMaxRequests}
                allowedMaxCost={permissions.allowedMaxCost}
                onUpdate={(updates) => setPermissions({ ...permissions, ...updates })}
              />
            </>
          );
        default:
          return null;
      }
    };

    return (
      <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div
          style={{
            width: '192px',
            flexShrink: 0,
            borderRight: '1px solid var(--vscode-sideBar-background)',
            background: 'var(--vscode-editor-background)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          <TabButton
            active={activeSection === 'providers'}
            onClick={() => setActiveSection('providers')}
            icon={<Key size={16} />}
            label="Providers"
          />
          <TabButton
            active={activeSection === 'mcp'}
            onClick={() => setActiveSection('mcp')}
            icon={<Server size={16} />}
            label="MCP Servers"
          />
          <TabButton
            active={activeSection === 'permissions'}
            onClick={() => setActiveSection('permissions')}
            icon={<Shield size={16} />}
            label="Permissions"
          />
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px',
            background: 'var(--vscode-editor-background)',
          }}
        >
          {/* Header with Back Button */}
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={onDone}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
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
              <ArrowLeft size={16} />
              Back to Chat
            </button>
          </div>

          {renderSectionContent()}
        </div>
      </div>
    );
  }
);
