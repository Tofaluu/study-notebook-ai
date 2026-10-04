import { get, set } from 'idb-keyval';
import type { LectureSource, StudyExplanation, TechnicalConceptExplanation, SelectedPassageExplanation, StudyModel } from '@workspace/api-client-react';

export interface HistoryItem {
  id: string;
  type: 'user' | 'ai';
  content: string;
  explanation?: StudyExplanation;
  timestamp: number;
}

export type TabType = 'chat' | 'concept' | 'follow-up';

export interface BaseTab {
  id: string;
  type: TabType;
  title: string;
  customName?: string;
  customWidth?: number;
  parentId?: string;
}

export interface ChatTab extends BaseTab {
  type: 'chat';
}

export interface ConceptTab extends BaseTab {
  type: 'concept';
  term: string;
  contextSnippet: string;
  model?: StudyModel;
  explanation?: TechnicalConceptExplanation;
}

export interface FollowUpTab extends BaseTab {
  type: 'follow-up';
  selectedText: string;
  question: string;
  answerContext: string;
  model?: StudyModel;
  explanation?: SelectedPassageExplanation;
}

export type WorkspaceTab = ChatTab | ConceptTab | FollowUpTab;

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  history: HistoryItem[];
  sources: LectureSource[];
  tabs: WorkspaceTab[];
  activeTabId: string;
}

export interface AppState {
  chats: Chat[];
  activeChatId: string | null;
}

const CHATS_KEY = 'study-notebook-chats-v2';
const ACTIVE_CHAT_KEY = 'study-notebook-active-chat-v2';
const OLD_HISTORY_KEY = 'study-notebook-history-v1';
const OLD_SOURCES_KEY = 'study-notebook-sources-v1';
let saveQueue: Promise<void> = Promise.resolve();

export function createEmptyChat(): Chat {
  const id = crypto.randomUUID();
  const tabId = crypto.randomUUID();
  return {
    id,
    title: 'New Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    history: [],
    sources: [],
    tabs: [{ id: tabId, type: 'chat', title: 'Chat' }],
    activeTabId: tabId
  };
}

import { supabase } from './supabase';
import { del } from 'idb-keyval';

let chatCache = new Map<string, string>(); // id -> JSON.stringify(chat)

export async function clearLocalChats() {
  await del(CHATS_KEY);
  await del(ACTIVE_CHAT_KEY);
}

export async function migrateLocalToCloud(userId: string) {
  const localChats = await get<Chat[]>(CHATS_KEY);
  if (localChats && localChats.length > 0) {
    const chatRows = localChats.map(chat => ({
      id: chat.id,
      user_id: userId,
      data: chat,
      updated_at: new Date(chat.updatedAt).toISOString()
    }));
    await supabase.from('chats').upsert(chatRows);
  }
  await clearLocalChats();
}

export async function loadAppState(): Promise<AppState> {
  try {
    let activeChatId = await get<string | null>(ACTIVE_CHAT_KEY);

    const { data: { user } } = await supabase.auth.getUser();
    
    // GUEST MODE
    if (!user) {
      let chats = await get<Chat[]>(CHATS_KEY);
      if (!chats || chats.length === 0) {
        const initialChat = createEmptyChat();
        chats = [initialChat];
        activeChatId = initialChat.id;
        await setAppState({ chats, activeChatId });
      }
      return { chats, activeChatId: activeChatId || chats[0].id };
    }

    // CLOUD MODE
    const { data: dbChats, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    let chats: Chat[] = [];
    if (dbChats && dbChats.length > 0) {
      chats = dbChats.map(row => row.data as Chat);
      chats.forEach(c => chatCache.set(c.id, JSON.stringify(c)));

      if (activeChatId && !chats.find(c => c.id === activeChatId)) {
        activeChatId = chats[0].id;
      }
    } else {
      const initialChat = createEmptyChat();
      chats = [initialChat];
      activeChatId = initialChat.id;
      await setAppState({ chats, activeChatId });
    }
    
    return { chats, activeChatId: activeChatId || null };
  } catch (e) {
    console.error('Failed to load from DB:', e);
    return { chats: [], activeChatId: null };
  }
}

export async function setAppState(state: AppState) {
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(async () => {
      await set(ACTIVE_CHAT_KEY, state.activeChatId);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      // GUEST MODE
      if (!user) {
        await set(CHATS_KEY, state.chats);
        return;
      }

      // CLOUD MODE
      const currentIds = new Set(state.chats.map(c => c.id));
      const deletedIds = Array.from(chatCache.keys()).filter(id => !currentIds.has(id));

      if (deletedIds.length > 0) {
        const { error } = await supabase.from('chats').delete().in('id', deletedIds);
        if (error) console.error("Failed to delete from Supabase:", error);
        deletedIds.forEach(id => chatCache.delete(id));
      }

      const changedChats = state.chats.filter(chat => {
        const str = JSON.stringify(chat);
        if (chatCache.get(chat.id) !== str) {
          chatCache.set(chat.id, str);
          return true;
        }
        return false;
      });

      if (changedChats.length > 0) {
        const chatRows = changedChats.map(chat => ({
          id: chat.id,
          user_id: user.id,
          data: chat,
          updated_at: new Date(chat.updatedAt).toISOString()
        }));

        const { error } = await supabase.from('chats').upsert(chatRows);
        if (error) console.error("Failed to sync to Supabase:", error);
      }
    });
  return saveQueue;
}


