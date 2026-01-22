import React, { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Settings, CheckCircle2, Eye, Edit, Globe, Terminal, Plug, ListChecks, ChevronDown, List, X } from 'lucide-react';
import { vscode } from '../utils/vscode';

interface AutoApproveDropdownProps {
  autoApprovedCount: number;
  permissions?: {
    autoApproveEnabled: boolean;
    alwaysAllowReadOnly: boolean;
    alwaysAllowWrite: boolean;
    alwaysAllowBrowser: boolean;
    alwaysAllowMcp: boolean;
    alwaysAllowExecute: boolean;
    alwaysAllowTodoList: boolean;
  };
}

export const AutoApproveDropdown: React.FC<AutoApproveDropdownProps> = ({
  autoApprovedCount,
  permissions = {
    autoApproveEnabled: false,
    alwaysAllowReadOnly: false,
    alwaysAllowWrite: false,
    alwaysAllowBrowser: false,
    alwaysAllowMcp: false,
    alwaysAllowExecute: false,
    alwaysAllowTodoList: false,
  },
}) => {
  const [open, setOpen] = useState(false);
  const [localPermissions, setLocalPermissions] = useState(permissions);

  useEffect(() => {
    setLocalPermissions(permissions);
  }, [permissions]);

  const handleToggle = (key: keyof typeof permissions) => {
    const newValue = !localPermissions[key];
    setLocalPermissions({ ...localPermissions, [key]: newValue });

    vscode.postMessage({
      type: 'updatePermissions',
      permissions: { [key]: newValue },
    });
  };

  const handleSelectAll = () => {
    const allEnabled = {
      ...localPermissions,
      alwaysAllowReadOnly: true,
      alwaysAllowWrite: true,
      alwaysAllowBrowser: true,
      alwaysAllowMcp: true,
      alwaysAllowExecute: true,
      alwaysAllowTodoList: true,
    };
    setLocalPermissions(allEnabled);
    vscode.postMessage({ type: 'updatePermissions', permissions: allEnabled });
  };

  const handleSelectNone = () => {
    const allDisabled = {
      ...localPermissions,
      alwaysAllowReadOnly: false,
      alwaysAllowWrite: false,
      alwaysAllowBrowser: false,
      alwaysAllowMcp: false,
      alwaysAllowExecute: false,
      alwaysAllowTodoList: false,
    };
    setLocalPermissions(allDisabled);
    vscode.postMessage({ type: 'updatePermissions', permissions: allDisabled });
  };

  const handleOpenSettings = () => {
    vscode.postMessage({
      type: 'openSettings',
      section: 'permissions',
    });
    setOpen(false);
  };

  const approvalItems = [
    { key: 'alwaysAllowReadOnly', icon: Eye, label: 'Read' },
    { key: 'alwaysAllowWrite', icon: Edit, label: 'Write' },
    { key: 'alwaysAllowBrowser', icon: Globe, label: 'Browser' },
    { key: 'alwaysAllowMcp', icon: Plug, label: 'MCP' },
    { key: 'alwaysAllowExecute', icon: Terminal, label: 'Execute' },
    { key: 'alwaysAllowTodoList', icon: ListChecks, label: 'Todo' },
  ];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="control-button auto-approve-button">
        <CheckCircle2 size={12} />
        <span className="control-label">{autoApprovedCount} auto-approved</span>
        <ChevronDown size={10} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="auto-approve-popover"
        >
          <div className="popover-header">
            <span className="popover-title">Auto-approve</span>
            <button className="popover-header-icon" onClick={handleOpenSettings}>
              <Settings size={14} />
            </button>
          </div>

          <div className="popover-description">
            Run these actions without asking for permission. Only enable for actions you fully trust.
          </div>

          <div className="approval-grid">
            {approvalItems.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                className={`approval-button ${
                  localPermissions[key as keyof typeof permissions] ? 'active' : ''
                }`}
                onClick={() => handleToggle(key as keyof typeof permissions)}
                disabled={!localPermissions.autoApproveEnabled}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="popover-footer">
            <button className="popover-footer-button" onClick={handleSelectAll}>
              <List size={14} />
              <span>All</span>
            </button>
            <button className="popover-footer-button" onClick={handleSelectNone}>
              <X size={14} />
              <span>None</span>
            </button>
            <div style={{ flex: 1 }} />
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={localPermissions.autoApproveEnabled}
                onChange={() => handleToggle('autoApproveEnabled')}
              />
              <span>Enabled</span>
            </label>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
