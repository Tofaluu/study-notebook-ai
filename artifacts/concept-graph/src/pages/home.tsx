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

  const handleTermClick = (chatId: string, term: string, contextSnippet: string) => {
    const chat = state?.chats.find(candidate => candidate.id === chatId);
    if (!chat) return;
    const existingTab = chat.tabs.find(
      tab => tab.type === 'concept' && tab.term.toLowerCase() === term.toLowerCase()
    );
    if (existingTab) {
      switchTab(chatId, existingTab.id);
      return;
    }
    addTab(chatId, {
      id: crypto.randomUUID(),
      type: 'concept',
      title: term,
      term,
      contextSnippet
    });
  };

  const handleFollowUp = (chatId: string, selectedText: string, question: string, answerContext: string) => {
    if (!state?.chats.some(chat => chat.id === chatId)) return;
    addTab(chatId, {
      id: crypto.randomUUID(),
      type: 'follow-up',
      title: `Q: ${question.length > 15 ? question.slice(0, 15) + '...' : question}`,
      selectedText,
      question,
      answerContext
    });
  };

  const activeTab = activeChat?.tabs.find(t => t.id === activeChat.activeTabId);
  const activeTabKey = activeChat && activeTab ? `${activeChat.id}:${activeTab.id}` : null;

  const renderTabContent = (chat: NonNullable<typeof activeChat>, tab: NonNullable<typeof activeTab>) => {
    const tabKey = `${chat.id}:${tab.id}`;
    const isVisible = tabKey === activeTabKey;
    const visibilityClass = isVisible
      ? 'absolute inset-0 flex min-h-0 flex-col'
      : 'hidden';

    if (tab.type === 'chat') {
      return (
        <div key={tabKey} className={visibilityClass}>
          <ChatView
            chat={chat}
            onAddHistory={(items) => addHistory(chat.id, items)}
            onRename={(title) => renameChat(chat.id, title)}
            onTermClick={(term, contextSnippet) => handleTermClick(chat.id, term, contextSnippet)}
            onFollowUp={(selectedText, question, answerContext) =>
              handleFollowUp(chat.id, selectedText, question, answerContext)
            }
          />
        </div>
      );
    }

    if (tab.type === 'concept') {
      return (
        <div key={tabKey} className={visibilityClass}>
          <ConceptView
            tab={tab}
            sources={chat.sources}
            onUpdateTab={(updates) => updateTab(chat.id, tab.id, updates)}
            onTermClick={(term, contextSnippet) => handleTermClick(chat.id, term, contextSnippet)}
            onFollowUp={(selectedText, question, answerContext) =>
              handleFollowUp(chat.id, selectedText, question, answerContext)
            }
          />
        </div>
      );
    }

    return (
      <div key={tabKey} className={visibilityClass}>
        <FollowUpView
          tab={tab}
          sources={chat.sources}
          onUpdateTab={(updates) => updateTab(chat.id, tab.id, updates)}
          onTermClick={(term, contextSnippet) => handleTermClick(chat.id, term, contextSnippet)}
          onFollowUp={(selectedText, question, answerContext) =>
            handleFollowUp(chat.id, selectedText, question, answerContext)
          }
        />
      </div>
    );
  };

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
      
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-background relative">
        {activeChat && activeTab ? (
          <>
            <WorkspaceTabs 
              tabs={activeChat.tabs} 
              activeTabId={activeChat.activeTabId} 
              onSwitch={(tabId) => switchTab(activeChat.id, tabId)}
              onClose={(tabId) => closeTab(activeChat.id, tabId)}
            />
            <div className="flex-1 min-h-0 relative">
              {state.chats.flatMap(chat =>
                chat.tabs.map(tab => renderTabContent(chat, tab))
              )}
            </div>
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
