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

export async function loadAppState(): Promise<AppState> {
  try {
    let chats = await get<Chat[]>(CHATS_KEY);
    let activeChatId = await get<string | null>(ACTIVE_CHAT_KEY);

    if (!chats) {
      // Migrate from v1
      const oldHistory = await get<HistoryItem[]>(OLD_HISTORY_KEY);
      const oldSources = await get<LectureSource[]>(OLD_SOURCES_KEY);
      
      if (oldHistory?.length || oldSources?.length) {
        const initialChat: Chat = {
          ...createEmptyChat(),
          title: 'Imported Session',
          history: oldHistory || [],
          sources: oldSources || []
        };
        chats = [initialChat];
        activeChatId = initialChat.id;
        await setAppState({ chats, activeChatId });
      } else {
        const initialChat = createEmptyChat();
        chats = [initialChat];
        activeChatId = initialChat.id;
        await setAppState({ chats, activeChatId });
      }
    }
    
    return { chats: chats || [], activeChatId: activeChatId || null };
  } catch (e) {
    return { chats: [], activeChatId: null };
  }
}

export async function setAppState(state: AppState) {
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(async () => {
      await Promise.all([
        set(CHATS_KEY, state.chats),
        set(ACTIVE_CHAT_KEY, state.activeChatId)
      ]);
    });
  return saveQueue;
}


