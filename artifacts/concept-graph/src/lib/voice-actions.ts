import { parseVoiceCommand, type VoiceAction } from './voice-commands';

type VoiceActionResponse = {
  action?: 'new_concept_tab' | 'rename_notebook' | 'dictate';
  term?: string;
  title?: string;
  text?: string;
};

function apiKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const geminiKey = window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key');
  if (geminiKey) headers['x-gemini-api-key'] = geminiKey;
  const openaiKey = window.localStorage.getItem('study-notebook-openai-key');
  if (openaiKey) headers['x-openai-api-key'] = openaiKey;
  const anthropicKey = window.localStorage.getItem('study-notebook-anthropic-key');
  if (anthropicKey) headers['x-anthropic-api-key'] = anthropicKey;
  return headers;
}

/**
 * Works out what a spoken transcript is asking for. With an API key the fast model corrects mis-heard technical terms
 * and tidies the wording; without one, or if that call fails, the local parse stands.
 */
export async function resolveVoiceAction(transcript: string, model: string): Promise<VoiceAction> {
  const local = parseVoiceCommand(transcript);
  const keys = apiKeyHeaders();
  if (Object.keys(keys).length === 0) return local;

  try {
    const res = await fetch('/api/study/voice/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...keys },
      body: JSON.stringify({ transcript, model }),
    });
    if (!res.ok) return local;
    const ai = (await res.json()) as VoiceActionResponse;
    const contextSnippet = `Opened via voice command: "${transcript}".`;

    // An action missing the field it needs (a tab with no topic) is ignored, so the local parse stands
    if (ai.action === 'new_concept_tab' && ai.term?.trim()) {
      return { type: 'new_concept_tab', term: ai.term.trim(), contextSnippet };
    }
    if (ai.action === 'rename_notebook' && ai.title?.trim()) {
      return { type: 'rename_notebook', title: ai.title.trim() };
    }
    if (ai.action === 'dictate') {
      return { type: 'dictate', text: ai.text?.trim() || transcript };
    }
  } catch {
    // Network trouble: fall back to the local parse
  }
  return local;
}
