import React, { useState, useEffect } from 'react';
import { PermissionRequest } from '../types/messages';
import { vscode } from '../utils/vscode';

interface PermissionCardProps {
  message: PermissionRequest;
  onResponse?: (id: string, action: 'allow' | 'deny') => void;
}

export const PermissionCard: React.FC<PermissionCardProps> = ({ message, onResponse }) => {
  const [isExpanded, setIsExpanded] = useState(false); // Start collapsed, user can expand to see details
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [localStatus, setLocalStatus] = useState(message.status);

  // Sync local status with message status changes
  useEffect(() => {
    setLocalStatus(message.status);
  }, [message.status]);

  const handleResponse = (action: 'allow' | 'deny') => {
    const finalAction = alwaysAllow ? 'allow-always' : action;
    console.log('[PermissionCard] Sending response:', finalAction, 'for id:', message.id);

    // Update local status immediately for instant UI feedback
    setLocalStatus(action === 'allow' ? 'approved' : 'denied');

    // Send to backend
    vscode.postMessage({
      type: 'permissionResponse',
      id: message.id,
      action: finalAction,
    });

    // Notify parent component
    if (onResponse) {
      onResponse(message.id, action);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        background: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: '4px',
        padding: '8px',
        marginTop: '8px',
      }}
    >
      {/* Header: Server name, status, and expand/collapse */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '4px',
        }}
      >
        {/* Left: Server name and icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vscode-descriptionForeground)" strokeWidth="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          <span style={{ fontWeight: 700, color: 'var(--vscode-foreground)', fontSize: '13px' }}>
            {message.serverName}
          </span>
        </div>

        {/* Right: Status indicator and toggle button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' }}>
          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', fontSize: '11px' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background:
                  localStatus === 'approved'
                    ? '#a3d977'
                    : localStatus === 'denied'
                    ? '#f14c4c'
                    : '#fac800',
              }}
            />
            <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
              {localStatus === 'approved' ? 'approved' : localStatus === 'denied' ? 'denied' : 'pending'}
            </span>
          </div>

          {/* Expand/Collapse button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--vscode-foreground)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transition: 'transform 0.3s',
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tool details section */}
      <div
        style={{
          width: '100%',
          background: 'var(--vscode-textCodeBlock-background)',
          borderRadius: '4px',
          padding: '8px',
        }}
      >
        {/* Tool name row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--vscode-symbolIcon-methodForeground)" style={{ flexShrink: 0, marginRight: '6px' }}>
              <path d="M3.5 2h-1a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5zm3 0h-1a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5zm3 0h-1a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5z" />
            </svg>
            <span
              style={{
                fontWeight: 500,
                fontSize: '13px',
                color: 'var(--vscode-foreground)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {message.toolName}
            </span>
          </div>

          {/* Always allow checkbox - only show when pending */}
          {localStatus === 'pending' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                cursor: 'pointer',
                flexShrink: 0,
                marginLeft: '8px',
                color: 'var(--vscode-descriptionForeground)',
                whiteSpace: 'nowrap',
              }}
            >
              <input
                type="checkbox"
                checked={alwaysAllow}
                onChange={(e) => setAlwaysAllow(e.target.checked)}
                style={{ cursor: 'pointer', margin: 0 }}
              />
              <span>Always allow</span>
            </label>
          )}
        </div>

        {/* Tool description */}
        <div
          style={{
            marginTop: '4px',
            fontSize: '11px',
            color: 'var(--vscode-descriptionForeground)',
            opacity: 0.8,
          }}
        >
          Get the current weather conditions for any location worldwide.
        </div>

        {/* Arguments section - always visible when expanded */}
        {isExpanded && message.toolInput && Object.keys(message.toolInput).length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                color: 'var(--vscode-descriptionForeground)',
                opacity: 0.8,
                marginBottom: '4px',
                letterSpacing: '0.5px',
              }}
            >
              ARGUMENTS
            </div>
            <div
              style={{
                background: 'var(--vscode-editor-background)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '4px',
                padding: '8px',
                fontFamily: 'var(--vscode-editor-font-family)',
                fontSize: '11px',
                overflowX: 'auto',
              }}
            >
              <pre style={{ margin: 0, color: 'var(--vscode-editor-foreground)' }}>
                {JSON.stringify(message.toolInput, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Response section - show when result is available and expanded */}
        {isExpanded && (message.result || message.error) && (
          <div style={{ marginTop: '8px' }}>
            <div
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                color: 'var(--vscode-descriptionForeground)',
                opacity: 0.8,
                marginBottom: '4px',
                letterSpacing: '0.5px',
              }}
            >
              RESPONSE
            </div>
            <div
              style={{
                background: 'var(--vscode-editor-background)',
                border: `1px solid ${message.error ? '#f14c4c' : 'var(--vscode-panel-border)'}`,
                borderRadius: '4px',
                padding: '8px',
                fontFamily: 'var(--vscode-editor-font-family)',
                fontSize: '11px',
                overflowX: 'auto',
                maxHeight: '384px',
                overflowY: 'auto',
              }}
            >
              <pre style={{ margin: 0, color: message.error ? '#f14c4c' : 'var(--vscode-editor-foreground)' }}>
                {message.error || message.result}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons - only show when pending, position at bottom */}
      {localStatus === 'pending' && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => handleResponse('deny')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Deny
          </button>
          <button
            onClick={() => handleResponse('allow')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
};
