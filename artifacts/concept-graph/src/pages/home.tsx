import React from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceTabs } from '@/components/WorkspaceTabs';
import { ChatView } from '@/components/ChatView';
import { ConceptView } from '@/components/ConceptView';
import { FollowUpView } from '@/components/FollowUpView';
import { NotebookReaderView } from '@/components/NotebookReaderView';
import { Loader2 } from 'lucide-react';
import { DEMO_SOURCE_ID, getDemoConcept, takeDemoWait } from '@/lib/demo';
import { trackEvent } from '@/lib/analytics';
import type { StudyModel } from '@workspace/api-client-react';
import { DEFAULT_STUDY_MODEL, isStudyModel } from '@/lib/models';
import { SettingsModal } from '@/components/SettingsModal';
import { useFontsReady } from '@/lib/fonts';
import { VoiceProvider } from '@/components/VoiceProvider';
import { VoiceBannerDock } from '@/components/VoiceBanner';
import { resolveVoiceAction } from '@/lib/voice-actions';
import { toast } from '@/hooks/use-toast';

const MODEL_STORAGE_KEY = 'study-notebook-model-v1';

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(() => {
    // On phones the sidebar overlays the whole workspace, so always start closed there
    if (!window.matchMedia('(min-width: 768px)').matches) return false;
    const saved = localStorage.getItem('study-notebook-sidebar-open');
    return saved !== null ? JSON.parse(saved) : true;
  });

  React.useEffect(() => {
    localStorage.setItem('study-notebook-sidebar-open', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  const [selectedModel, setSelectedModel] = React.useState<StudyModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    return isStudyModel(savedModel) ? savedModel : DEFAULT_STUDY_MODEL;
  });
  const [isReaderMode, setIsReaderMode] = React.useState(false);
  // What was highlighted when the mic opened; opening it re-renders the chat, which can drop the live selection
  const heldHighlightRef = React.useRef<{ text: string; passage: { text: string; context: string } | null } | null>(null);
  React.useEffect(() => {
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);
  const fontsReady = useFontsReady();
  const {
    state, activeChat, createChat, openDemo, switchChat, deleteChat, deleteAllChats, renameChat,
    addTab, closeTab, switchTab, updateTab, reorderTabs, setSources, addHistory, removeHistoryItem
  } = useWorkspace();

  if (!state || !fontsReady) {
    return <div className="h-[100dvh] w-full flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const handleCreateChat = () => {
    trackEvent('notebook_create');
    createChat();
  };

  const handleOpenDemo = () => {
    trackEvent('demo_open');
    openDemo();
  };

  const handleTermClick = (chatId: string, term: string, contextSnippet: string, parentId?: string): string | undefined => {
    const chat = state?.chats.find(candidate => candidate.id === chatId);
    if (!chat) return;
    if (chat.sources.some(source => source.id === DEMO_SOURCE_ID)) {
      trackEvent(parentId ? 'demo_prereq_click' : 'demo_term_click', { term });
    }
    const existingTab = chat.tabs.find(
      tab => tab.type === 'concept' && tab.term.toLowerCase() === term.toLowerCase()
    );
    if (existingTab) {
      if (!isReaderMode) {
        switchTab(chatId, existingTab.id);
      }
      return existingTab.id;
    }
    const newTabId = crypto.randomUUID();
    // A demo answer is already written. Opening the tab with it in place means no loading screen flashes up for a
    // frame first; the one tab that is meant to wait is opened blank, and ConceptView holds it back on purpose.
    const demoExplanation = getDemoConcept(chat.sources, term);
    const waits = !!demoExplanation && takeDemoWait();
    addTab(chatId, {
      id: newTabId,
      type: 'concept',
      title: term,
      parentId,
      term,
      contextSnippet,
      model: selectedModel,
      explanation: waits ? undefined : demoExplanation,
    });
    return newTabId;
  };

  /** The text highlighted inside one of the chat's answers, with that answer as its context; null when there is none. */
  const highlightedAnswerPassage = (chat: NonNullable<typeof activeChat>) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!selection || !text || !selection.anchorNode || !selection.focusNode) return null;

    const answerOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('[data-answer-id]') ?? null;
    const answer = answerOf(selection.anchorNode);
    // A highlight that runs out of the answer, or sits in your own message, is not a passage of it
    if (!answer || answer !== answerOf(selection.focusNode)) return null;

    const explanation = chat.history.find((item) => item.id === answer.getAttribute('data-answer-id'))?.explanation;
    if (!explanation) return null;
    return { text, context: `${explanation.title}\n\n${explanation.answerMarkdown}`.slice(0, 20000) };
  };

  const rememberHighlight = () => {
    trackEvent('voice_start');
    const text = window.getSelection()?.toString().trim() ?? '';
    const onChatTab = activeChat?.tabs.find((t) => t.id === activeChat.activeTabId)?.type === 'chat';
    heldHighlightRef.current = { text, passage: activeChat && onChatTab ? highlightedAnswerPassage(activeChat) : null };
  };

  const handleFollowUp = (chatId: string, selectedText: string, question: string, answerContext: string, parentId?: string): string | undefined => {
    const targetChat = state?.chats.find(chat => chat.id === chatId);
    if (!targetChat) return;
    if (targetChat.sources.some(source => source.id === DEMO_SOURCE_ID)) {
      trackEvent('demo_followup_open', { source: 'highlight' });
    }
    const newTabId = crypto.randomUUID();
    addTab(chatId, {
      id: newTabId,
      type: 'follow-up',
      title: `Q: ${question}`,
      selectedText,
      question,
      answerContext,
      parentId,
      model: selectedModel
    });
    return newTabId;
  };

  const activeTab = activeChat?.tabs.find(t => t.id === activeChat.activeTabId);
  const activeTabKey = activeChat && activeTab ? `${activeChat.id}:${activeTab.id}` : null;

  // What a spoken request does depends on the tab it was said in: a question in the chat is asked there, and on a
  // concept or follow-up page it branches off that page, about the highlighted passage if there is one
  const handleVoiceTranscript = async (transcript: string) => {
    const chat = activeChat;
    const tab = activeTab;
    if (!chat || !tab) return;
    const parentId = tab.type === 'chat' ? undefined : tab.parentId || tab.id;

    const held = heldHighlightRef.current;
    heldHighlightRef.current = null;
    const action = await resolveVoiceAction(transcript, selectedModel);

    if (action.type === 'new_concept_tab') {
      toast({ title: 'Voice Command Executed', description: `Opening new tab for "${action.term}"...` });
      handleTermClick(chat.id, action.term, action.contextSnippet || `Opened via voice command for ${action.term}`, parentId);
      return;
    }

    if (action.type === 'rename_notebook') {
      toast({ title: 'Notebook Renamed', description: `Renamed to "${action.title}"` });
      renameChat(chat.id, action.title);
      return;
    }

    const question = (action.text || transcript).trim();
    if (!question) return;

    if (isReaderMode) {
      toast({ title: 'Reader view is open', description: 'Switch back to a tab to ask a question by voice.' });
      return;
    }

    if (tab.type === 'chat') {
      toast({ title: 'Voice Prompt Received', description: `Asking: "${question}"` });
      // Text highlighted inside one of the answers makes this a follow-up about that passage, like the popup does
      const passage = held?.passage ?? highlightedAnswerPassage(chat);
      if (passage) {
        handleFollowUp(chat.id, passage.text, question, passage.context);
        return;
      }
      window.dispatchEvent(new CustomEvent('voice-ask', { detail: { chatId: chat.id, text: question } }));
      return;
    }

    if (!tab.explanation) {
      toast({ title: 'Still loading', description: 'Wait for this page to finish before asking about it.' });
      return;
    }
    const pageTitle = tab.explanation.title || (tab.type === 'concept' ? tab.term : tab.question);
    const highlighted = held?.text || window.getSelection()?.toString().trim();
    toast({ title: 'Voice Prompt Received', description: `Asking: "${question}"` });
    handleFollowUp(
      chat.id,
      highlighted || pageTitle,
      question,
      `${pageTitle}

${tab.explanation.answerMarkdown}`.slice(0, 20000),
      parentId
    );
  };

  const renderTabContent = (chat: NonNullable<typeof activeChat>, tab: NonNullable<typeof activeTab>) => {
    const tabKey = `${chat.id}:${tab.id}`;
    const isVisible = !isReaderMode && tabKey === activeTabKey;
    const visibilityClass = isVisible
      ? 'absolute inset-0 flex min-h-0 flex-col'
      : 'hidden';

    if (tab.type === 'chat') {
      return (
        <div key={tabKey} className={visibilityClass}>
          <ChatView
            chat={chat}
            model={selectedModel}
            onModelChange={setSelectedModel}
            isVisible={isVisible}
            onAddHistory={(items) => addHistory(chat.id, items)}
            onRemoveHistory={(itemId) => removeHistoryItem(chat.id, itemId)}
            onRename={(title) => renameChat(chat.id, title)}
            onTermClick={(term, contextSnippet) => handleTermClick(chat.id, term, contextSnippet)}
            onFollowUp={(selectedText, question, answerContext) =>
              handleFollowUp(chat.id, selectedText, question, answerContext)
            }
            onAddSources={(sources) => {
              if (sources.length > 0) trackEvent('source_upload', { count: sources.length });
              setSources(chat.id, [...chat.sources, ...sources]);
            }}
            onOpenDemo={handleOpenDemo}
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
            model={tab.model ?? selectedModel}
            onUpdateTab={(updates) => updateTab(chat.id, tab.id, updates)}
            onTermClick={(term, contextSnippet) => handleTermClick(chat.id, term, contextSnippet, tab.parentId || tab.id)}
            onFollowUp={(selectedText, question, answerContext) =>
              handleFollowUp(chat.id, selectedText, question, answerContext, tab.parentId || tab.id)
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
          model={tab.model ?? selectedModel}
          onUpdateTab={(updates) => updateTab(chat.id, tab.id, updates)}
          onTermClick={(term, contextSnippet) => handleTermClick(chat.id, term, contextSnippet, tab.parentId || tab.id)}
          onFollowUp={(selectedText, question, answerContext) =>
            handleFollowUp(chat.id, selectedText, question, answerContext, tab.parentId || tab.id)
          }
        />
      </div>
    );
  };

  return (
    <VoiceProvider onTranscript={handleVoiceTranscript} onListenStart={rememberHighlight} model={selectedModel}>
    <div className="flex h-[100dvh] bg-background w-full overflow-hidden font-sans relative">
      <Sidebar
        isOpen={isSidebarOpen}
        chats={state.chats}
        activeChatId={state.activeChatId}
        activeChat={activeChat}
        onCreateChat={handleCreateChat}
        onSwitchChat={switchChat}
        onDeleteChat={deleteChat}
        onDeleteAllChats={deleteAllChats}
        onRenameChat={renameChat}
        onSetSources={(sources) => {
          if (activeChat) {
            const added = sources.length - activeChat.sources.length;
            if (added > 0) trackEvent('source_upload', { count: added });
            setSources(activeChat.id, sources);
          }
        }}
      />
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main
        className="flex-1 flex flex-col min-w-0 min-h-0 bg-background relative"
        onDragEnter={(e) => e.preventDefault()}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) {
            window.dispatchEvent(new CustomEvent('upload-pdfs', { detail: Array.from(e.dataTransfer.files) }));
          }
        }}
      >
        {activeChat && activeTab ? (
          <>
            <WorkspaceTabs
              tabs={activeChat.tabs}
              activeTabId={activeChat.activeTabId}
              isReaderMode={isReaderMode}
              onToggleReaderMode={() => setIsReaderMode((v) => {
                if (!v) trackEvent('reader_mode_toggle');
                return !v;
              })}
              onSwitch={(tabId) => {
                setIsReaderMode(false);
                const clickedTab = activeChat.tabs.find(t => t.id === tabId);
                if (clickedTab?.type === 'follow-up' && activeChat.sources.some(s => s.id === DEMO_SOURCE_ID)) {
                  trackEvent('demo_followup_open', { source: 'tab' });
                }
                switchTab(activeChat.id, tabId);
              }}
              onClose={(tabId) => closeTab(activeChat.id, tabId)}
              onUpdateTab={(tabId, updates) => updateTab(activeChat.id, tabId, updates)}
              onReorderTabs={(newTabs) => reorderTabs(activeChat.id, newTabs)}
              onToggleSidebar={() => setIsSidebarOpen((v: boolean) => !v)}
            />
            <div className="flex-1 min-h-0 relative">
              {(isReaderMode || activeTab.type !== 'chat') && <VoiceBannerDock anchor="page" />}
              {state.chats.flatMap(chat =>
                chat.tabs.map(tab => renderTabContent(chat, tab))
              )}
              {isReaderMode && (
                <div className="absolute inset-0 flex min-h-0 flex-col">
                  <NotebookReaderView
                    chat={activeChat}
                    onTermClick={(term, contextSnippet, parentId) =>
                      handleTermClick(activeChat.id, term, contextSnippet, parentId)
                    }
                    onFollowUp={(selectedText, question, answerContext, parentId) =>
                      handleFollowUp(activeChat.id, selectedText, question, answerContext, parentId)
                    }
                    onJumpToTab={(tabId) => {
                      setIsReaderMode(false);
                      switchTab(activeChat.id, tabId);
                    }}
                    onOpenDemo={handleOpenDemo}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
            <div className="text-center">
              <p className="mb-4 text-lg">No notebook is open.</p>
              <div className="flex items-center justify-center gap-4">
                <button onClick={handleCreateChat} className="text-primary hover:underline font-medium">Create a new notebook</button>
                <span aria-hidden>·</span>
                <button onClick={handleOpenDemo} className="text-primary hover:underline font-medium">Open the demo</button>
              </div>
            </div>
          </div>
        )}
      </main>
      <SettingsModal />
    </div>
    </VoiceProvider>
  );
}
