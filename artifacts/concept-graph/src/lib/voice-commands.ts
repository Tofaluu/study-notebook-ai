export type VoiceAction =
  | {
      type: 'new_concept_tab';
      term: string;
      contextSnippet?: string;
    }
  | {
      type: 'rename_notebook';
      title: string;
    }
  | {
      type: 'dictate';
      text: string;
    };

// Filler / incomplete phrases that must not trigger a tab on their own
const INCOMPLETE_TAB_TERMS = new Set([
  'and explain',
  'explain',
  'for',
  'about',
  'on',
  'and',
  'a',
  'the',
  'new tab',
]);

/**
 * Parses a spoken transcript into either a structured workspace action
 * or plain dictated text.
 */
export function parseVoiceCommand(transcript: string): VoiceAction {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { type: 'dictate', text: '' };
  }

  // Normalize punctuation and extra spaces
  const cleaned = trimmed.replace(/[.?!,;:]+$/, '').trim();

  // 1. "Open (in a) new tab [and explain] <concept>" or "New tab [for/explain] <concept>"
  const newTabMatch = cleaned.match(
    /^(?:please\s+)?(?:open\s+(?:in\s+)?(?:a\s+)?new\s+tab\s+(?:and\s+explain\s+|for\s+|about\s+|on\s+)?|new\s+tab\s+(?:and\s+explain\s+|for\s+|about\s+|on\s+)?)(.+)$/i
  );
  if (newTabMatch && newTabMatch[1]?.trim()) {
    let term = newTabMatch[1].trim();
    // Clean leading conjunctions/filler verbs
    term = term.replace(/^(?:and\s+explain|explain|for|about|on)\s+/i, '').trim();

    // Guard: ignore incomplete utterances like "and explain" or single letters
    if (term && term.length > 1 && !INCOMPLETE_TAB_TERMS.has(term.toLowerCase())) {
      return {
        type: 'new_concept_tab',
        term,
        contextSnippet: `Opened via voice command: "${trimmed}".`,
      };
    }
  }

  // 2. "Rename (this) notebook to <title>" or "Rename chat to <title>"
  const renameMatch = cleaned.match(
    /^(?:please\s+)?rename\s+(?:this\s+)?(?:notebook|session|chat)\s+(?:to\s+)?(.+)$/i
  );
  if (renameMatch && renameMatch[1]?.trim()) {
    let title = renameMatch[1].trim();
    title = title.replace(/^to\s+/i, '').trim();
    if (title && title.length > 1 && title.toLowerCase() !== 'to') {
      const formattedTitle = title.charAt(0).toUpperCase() + title.slice(1);
      return {
        type: 'rename_notebook',
        title: formattedTitle,
      };
    }
  }

  // Fallback: regular dictation
  return {
    type: 'dictate',
    text: trimmed,
  };
}
