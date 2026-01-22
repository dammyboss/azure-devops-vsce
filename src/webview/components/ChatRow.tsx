import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ChatMessage } from '../types/messages';
import { PermissionCard } from './PermissionCard';
import { ToolUseCard } from './ToolUseCard';

interface ChatRowProps {
  message: ChatMessage;
}

export const ChatRow: React.FC<ChatRowProps> = ({ message }) => {
  const renderMessage = () => {
    switch (message.type) {
      case 'text':
        return (
          <div className={`message ${message.role}`}>
            {message.role === 'user' ? (
              <div className="user-message-text">{message.content}</div>
            ) : (
              <div className="message-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        );

      case 'permission_request':
        return (
          <div>
            <PermissionCard message={message} />
          </div>
        );

      case 'tool_use':
        return (
          <div>
            <ToolUseCard message={message} />
          </div>
        );

      case 'error':
        return (
          <div className="message error-card">
            <div className="error-card-header">
              <div className="error-icon-container">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="error-label">Error</div>
            </div>
            <div className="error-card-content">
              <p>{message.error}</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return <div data-message-id={message.id}>{renderMessage()}</div>;
};
