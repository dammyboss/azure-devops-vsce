import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal, Square, Loader2 } from 'lucide-react';

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder || 'Ask about work items, sprints, or Azure DevOps...'}
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
      </div>
    );
  }
);

ChatTextArea.displayName = 'ChatTextArea';
