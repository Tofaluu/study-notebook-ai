import React from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceTabs } from '@/components/WorkspaceTabs';
import { ChatView } from '@/components/ChatView';
import { ConceptView } from '@/components/ConceptView';
import { FollowUpView } from '@/components/FollowUpView';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { 
    state, activeChat, createChat, switchChat, deleteChat, renameChat, 
    addTab, closeTab, switchTab, updateTab, setSources, addHistory 
  } = useWorkspace();

  if (!state) {
    return <div className="h-[100dvh] w-full flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const handleTermClick = (term: string, contextSnippet: string) => {
    if (!activeChat) return;
    const existingTab = activeChat.tabs.find(
      tab => tab.type === 'concept' && tab.term.toLowerCase() === term.toLowerCase()
    );
    if (existingTab) {
      switchTab(activeChat.id, existingTab.id);
      return;
    }
    addTab(activeChat.id, {
      id: crypto.randomUUID(),
      type: 'concept',
      title: term,
      term,
      contextSnippet
    });
  };

  const handleFollowUp = (selectedText: string, question: string, answerContext: string) => {
    if (!activeChat) return;
    addTab(activeChat.id, {
      id: crypto.randomUUID(),
      type: 'follow-up',
      title: `Q: ${question.length > 15 ? question.slice(0, 15) + '...' : question}`,
      selectedText,
      question,
      answerContext
    });
  };

  const activeTab = activeChat?.tabs.find(t => t.id === activeChat.activeTabId);

  return (
    <div className="flex h-[100dvh] bg-background w-full overflow-hidden font-sans">
      <Sidebar 
        chats={state.chats}
        activeChatId={state.activeChatId}
        activeChat={activeChat}
        onCreateChat={createChat}
        onSwitchChat={switchChat}
        onDeleteChat={deleteChat}
        onRenameChat={renameChat}
        onSetSources={(sources) => activeChat && setSources(activeChat.id, sources)}
      />
      
      <main className="flex-1 flex flex-col min-w-0 bg-background relative">
        {activeChat && activeTab ? (
          <>
            <WorkspaceTabs 
              tabs={activeChat.tabs} 
              activeTabId={activeChat.activeTabId} 
              onSwitch={(tabId) => switchTab(activeChat.id, tabId)}
              onClose={(tabId) => closeTab(activeChat.id, tabId)}
            />
            {activeTab.type === 'chat' && (
              <ChatView 
                chat={activeChat} 
                onAddHistory={(items) => addHistory(activeChat.id, items)}
                onRename={(title) => renameChat(activeChat.id, title)}
                onTermClick={handleTermClick}
                onFollowUp={handleFollowUp}
              />
            )}
            {activeTab.type === 'concept' && (
              <ConceptView 
                tab={activeTab} 
                sources={activeChat.sources}
                onUpdateTab={(updates) => updateTab(activeChat.id, activeTab.id, updates)}
                onTermClick={handleTermClick}
                onFollowUp={handleFollowUp}
              />
            )}
            {activeTab.type === 'follow-up' && (
              <FollowUpView 
                tab={activeTab} 
                sources={activeChat.sources}
                onUpdateTab={(updates) => updateTab(activeChat.id, activeTab.id, updates)}
                onTermClick={handleTermClick}
                onFollowUp={handleFollowUp}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background">
            <div className="text-center animate-in fade-in duration-700">
              <p className="text-lg mb-4">No active notebook.</p>
              <button onClick={createChat} className="text-primary hover:underline font-medium">Create a new notebook</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
