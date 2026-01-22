import React from 'react';

export const SettingsView: React.FC = () => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        padding: '16px',
        background: 'var(--vscode-editor-background)',
      }}
    >
      <h2 style={{ margin: '0 0 16px 0', color: 'var(--vscode-foreground)', fontSize: '18px', fontWeight: 600 }}>
        Settings
      </h2>

      {/* MCP Servers Section */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: 'var(--vscode-foreground)', fontSize: '15px', fontWeight: 500 }}>
          MCP Servers
        </h3>
        <div
          style={{
            background: 'var(--vscode-textCodeBlock-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            padding: '16px',
          }}
        >
          <p style={{ margin: 0, color: 'var(--vscode-descriptionForeground)', fontSize: '13px' }}>
            Configure your Model Context Protocol (MCP) servers here. This feature will allow you to enable/disable
            servers, manage permissions, and configure tools.
          </p>
          <p style={{ margin: '12px 0 0 0', color: 'var(--vscode-descriptionForeground)', fontSize: '12px', fontStyle: 'italic' }}>
            Coming soon...
          </p>
        </div>
      </div>

      {/* API Configuration Section */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: 'var(--vscode-foreground)', fontSize: '15px', fontWeight: 500 }}>
          API Configuration
        </h3>
        <div
          style={{
            background: 'var(--vscode-textCodeBlock-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            padding: '16px',
          }}
        >
          <p style={{ margin: 0, color: 'var(--vscode-descriptionForeground)', fontSize: '13px' }}>
            Manage your AI provider settings (Anthropic, DeepSeek, OpenAI, etc.). Configure API keys, model selection,
            and other provider-specific options.
          </p>
          <p style={{ margin: '12px 0 0 0', color: 'var(--vscode-descriptionForeground)', fontSize: '12px', fontStyle: 'italic' }}>
            Coming soon...
          </p>
        </div>
      </div>

      {/* Permissions Section */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: 'var(--vscode-foreground)', fontSize: '15px', fontWeight: 500 }}>
          Permissions
        </h3>
        <div
          style={{
            background: 'var(--vscode-textCodeBlock-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            padding: '16px',
          }}
        >
          <p style={{ margin: 0, color: 'var(--vscode-descriptionForeground)', fontSize: '13px' }}>
            Configure auto-approval rules for MCP tools. Set which tools can run automatically without prompting for
            permission.
          </p>
          <p style={{ margin: '12px 0 0 0', color: 'var(--vscode-descriptionForeground)', fontSize: '12px', fontStyle: 'italic' }}>
            Coming soon...
          </p>
        </div>
      </div>
    </div>
  );
};
