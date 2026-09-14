import { get, set } from 'idb-keyval';
import type { LectureSource, StudyExplanation } from '@workspace/api-client-react';

export interface HistoryItem {
  id: string;
  type: 'user' | 'ai';
  content: string;
  explanation?: StudyExplanation;
  timestamp: number;
}

const HISTORY_KEY = 'study-notebook-history-v1';
const SOURCES_KEY = 'study-notebook-sources-v1';

export async function saveSession(history: HistoryItem[], sources: LectureSource[]) {
  await set(HISTORY_KEY, history);
  await set(SOURCES_KEY, sources);
}

export async function loadSession(): Promise<{ history: HistoryItem[], sources: LectureSource[] }> {
  try {
    const [history, sources] = await Promise.all([
      get<HistoryItem[]>(HISTORY_KEY),
      get<LectureSource[]>(SOURCES_KEY),
    ]);
    
    return {
      history: history || [],
      sources: sources || []
    };
  } catch (e) {
    return { history: [], sources: [] };
  }
}

export async function clearSession() {
  await set(HISTORY_KEY, []);
  await set(SOURCES_KEY, []);
}