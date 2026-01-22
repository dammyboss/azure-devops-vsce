import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, ExtensionMessage, PermissionRequest } from '../types/messages';
import { ChatRow } from './ChatRow';
import { vscode } from '../utils/vscode';

export const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentStreamingMessageRef = useRef<string | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message: ExtensionMessage = event.data;
      console.log('[ChatView] ===== Received message =====');
      console.log('[ChatView] Type:', message.type);
      console.log('[ChatView] Message:', message);
      console.log('[ChatView] Current messages count:', messages.length);

      switch (message.type) {
        case 'userMessageAdded':
          // Reset streaming ref when new user message arrives
          currentStreamingMessageRef.current = null;
          setMessages((prev) => [
            ...prev,
            {
              id: `user-${message.timestamp}`,
              timestamp: message.timestamp,
              role: 'user',
              type: 'text',
              content: message.text,
            },
          ]);
          break;

        case 'streamText':
          setIsGenerating(true);
          setMessages((prev) => {
            console.log('[ChatView] streamText - current ref:', currentStreamingMessageRef.current, 'prev messages:', prev.length);

            // Find existing streaming message or create new one
            const existingIndex = prev.findIndex(
              (m) => m.id === currentStreamingMessageRef.current
            );

            if (existingIndex !== -1) {
              // Update existing streaming message
              console.log('[ChatView] Updating existing message at index:', existingIndex);
              const updated = [...prev];
              const existingMsg = updated[existingIndex];
              if (existingMsg.type === 'text') {
                updated[existingIndex] = {
                  ...existingMsg,
                  content: existingMsg.content + message.text,
                };
              }
              return updated;
            } else {
              // Create new streaming message - ensure unique ID with random component
              const newId = `assistant-streaming-${Date.now()}-${Math.random()}`;
              currentStreamingMessageRef.current = newId;
              console.log('[ChatView] Creating NEW streaming message with id:', newId, 'will be appended at end');
              return [
                ...prev,
                {
                  id: newId,
                  timestamp: Date.now(),
                  role: 'assistant',
                  type: 'text',
                  content: message.text,
                  isStreaming: true,
                },
              ];
            }
          });
          break;

        case 'toolUse':
          // Don't add tool use cards - they're handled by permission cards
          console.log('[ChatView] Skipping toolUse message (handled by permission card)');
          break;

        case 'toolResult':
          setMessages((prev) => {
            const updated = [...prev];
            // Find the most recent permission_request with matching tool name and update it with the result
            for (let i = updated.length - 1; i >= 0; i--) {
              const msg = updated[i];
              if (
                msg.type === 'permission_request' &&
                msg.toolName === message.toolName &&
                msg.status === 'approved'
              ) {
                updated[i] = {
                  ...msg,
                  result: message.isError ? undefined : message.result,
                  error: message.isError ? message.result : undefined,
                };
                console.log('[ChatView] Updated permission card with result:', updated[i]);
                break;
              }
              // Also update tool_use messages if they exist
              if (
                msg.type === 'tool_use' &&
                msg.toolName === message.toolName
              ) {
                updated[i] = {
                  ...msg,
                  status: message.isError ? 'error' : 'completed',
                  result: message.isError ? undefined : message.result,
                  error: message.isError ? message.result : undefined,
                };
                break;
              }
            }
            return updated;
          });
          break;

        case 'permissionPrompt':
          // Reset streaming ref when permission prompt arrives (new tool interaction)
          currentStreamingMessageRef.current = null;
          console.log('[ChatView] Received permissionPrompt:', message);
          console.log('[ChatView] Current messages count:', messages.length);

          // ONLY add the permission request card (no explanation text, no tool use card)
          setMessages((prev) => {
            console.log('[ChatView] Adding permission card, prev length:', prev.length);
            return [
              ...prev,
              {
                id: message.id,
                timestamp: Date.now(),
                role: 'assistant',
                type: 'permission_request',
                serverName: message.serverName,
                toolName: message.toolName,
                toolInput: message.toolInput,
                status: 'pending',
              } as PermissionRequest,
            ];
          });
          break;

        case 'permissionResponse':
          // Update permission status
          console.log('[ChatView] Received permissionResponse:', message);
          setMessages((prev) => {
            const updated = [...prev];
            const index = updated.findIndex((m) => m.id === message.id);
            console.log('[ChatView] Found permission card at index:', index);
            if (index !== -1 && updated[index].type === 'permission_request') {
              updated[index] = {
                ...updated[index],
                status: message.action === 'allow' || message.action === 'allow-always' ? 'approved' : 'denied',
              } as PermissionRequest;
              console.log('[ChatView] Updated permission card status to:', updated[index].status);
            }
            return updated;
          });
          break;

        case 'error':
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              timestamp: Date.now(),
              role: 'assistant',
              type: 'error',
              error: message.error,
            },
          ]);
          setIsGenerating(false);
          currentStreamingMessageRef.current = null;
          break;

        case 'complete':
          setIsGenerating(false);
          currentStreamingMessageRef.current = null;
          // Mark streaming message as complete
          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.type === 'text' && 'isStreaming' in lastMsg) {
              delete (lastMsg as any).isStreaming;
            }
            return updated;
          });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isGenerating) return;

    vscode.postMessage({
      type: 'sendMessage',
      text: inputValue,
    });

    setInputValue('');
    setIsGenerating(true);
  }, [inputValue, isGenerating]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Debug: Log whenever messages change
  useEffect(() => {
    console.log('[ChatView] Messages state updated. Count:', messages.length);
    console.log('[ChatView] Messages:', messages);
  }, [messages]);

  return (
    <div className="chat-container">
      <div className="messages-container">
        <div style={{ padding: '10px', background: '#333', color: '#fff', fontSize: '12px' }}>
          Debug: {messages.length} messages in state
        </div>
        {messages.map((message) => (
          <ChatRow key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about work items, sprints, or Azure DevOps..."
          disabled={isGenerating}
          rows={3}
        />
        <button onClick={handleSend} disabled={isGenerating || !inputValue.trim()}>
          {isGenerating ? 'Generating...' : 'Send'}
        </button>
      </div>
    </div>
  );
};
