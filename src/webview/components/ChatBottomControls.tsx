import React from 'react';
import { Code, Settings, Plus, ChevronDown } from 'lucide-react';
import { ApiConfigSelector } from './ApiConfigSelector';
import { AutoApproveDropdown } from './AutoApproveDropdown';
import { vscode } from '../utils/vscode';

interface ChatBottomControlsProps {
  currentMode?: string;
  currentApiConfig?: string;
  autoApprovedCount?: number;
  permissions?: any;
}

export const ChatBottomControls: React.FC<ChatBottomControlsProps> = ({
  currentMode = 'code',
  currentApiConfig = 'default',
  autoApprovedCount = 0,
  permissions,
}) => {
  const handleNewChat = () => {
    vscode.postMessage({ type: 'newChat' });
  };

  const handleModeClick = () => {
    // Future: Show mode selector
    console.log('Mode selector clicked');
  };

  const handleOpenSettings = () => {
    vscode.postMessage({ type: 'openSettings' });
  };

  return (
    <div className="chat-bottom-controls">
      {/* New Chat Button */}
      <button
        className="control-button"
        onClick={handleNewChat}
        title="New chat"
      >
        <Plus size={14} />
      </button>

      {/* Mode Selector */}
      <button
        className="control-button mode-button"
        onClick={handleModeClick}
        title="Select mode"
      >
        <Code size={12} />
        <span className="control-label">{currentMode}</span>
        <ChevronDown size={10} />
      </button>

      {/* API Config Selector with Popup */}
      <ApiConfigSelector currentConfig={currentApiConfig} />

      {/* Auto-Approve Dropdown with Popup */}
      <AutoApproveDropdown
        autoApprovedCount={autoApprovedCount}
        permissions={permissions}
      />

      <div className="controls-spacer" />

      {/* Settings Button */}
      <button
        className="control-button settings-button"
        onClick={handleOpenSettings}
        title="Open settings"
      >
        <Settings size={14} />
      </button>
    </div>
  );
};
