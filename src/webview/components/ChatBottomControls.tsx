import React, { useState } from 'react';
import { Code, Settings, CheckCircle2, ChevronDown } from 'lucide-react';
import { vscode } from '../utils/vscode';

interface ChatBottomControlsProps {
  currentMode?: string;
  currentApiConfig?: string;
  autoApprovedCount?: number;
}

export const ChatBottomControls: React.FC<ChatBottomControlsProps> = ({
  currentMode = 'code',
  currentApiConfig = 'default',
  autoApprovedCount = 0,
}) => {
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showApiMenu, setShowApiMenu] = useState(false);

  const handleModeClick = () => {
    setShowModeMenu(!showModeMenu);
  };

  const handleApiConfigClick = () => {
    setShowApiMenu(!showApiMenu);
    vscode.postMessage({ type: 'getApiConfigurations' });
  };

  const handleAutoApproveClick = () => {
    vscode.postMessage({ type: 'openAutoApproveSettings' });
  };

  const handleOpenSettings = () => {
    vscode.postMessage({ type: 'openSettings', section: 'permissions' });
  };

  return (
    <div className="chat-bottom-controls">
      {/* Mode Selector */}
      <button
        className="control-button mode-button"
        onClick={handleModeClick}
        title="Select mode"
      >
        <Code size={14} />
        <span className="control-label">{currentMode}</span>
        <ChevronDown size={12} />
      </button>

      {/* API Config Selector */}
      <button
        className="control-button api-config-button"
        onClick={handleApiConfigClick}
        title="Select API configuration"
      >
        <span className="control-label">{currentApiConfig}</span>
        <ChevronDown size={12} />
      </button>

      {/* Auto-Approve Status */}
      <button
        className="control-button auto-approve-button"
        onClick={handleAutoApproveClick}
        title="Auto-approval settings"
      >
        <CheckCircle2 size={14} />
        <span className="control-label">{autoApprovedCount} auto-approved</span>
      </button>

      <div className="controls-spacer" />

      {/* Settings Button */}
      <button
        className="control-button settings-button"
        onClick={handleOpenSettings}
        title="Open settings"
      >
        <Settings size={16} />
      </button>
    </div>
  );
};
