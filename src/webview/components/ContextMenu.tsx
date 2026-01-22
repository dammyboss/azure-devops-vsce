import React, { useEffect, useRef, useState } from 'react';
import { File, Folder, Command, Hash } from 'lucide-react';

export enum ContextMenuOptionType {
  File = 'file',
  Folder = 'folder',
  Command = 'command',
  Mention = 'mention',
}

export interface ContextMenuOption {
  type: ContextMenuOptionType;
  label: string;
  value: string;
  description?: string;
  icon?: React.ReactNode;
}

interface ContextMenuProps {
  options: ContextMenuOption[];
  position: { top: number; left: number };
  selectedIndex: number;
  onSelect: (option: ContextMenuOption) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  options,
  position,
  selectedIndex,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current) {
      const selectedElement = menuRef.current.querySelector('.context-menu-item.selected');
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const getIcon = (option: ContextMenuOption) => {
    if (option.icon) return option.icon;

    switch (option.type) {
      case ContextMenuOptionType.File:
        return <File size={14} />;
      case ContextMenuOptionType.Folder:
        return <Folder size={14} />;
      case ContextMenuOptionType.Command:
        return <Command size={14} />;
      case ContextMenuOptionType.Mention:
        return <Hash size={14} />;
      default:
        return null;
    }
  };

  if (options.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="context-menu-items">
        {options.map((option, index) => (
          <div
            key={`${option.type}-${option.value}-${index}`}
            className={`context-menu-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(option)}
            onMouseEnter={() => {
              // Could add hover state here
            }}
          >
            <div className="context-menu-item-icon">{getIcon(option)}</div>
            <div className="context-menu-item-content">
              <div className="context-menu-item-label">{option.label}</div>
              {option.description && (
                <div className="context-menu-item-description">{option.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
