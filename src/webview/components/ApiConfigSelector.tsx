import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Settings, Check, ChevronDown } from 'lucide-react';
import { vscode } from '../utils/vscode';

interface ApiConfig {
  name: string;
  provider: string;
  model?: string;
}

interface ApiConfigSelectorProps {
  currentConfig: string;
  configs?: ApiConfig[];
}

export const ApiConfigSelector: React.FC<ApiConfigSelectorProps> = ({
  currentConfig,
  configs = [{ name: 'default', provider: 'anthropic' }],
}) => {
  const [open, setOpen] = useState(false);

  const handleConfigSelect = (configName: string) => {
    vscode.postMessage({
      type: 'selectApiConfig',
      config: configName,
    });
    setOpen(false);
  };

  const handleOpenSettings = () => {
    vscode.postMessage({
      type: 'openSettings',
      section: 'providers',
    });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="control-button api-config-button">
        <span className="control-label">{currentConfig}</span>
        <ChevronDown size={10} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="api-config-popover"
        >
          <div className="popover-header">
            <span className="popover-title">Select API Configuration</span>
          </div>

          <div className="popover-content">
            {configs.map((config) => (
              <button
                key={config.name}
                className={`popover-item ${config.name === currentConfig ? 'selected' : ''}`}
                onClick={() => handleConfigSelect(config.name)}
              >
                <div className="popover-item-content">
                  <span className="popover-item-name">{config.name}</span>
                  {config.model && (
                    <span className="popover-item-description">{config.model}</span>
                  )}
                </div>
                {config.name === currentConfig && (
                  <Check size={14} className="popover-item-icon" />
                )}
              </button>
            ))}
          </div>

          <div className="popover-footer">
            <button className="popover-footer-button" onClick={handleOpenSettings}>
              <Settings size={14} />
              <span>API Configuration</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
