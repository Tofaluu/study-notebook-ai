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

// Filler words and phrases that often surround casual spoken requests
const CASUAL_FILLERS = [
  /^(?:can\s+you|could\s+you|please|would\s+you|i\s+want\s+to|let'?s|i'd\s+like\s+to)\s+/i,
  /^(?:explain|tell\s+me\s+about|describe|learn\s+about|look\s+at|open|show\s+me|create|make)\s+/i,
  /^(?:in\s+)?a\s+new\s+concept\s+(?:tab\s+)?/i,
  /^(?:sorry|oops|i\s+mean|actually)\s+/i,
  /(?:sorry|i\s+mean|please)\s*$/i,
];

// Clean out common conversational junk from a term
function cleanConceptTerm(raw: string): string {
  let cleaned = raw.trim();
  let prev = '';
  // Iteratively strip conversational lead-ins/trailers
  while (cleaned !== prev) {
    prev = cleaned;
    for (const pattern of CASUAL_FILLERS) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
  }
  // Strip trailing/leading prepositions or filler conversational bridges
  cleaned = cleaned.replace(/^(?:about|for|on|in|with|to|sorry\s+about)\s+/i, '').trim();
  cleaned = cleaned.replace(/\s+(?:please|thanks|thank\s+you)$/i, '').trim();
  // Strip trailing punctuation
  cleaned = cleaned.replace(/[.?!,;:]+$/, '').trim();
  return cleaned;
}

/**
 * Parses a spoken transcript into either a structured workspace action
 * or plain dictated text.
 */
export function parseVoiceCommand(transcript: string): VoiceAction {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { type: 'dictate', text: '' };
  }

  const cleaned = trimmed.replace(/[.?!,;:]+$/, '').trim();

  // 1. Rename Notebook check: "Rename (this) notebook/chat to <title>"
  const renameMatch = cleaned.match(
    /(?:rename\s+(?:this\s+)?(?:notebook|session|chat)\s+(?:to\s+)?|name\s+(?:this\s+)?(?:notebook|session|chat)\s+)(.+)$/i
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

  // 2. New Tab / Concept Tab checks (supports start, middle, or end of sentence)
  const isNewTabIntent = /\b(?:new\s+(?:concept\s+)?tab|open\s+(?:in\s+)?(?:a\s+)?new\s+tab|another\s+tab)\b/i.test(cleaned);

  if (isNewTabIntent) {
    let extractedTopic = '';

    // If "in a new tab" appears anywhere in the sentence
    if (/(?:in\s+)?(?:a\s+)?new\s+(?:concept\s+)?tab/i.test(cleaned)) {
      // Split on the tab trigger phrase
      const parts = cleaned.split(/(?:in\s+)?(?:a\s+)?new\s+(?:concept\s+)?tab/i);
      // Combine whatever was before and after the tab phrase
      const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
      extractedTopic = cleanConceptTerm(combined);
    } else {
      // Otherwise it's leading like "new tab for X" or "open a new tab and explain X"
      const match = cleaned.match(/(?:new\s+(?:concept\s+)?tab|open\s+(?:in\s+)?(?:a\s+)?new\s+tab)(?:\s+(?:and\s+explain|for|about|on))?\s+(.+)$/i);
      if (match && match[1]) {
        extractedTopic = cleanConceptTerm(match[1]);
      }
    }

    if (extractedTopic && extractedTopic.length > 1 && !/^(?:and|or|for|to|tab)$/i.test(extractedTopic)) {
      return {
        type: 'new_concept_tab',
        term: extractedTopic,
        contextSnippet: `Opened via voice command: "${trimmed}".`,
      };
    }
  }

  // Fallback: regular dictation
  return {
    type: 'dictate',
    text: trimmed,
  };
}
