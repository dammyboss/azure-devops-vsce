import React from 'react';
import { TabType } from './App';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onNewChat: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, onNewChat }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-editor-background)',
      }}
    >
      {/* Left: Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={() => onTabChange('chat')}
          style={{
            padding: '6px 12px',
            background: activeTab === 'chat' ? 'var(--vscode-button-background)' : 'transparent',
            color: activeTab === 'chat' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            border: activeTab === 'chat' ? 'none' : '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Chat
        </button>
        <button
          onClick={() => onTabChange('history')}
          style={{
            padding: '6px 12px',
            background: activeTab === 'history' ? 'var(--vscode-button-background)' : 'transparent',
            color: activeTab === 'history' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            border: activeTab === 'history' ? 'none' : '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          History
        </button>
        <button
          onClick={() => onTabChange('settings')}
          style={{
            padding: '6px 12px',
            background: activeTab === 'settings' ? 'var(--vscode-button-background)' : 'transparent',
            color: activeTab === 'settings' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            border: activeTab === 'settings' ? 'none' : '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Settings
        </button>
      </div>

      {/* Right: Action Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onNewChat}
          style={{
            padding: '6px 12px',
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Plus icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>
    </div>
  );
};
