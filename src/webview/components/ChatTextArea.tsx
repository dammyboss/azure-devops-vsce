import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal, Square } from 'lucide-react';
import { ContextMenu, ContextMenuOption, ContextMenuOptionType } from './ContextMenu';
import { useContextMenu } from './hooks/useContextMenu';
import { vscode } from '../utils/vscode';

interface ChatTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export interface ChatTextAreaRef {
  focus: () => void;
  blur: () => void;
}

export const ChatTextArea = forwardRef<ChatTextAreaRef, ChatTextAreaProps>(
  ({ value, onChange, onSend, disabled = false, isStreaming = false, placeholder, onKeyDown }, ref) => {
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => textAreaRef.current?.focus(),
      blur: () => textAreaRef.current?.blur(),
    }));

    // Context menu for @ and / commands
    const contextMenu = useContextMenu({
      textAreaRef,
      onSelect: handleContextMenuSelect,
    });

    // Handle text changes and detect @ or /
    const handleChange = useCallback((newValue: string) => {
      onChange(newValue);

      if (!textAreaRef.current) return;

      const cursorPos = textAreaRef.current.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursorPos);

      // Check for @ mention
      const atMatch = textBeforeCursor.match(/@(\w*)$/);
      if (atMatch) {
        const query = atMatch[1];
        const triggerPos = cursorPos - query.length - 1;

        if (!contextMenu.isOpen || contextMenu.triggerType !== '@') {
          contextMenu.open('@', query, triggerPos);
          requestFileSearch(query);
        } else if (contextMenu.searchQuery !== query) {
          contextMenu.setSearchQuery(query);
          requestFileSearch(query);
        }
        return;
      }

      // Check for / command (at start of line)
      const lines = textBeforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];
      const slashMatch = currentLine.match(/^\/(\w*)$/);

      if (slashMatch) {
        const query = slashMatch[1];
        const triggerPos = cursorPos - query.length - 1;

        if (!contextMenu.isOpen || contextMenu.triggerType !== '/') {
          contextMenu.open('/', query, triggerPos);
          requestCommands(query);
        } else if (contextMenu.searchQuery !== query) {
          contextMenu.setSearchQuery(query);
          requestCommands(query);
        }
        return;
      }

      // Close menu if no trigger found
      if (contextMenu.isOpen) {
        contextMenu.close();
      }
    }, [onChange, contextMenu]);

    // Request file search from extension
    const requestFileSearch = useCallback((query: string) => {
      vscode.postMessage({
        type: 'searchFiles',
        query,
      });
    }, []);

    // Request commands from extension
    const requestCommands = useCallback((query: string) => {
      vscode.postMessage({
        type: 'getCommands',
        query,
      });
    }, []);

    // Handle context menu selection
    function handleContextMenuSelect(option: ContextMenuOption) {
      if (!textAreaRef.current) return;

      const cursorPos = textAreaRef.current.selectionStart;
      const triggerPos = contextMenu.triggerPosition;

      // Replace from trigger to cursor with selection
      const before = value.slice(0, triggerPos);
      const after = value.slice(cursorPos);

      let newValue = '';
      if (contextMenu.triggerType === '@') {
        // Insert @filename with space
        newValue = `${before}@${option.value} ${after}`;
      } else if (contextMenu.triggerType === '/') {
        // Insert /command with space
        newValue = `${before}/${option.value} ${after}`;
      }

      onChange(newValue);
      contextMenu.close();

      // Focus and position cursor
      setTimeout(() => {
        if (textAreaRef.current) {
          const newCursorPos = triggerPos + option.value.length + 2; // +2 for trigger char and space
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }

    // Listen for file search results from extension
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        const message = event.data;

        if (message.type === 'fileSearchResults' && contextMenu.triggerType === '@') {
          const options: ContextMenuOption[] = message.files.map((file: { path: string; name: string }) => ({
            type: ContextMenuOptionType.File,
            label: file.name,
            value: file.path,
            description: file.path,
          }));
          contextMenu.setOptions(options);
        }

        if (message.type === 'commandsResults' && contextMenu.triggerType === '/') {
          const options: ContextMenuOption[] = message.commands.map((cmd: { name: string; description?: string }) => ({
            type: ContextMenuOptionType.Command,
            label: cmd.name,
            value: cmd.name,
            description: cmd.description,
          }));
          contextMenu.setOptions(options);
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [contextMenu]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let context menu handle navigation keys
      if (contextMenu.handleKeyDown(e)) {
        return;
      }

      if (onKeyDown) {
        onKeyDown(e);
        if (e.defaultPrevented) return;
      }

      // Enter to send (without shift)
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (!disabled && value.trim()) {
          onSend();
        }
      }
    };

    const handleSendClick = () => {
      if (!disabled && value.trim()) {
        onSend();
      }
    };

    const showSendButton = value.trim().length > 0 && !isStreaming;
    const showStopButton = isStreaming;

    return (
      <div className="chat-text-area-container">
        <div className={`chat-text-area-wrapper ${isFocused ? 'focused' : ''}`}>
          <TextareaAutosize
            ref={textAreaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder || '(@ to add context, / for commands)'}
            disabled={disabled}
            minRows={1}
            maxRows={10}
            className="chat-textarea"
          />

          <div className="chat-text-area-buttons">
            {showStopButton && (
              <button
                onClick={handleSendClick}
                className="chat-button stop-button"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square size={18} />
              </button>
            )}
            {showSendButton && (
              <button
                onClick={handleSendClick}
                className="chat-button send-button"
                aria-label="Send message"
                title="Send message (Enter)"
                disabled={disabled}
              >
                <SendHorizontal size={18} />
              </button>
            )}
            {!showSendButton && !showStopButton && (
              <button
                className="chat-button send-button disabled"
                disabled
                aria-label="Send message"
                title="Send message (Enter)"
              >
                <SendHorizontal size={18} />
              </button>
            )}
          </div>
        </div>

        {contextMenu.isOpen && (
          <ContextMenu
            options={contextMenu.options}
            position={contextMenu.position}
            selectedIndex={contextMenu.selectedIndex}
            onSelect={contextMenu.selectOption}
            onClose={contextMenu.close}
          />
        )}
      </div>
    );
  }
);

ChatTextArea.displayName = 'ChatTextArea';
