import { useState, useEffect, useCallback } from 'react';
import { loadAppState, setAppState, createEmptyChat, AppState, Chat, WorkspaceTab, HistoryItem } from '@/lib/db';
import { LectureSource } from '@workspace/api-client-react';

export function useWorkspace() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    loadAppState().then(setState);
  }, []);

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      setAppState(next).catch(console.error);
      return next;
    });
  }, []);

  const createChat = useCallback(() => {
    updateState(prev => {
      const newChat = createEmptyChat();
      return {
        chats: [newChat, ...prev.chats],
        activeChatId: newChat.id
      };
    });
  }, [updateState]);

  const switchChat = useCallback((id: string) => {
    updateState(prev => ({ ...prev, activeChatId: id }));
  }, [updateState]);

  const deleteChat = useCallback((id: string) => {
    updateState(prev => {
      const remaining = prev.chats.filter(c => c.id !== id);
      if (remaining.length === 0) {
        const newChat = createEmptyChat();
        return { chats: [newChat], activeChatId: newChat.id };
      }
      return {
        chats: remaining,
        activeChatId: prev.activeChatId === id ? remaining[0].id : prev.activeChatId
      };
    });
  }, [updateState]);

  const deleteAllChats = useCallback(() => {
    updateState(() => {
      const newChat = createEmptyChat();
      return { chats: [newChat], activeChatId: newChat.id };
    });
  }, [updateState]);

  const renameChat = useCallback((id: string, title: string) => {
    updateState(prev => ({
      ...prev,
      chats: prev.chats.map(c => c.id === id ? { ...c, title, updatedAt: Date.now() } : c)
    }));
  }, [updateState]);

  const activeChat = state?.chats.find(c => c.id === state.activeChatId) || null;

  const updateChat = useCallback((chatId: string, updater: (chat: Chat) => Chat) => {
    updateState(prev => {
      return {
        ...prev,
        chats: prev.chats.map(c => c.id === chatId ? updater(c) : c)
      };
    });
  }, [updateState]);

  const addTab = useCallback((chatId: string, tab: WorkspaceTab) => {
    updateChat(chatId, chat => ({
      ...chat,
      tabs: [...chat.tabs, tab],
      activeTabId: tab.id,
      updatedAt: Date.now()
    }));
  }, [updateChat]);

  const closeTab = useCallback((chatId: string, tabId: string) => {
    updateChat(chatId, chat => {
      const tabs = chat.tabs.filter(t => t.id !== tabId);
      // Fallback to the last available tab if the active one was closed
      // Since the 'chat' tab can't be closed, tabs.length will always be >= 1
      const activeTabId = chat.activeTabId === tabId 
        ? tabs[tabs.length - 1].id 
        : chat.activeTabId;
        
      return {
        ...chat,
        tabs,
        activeTabId,
        updatedAt: Date.now()
      };
    });
  }, [updateChat]);

  const switchTab = useCallback((chatId: string, tabId: string) => {
    updateChat(chatId, chat => ({ ...chat, activeTabId: tabId, updatedAt: Date.now() }));
  }, [updateChat]);

  const updateTab = useCallback((chatId: string, tabId: string, updates: Partial<WorkspaceTab>) => {
    updateChat(chatId, chat => ({
      ...chat,
      tabs: chat.tabs.map(t => t.id === tabId ? { ...t, ...updates } as WorkspaceTab : t),
      updatedAt: Date.now()
    }));
  }, [updateChat]);

  const setSources = useCallback((chatId: string, sources: LectureSource[]) => {
    updateChat(chatId, chat => ({ ...chat, sources, updatedAt: Date.now() }));
  }, [updateChat]);

  const addHistory = useCallback((chatId: string, items: HistoryItem[]) => {
    updateChat(chatId, chat => ({ ...chat, history: [...chat.history, ...items], updatedAt: Date.now() }));
  }, [updateChat]);

  return {
    state,
    activeChat,
    createChat,
    switchChat,
    deleteChat,
    deleteAllChats,
    renameChat,
    addTab,
    closeTab,
    switchTab,
    updateTab,
    setSources,
    addHistory
  };
}
