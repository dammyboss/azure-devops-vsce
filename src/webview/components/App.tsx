import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChatView } from './ChatView';
import { SettingsView } from './SettingsView';
import { HistoryView } from './HistoryView';
import { Header } from './Header';
import { ExtensionMessage } from '../types/messages';
import { vscode } from '../utils/vscode';

export type TabType = 'chat' | 'settings' | 'history';

export interface SettingsViewRef {
  checkUnsaveChanges: (then: () => void) => void;
}

export interface ChatViewRef {
  clearMessages: () => void;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const settingsRef = useRef<SettingsViewRef>(null);
  // const chatViewRef = useRef<ChatViewRef>(null); // TODO: Add when ChatView supports forwardRef

  const switchTab = useCallback((newTab: TabType) => {
    if (settingsRef.current?.checkUnsaveChanges) {
      settingsRef.current.checkUnsaveChanges(() => setActiveTab(newTab));
    } else {
      setActiveTab(newTab);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    console.log('[App] New chat requested');
    switchTab('chat');
    // TODO: Implement clear messages when ChatView supports it
    // chatViewRef.current?.clearMessages();
  }, [switchTab]);

  const onMessage = useCallback((event: MessageEvent) => {
    const message: ExtensionMessage = event.data;

    // Handle tab switching from extension
    if (message.type === 'switchTab' && message.tab) {
      switchTab(message.tab as TabType);
    }
  }, [switchTab]);

  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMessage]);

  // Tell the extension that webview is ready
  useEffect(() => {
    vscode.postMessage({ type: 'webviewDidLaunch' });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <Header
        activeTab={activeTab}
        onTabChange={switchTab}
        onNewChat={handleNewChat}
      />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Keep ChatView always mounted to preserve state */}
        <div style={{
          display: activeTab === 'chat' ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          width: '100%'
        }}>
          <ChatView />
        </div>

        {activeTab === 'settings' && (
          <SettingsView
            ref={settingsRef}
            onDone={() => setActiveTab('chat')}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView onDone={() => switchTab('chat')} />
        )}
      </div>
    </div>
  );
};
