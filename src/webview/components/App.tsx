import React, { useState } from 'react';
import { ChatView } from './ChatView';
import { SettingsView } from './SettingsView';
import { HistoryView } from './HistoryView';
import { Header } from './Header';

export type TabType = 'chat' | 'settings' | 'history';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  const handleNewChat = () => {
    // For now, just switch to chat tab and log
    // Later we'll add logic to clear current conversation
    console.log('[App] New chat requested');
    setActiveTab('chat');
    // TODO: Clear messages in ChatView
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatView />;
      case 'settings':
        return <SettingsView />;
      case 'history':
        return <HistoryView />;
      default:
        return <ChatView />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewChat={handleNewChat}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {renderContent()}
      </div>
    </div>
  );
};
