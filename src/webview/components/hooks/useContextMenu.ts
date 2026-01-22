import { useState, useCallback, useRef, useEffect } from 'react';
import { ContextMenuOption, ContextMenuOptionType } from '../ContextMenu';

interface UseContextMenuProps {
  onSelect: (option: ContextMenuOption) => void;
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export const useContextMenu = ({ onSelect, textAreaRef }: UseContextMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ContextMenuOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [triggerType, setTriggerType] = useState<'@' | '/' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const triggerPositionRef = useRef<number>(0);

  const calculatePosition = useCallback(() => {
    if (!textAreaRef.current) return { top: 0, left: 0 };

    const textarea = textAreaRef.current;
    const rect = textarea.getBoundingClientRect();

    // Position menu above textarea
    return {
      top: rect.top - 320, // 300px menu height + 20px padding
      left: rect.left,
    };
  }, [textAreaRef]);

  const open = useCallback((type: '@' | '/', query: string = '', triggerPos: number) => {
    setIsOpen(true);
    setTriggerType(type);
    setSearchQuery(query);
    setSelectedIndex(0);
    triggerPositionRef.current = triggerPos;
    setPosition(calculatePosition());
  }, [calculatePosition]);

  const close = useCallback(() => {
    setIsOpen(false);
    setOptions([]);
    setTriggerType(null);
    setSearchQuery('');
    setSelectedIndex(0);
  }, []);

  const selectOption = useCallback((option: ContextMenuOption) => {
    onSelect(option);
    close();
  }, [onSelect, close]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % options.length);
        return true;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
        return true;

      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (options[selectedIndex]) {
          selectOption(options[selectedIndex]);
        }
        return true;

      case 'Escape':
        e.preventDefault();
        close();
        return true;

      default:
        return false;
    }
  }, [isOpen, options, selectedIndex, selectOption, close]);

  return {
    isOpen,
    options,
    setOptions,
    selectedIndex,
    position,
    triggerType,
    searchQuery,
    setSearchQuery,
    triggerPosition: triggerPositionRef.current,
    open,
    close,
    selectOption,
    handleKeyDown,
  };
};
