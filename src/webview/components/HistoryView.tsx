import React from 'react';

export const HistoryView: React.FC = () => {
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
        Chat History
      </h2>

      {/* Search Bar */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search conversations..."
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '4px',
            fontSize: '13px',
            outline: 'none',
          }}
        />
      </div>

      {/* Empty State */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 16px',
          textAlign: 'center',
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vscode-descriptionForeground)"
          strokeWidth="1.5"
          style={{ marginBottom: '16px', opacity: 0.5 }}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <h3
          style={{
            margin: '0 0 8px 0',
            color: 'var(--vscode-foreground)',
            fontSize: '15px',
            fontWeight: 500,
          }}
        >
          No conversations yet
        </h3>
        <p
          style={{
            margin: 0,
            color: 'var(--vscode-descriptionForeground)',
            fontSize: '13px',
            maxWidth: '400px',
          }}
        >
          Your chat history will appear here. Start a new conversation to get started.
        </p>
      </div>

      {/* Sample Chat List (hidden for now, will be populated later) */}
      <div style={{ display: 'none' }}>
        {/* Example chat item structure */}
        <div
          style={{
            background: 'var(--vscode-textCodeBlock-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '8px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--vscode-foreground)', fontSize: '13px', fontWeight: 500 }}>
              Chat title placeholder
            </span>
            <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px' }}>
              2 hours ago
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>
            First message preview...
          </p>
        </div>
      </div>
    </div>
  );
};
