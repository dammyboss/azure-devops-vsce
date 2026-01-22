import React, { useState } from 'react';
import { Eye, Edit, Globe, Terminal, Plug, X, ListChecks } from 'lucide-react';
import { vscode } from '../../utils/vscode';

interface PermissionsSettingsProps {
  autoApproveEnabled: boolean;
  alwaysAllowReadOnly: boolean;
  alwaysAllowWrite: boolean;
  alwaysAllowBrowser: boolean;
  alwaysAllowMcp: boolean;
  alwaysAllowExecute: boolean;
  alwaysAllowTodoList: boolean;
  allowedCommands: string[];
  allowedMaxRequests?: number;
  allowedMaxCost?: number;
  onUpdate: (updates: Partial<PermissionsConfig>) => void;
}

export interface PermissionsConfig {
  autoApproveEnabled: boolean;
  alwaysAllowReadOnly: boolean;
  alwaysAllowWrite: boolean;
  alwaysAllowBrowser: boolean;
  alwaysAllowMcp: boolean;
  alwaysAllowExecute: boolean;
  alwaysAllowTodoList: boolean;
  allowedCommands: string[];
  allowedMaxRequests?: number;
  allowedMaxCost?: number;
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({ active, onClick, icon, label, description }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleMouseEnter = () => {
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: active ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
          color: active ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          opacity: active ? 1 : 0.6,
          transition: 'all 0.2s ease',
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            padding: '8px 12px',
            background: 'var(--vscode-editorHoverWidget-background)',
            border: '1px solid var(--vscode-editorHoverWidget-border)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--vscode-editorHoverWidget-foreground)',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
};

export const PermissionsSettings: React.FC<PermissionsSettingsProps> = ({
  autoApproveEnabled,
  alwaysAllowReadOnly,
  alwaysAllowWrite,
  alwaysAllowBrowser,
  alwaysAllowMcp,
  alwaysAllowExecute,
  alwaysAllowTodoList,
  allowedCommands,
  allowedMaxRequests,
  allowedMaxCost,
  onUpdate,
}) => {
  const [commandInput, setCommandInput] = useState('');
  const [maxRequests, setMaxRequests] = useState<string>(allowedMaxRequests?.toString() || '');
  const [maxCost, setMaxCost] = useState<string>(allowedMaxCost?.toString() || '');

  const handleToggleAutoApprove = () => {
    onUpdate({ autoApproveEnabled: !autoApproveEnabled });
    vscode.postMessage({
      type: 'updatePermissions',
      permissions: { autoApproveEnabled: !autoApproveEnabled },
    });
  };

  const handleToggle = (key: keyof PermissionsConfig, value: boolean) => {
    onUpdate({ [key]: value });
    vscode.postMessage({
      type: 'updatePermissions',
      permissions: { [key]: value },
    });
  };

  const handleAddCommand = () => {
    if (commandInput && !allowedCommands.includes(commandInput)) {
      const newCommands = [...allowedCommands, commandInput];
      onUpdate({ allowedCommands: newCommands });
      vscode.postMessage({
        type: 'updatePermissions',
        permissions: { allowedCommands: newCommands },
      });
      setCommandInput('');
    }
  };

  const handleRemoveCommand = (index: number) => {
    const newCommands = allowedCommands.filter((_, i) => i !== index);
    onUpdate({ allowedCommands: newCommands });
    vscode.postMessage({
      type: 'updatePermissions',
      permissions: { allowedCommands: newCommands },
    });
  };

  const handleUpdateMaxRequests = () => {
    const value = maxRequests ? parseInt(maxRequests) : undefined;
    onUpdate({ allowedMaxRequests: value });
    vscode.postMessage({
      type: 'updatePermissions',
      permissions: { allowedMaxRequests: value },
    });
  };

  const handleUpdateMaxCost = () => {
    const value = maxCost ? parseFloat(maxCost) : undefined;
    onUpdate({ allowedMaxCost: value });
    vscode.postMessage({
      type: 'updatePermissions',
      permissions: { allowedMaxCost: value },
    });
  };

  return (
    <div>
      {/* Master Toggle */}
      <div style={{ marginBottom: '24px' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={autoApproveEnabled}
            onChange={handleToggleAutoApprove}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Enable Auto-Approval</span>
        </label>
        <p
          style={{
            margin: '8px 0 0 30px',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            lineHeight: '1.6',
          }}
        >
          When enabled, approved actions will run automatically without prompting. Configure specific permissions below.
        </p>
      </div>

      {autoApproveEnabled && (
        <>
          {/* Quick Toggles */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600 }}>
              Quick Permissions
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <ToggleButton
                active={alwaysAllowReadOnly}
                onClick={() => handleToggle('alwaysAllowReadOnly', !alwaysAllowReadOnly)}
                icon={<Eye size={14} />}
                label="Read-Only"
                description="Auto-approve reading files and folders"
              />
              <ToggleButton
                active={alwaysAllowWrite}
                onClick={() => handleToggle('alwaysAllowWrite', !alwaysAllowWrite)}
                icon={<Edit size={14} />}
                label="Write"
                description="Auto-approve creating and editing files"
              />
              <ToggleButton
                active={alwaysAllowBrowser}
                onClick={() => handleToggle('alwaysAllowBrowser', !alwaysAllowBrowser)}
                icon={<Globe size={14} />}
                label="Browser"
                description="Auto-approve browser actions"
              />
              <ToggleButton
                active={alwaysAllowMcp}
                onClick={() => handleToggle('alwaysAllowMcp', !alwaysAllowMcp)}
                icon={<Plug size={14} />}
                label="MCP Tools"
                description="Auto-approve MCP tool execution"
              />
              <ToggleButton
                active={alwaysAllowExecute}
                onClick={() => handleToggle('alwaysAllowExecute', !alwaysAllowExecute)}
                icon={<Terminal size={14} />}
                label="Execute"
                description="Auto-approve command execution"
              />
              <ToggleButton
                active={alwaysAllowTodoList}
                onClick={() => handleToggle('alwaysAllowTodoList', !alwaysAllowTodoList)}
                icon={<ListChecks size={14} />}
                label="Todo List"
                description="Allow AI to use todo lists for task tracking"
              />
            </div>
          </div>

          {/* Execute Commands Section */}
          {alwaysAllowExecute && (
            <div
              style={{
                marginBottom: '24px',
                paddingLeft: '16px',
                borderLeft: '2px solid var(--vscode-button-background)',
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={16} />
                <span>Allowed Commands</span>
              </h4>
              <p
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '12px',
                  color: 'var(--vscode-descriptionForeground)',
                  lineHeight: '1.6',
                }}
              >
                Specify commands that can be executed automatically. Leave empty to allow all commands.
              </p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCommand();
                    }
                  }}
                  placeholder="e.g., npm install, git status"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border)',
                    borderRadius: '4px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleAddCommand}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Add
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {allowedCommands.map((cmd, index) => (
                  <button
                    key={index}
                    onClick={() => handleRemoveCommand(index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      background: 'var(--vscode-button-secondaryBackground)',
                      color: 'var(--vscode-button-secondaryForeground)',
                      border: '1px solid var(--vscode-panel-border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <span>{cmd}</span>
                    <X size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Limits Section */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600 }}>
              Session Limits
            </h4>
            <p
              style={{
                margin: '0 0 12px 0',
                fontSize: '12px',
                color: 'var(--vscode-descriptionForeground)',
                lineHeight: '1.6',
              }}
            >
              Set limits to prevent excessive API usage. Leave empty for no limits.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  Max Requests per Session
                </label>
                <input
                  type="number"
                  value={maxRequests}
                  onChange={(e) => setMaxRequests(e.target.value)}
                  onBlur={handleUpdateMaxRequests}
                  placeholder="Unlimited"
                  min="1"
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

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  Max Cost per Session ($)
                </label>
                <input
                  type="number"
                  value={maxCost}
                  onChange={(e) => setMaxCost(e.target.value)}
                  onBlur={handleUpdateMaxCost}
                  placeholder="Unlimited"
                  min="0"
                  step="0.01"
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
            </div>
          </div>
        </>
      )}
    </div>
  );
};
