import React, { useState } from 'react';
import { MessageSquare, Search, ArrowLeft } from 'lucide-react';

interface HistoryViewProps {
  onDone: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onDone }) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
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
        <h2 style={{
          margin: 0,
          color: 'var(--vscode-foreground)',
          fontSize: '18px',
          fontWeight: 600
        }}>
          Chat History
        </h2>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--vscode-descriptionForeground)',
          }}
        />
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px 8px 36px',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '4px',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.border = '1px solid var(--vscode-focusBorder)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.border = '1px solid var(--vscode-input-border)';
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
          background: 'var(--vscode-textCodeBlock-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '6px',
        }}
      >
        <MessageSquare
          size={48}
          style={{
            marginBottom: '16px',
            opacity: 0.3,
            color: 'var(--vscode-descriptionForeground)',
          }}
        />
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
            lineHeight: '1.6',
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
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--vscode-textCodeBlock-background)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '12px' }}>
            <span style={{ color: 'var(--vscode-foreground)', fontSize: '13px', fontWeight: 500 }}>
              Chat title placeholder
            </span>
            <span style={{
              color: 'var(--vscode-descriptionForeground)',
              fontSize: '11px',
              flexShrink: 0
            }}>
              2 hours ago
            </span>
          </div>
          <p style={{
            margin: 0,
            color: 'var(--vscode-descriptionForeground)',
            fontSize: '12px',
            lineHeight: '1.5'
          }}>
            First message preview...
          </p>
        </div>
      </div>
    </div>
  );
};
