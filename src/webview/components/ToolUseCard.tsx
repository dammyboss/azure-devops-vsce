import React from 'react';
import { ToolUseMessage } from '../types/messages';

interface ToolUseCardProps {
  message: ToolUseMessage;
}

export const ToolUseCard: React.FC<ToolUseCardProps> = ({ message }) => {
  const getStatusColor = () => {
    switch (message.status) {
      case 'completed':
        return '#9ecc3b';
      case 'error':
        return '#f14c4c';
      case 'running':
      default:
        return '#9ecc3b';
    }
  };

  const getStatusText = () => {
    switch (message.status) {
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Error';
      case 'running':
      default:
        return 'Running';
    }
  };

  return (
    <div
      style={{
        background: 'var(--vscode-editor-background)',
        border: '1px solid rgba(102, 126, 234, 0.3)',
        borderRadius: '6px',
        padding: '10px 12px',
        margin: '8px 0',
        fontSize: '12px',
        color: 'var(--vscode-foreground)',
      }}
    >
      {/* Header row with server icon and status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        {/* Left side - Server icon and tool name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: 'var(--vscode-descriptionForeground)', display: 'flex' }}
          >
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          <span style={{ fontWeight: 600, color: 'var(--vscode-foreground)' }}>
            {message.toolName}
          </span>
        </div>

        {/* Right side - Status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'monospace',
            fontSize: '11px',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: getStatusColor(),
            }}
          />
          <span style={{ color: 'var(--vscode-foreground)' }}>
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Tool input display (if present) */}
      {message.toolInput && Object.keys(message.toolInput).length > 0 && (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px',
            padding: '8px',
            marginTop: '6px',
            fontFamily: 'monospace',
            fontSize: '11px',
            overflowX: 'auto',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          <pre style={{ margin: 0 }}>
            {JSON.stringify(message.toolInput, null, 2)}
          </pre>
        </div>
      )}

      {/* Tool result or error */}
      {message.result && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            background: 'rgba(158, 204, 59, 0.1)',
            borderRadius: '4px',
            fontSize: '11px',
          }}
        >
          {message.result}
        </div>
      )}

      {message.error && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            background: 'rgba(241, 76, 76, 0.1)',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#f14c4c',
          }}
        >
          {message.error}
        </div>
      )}
    </div>
  );
};
