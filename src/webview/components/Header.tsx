import React from 'react';
import { MessageSquare, History, Settings, Plus } from 'lucide-react';
import { TabType } from './App';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onNewChat: () => void;
}

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    style={{
      padding: '6px 12px',
      background: active ? 'var(--vscode-button-background)' : 'transparent',
      color: active ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
      border: active ? 'none' : '1px solid var(--vscode-panel-border)',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      transition: 'all 0.2s ease',
      opacity: active ? 1 : 0.8,
    }}
    onMouseEnter={(e) => {
      if (!active) {
        e.currentTarget.style.opacity = '1';
        e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
      }
    }}
    onMouseLeave={(e) => {
      if (!active) {
        e.currentTarget.style.opacity = '0.8';
        e.currentTarget.style.background = 'transparent';
      }
    }}
  >
    {icon}
    {label}
  </button>
);

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
        gap: '8px',
      }}
    >
      {/* Left: Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <TabButton
          active={activeTab === 'chat'}
          onClick={() => onTabChange('chat')}
          icon={<MessageSquare size={16} />}
          label="Chat"
        />
        <TabButton
          active={activeTab === 'history'}
          onClick={() => onTabChange('history')}
          icon={<History size={16} />}
          label="History"
        />
        <TabButton
          active={activeTab === 'settings'}
          onClick={() => onTabChange('settings')}
          icon={<Settings size={16} />}
          label="Settings"
        />
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
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--vscode-button-background)';
          }}
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>
    </div>
  );
};
