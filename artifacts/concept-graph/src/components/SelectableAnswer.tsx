import React, { useEffect, useRef, useState } from 'react';
import type { ExplainableTerm } from '@workspace/api-client-react';
import { MessageSquareText, Send, X } from 'lucide-react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface SelectableAnswerProps {
  title: string;
  content: string;
  terms: ExplainableTerm[];
  onTermClick: (term: string, contextSnippet: string) => void;
}

interface SelectionPosition {
  left: number;
  top: number;
}

function extractReadableSelection(range: Range, fallback: string) {
  const fragment = range.cloneContents();
  const renderedMath = fragment.querySelectorAll('.katex');

  if (renderedMath.length === 0) return fallback.trim();

  renderedMath.forEach((element) => {
    const accessibleMath = element.querySelector('.katex-mathml')?.textContent?.trim();
    const readableMath = accessibleMath || element.textContent?.trim() || '';
    element.replaceWith(document.createTextNode(` ${readableMath} `));
  });

  return (fragment.textContent ?? fallback)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function SelectableAnswer({ title, content, terms, onTermClick }: SelectableAnswerProps) {
  const answerRef = useRef<HTMLDivElement>(null);
  const selectedRangeRef = useRef<Range | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const [selectedText, setSelectedText] = useState('');
  const [question, setQuestion] = useState('');
  const [position, setPosition] = useState<SelectionPosition | null>(null);
  const [wasTrimmed, setWasTrimmed] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePrompt();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const closePrompt = () => {
    setSelectedText('');
    setQuestion('');
    setPosition(null);
    setWasTrimmed(false);
    selectedRangeRef.current = null;
    window.getSelection()?.removeAllRanges();
  };

  const captureSelection = (event: React.SyntheticEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;

    const selection = window.getSelection();
    const container = answerRef.current;
    if (!selection || selection.isCollapsed || !container || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const rawText = extractReadableSelection(range, selection.toString());
    if (rawText.length < 2) return;

    selectedRangeRef.current = range.cloneRange();
    setSelectedText(rawText.slice(0, 3000));
    setWasTrimmed(rawText.length > 3000);
    setQuestion('');
    setPosition(null);
  };

  const showPromptForSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }

    const range = selectedRangeRef.current;
    if (!range || !selectedText) return;

    const clickedSelection = Array.from(range.getClientRects()).some((rect) => (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ));
    if (!clickedSelection) return;

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const rect = range.getBoundingClientRect();
    const cardWidth = Math.min(384, window.innerWidth - 24);
    const estimatedHeight = 250;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, cardWidth / 2 + 12),
      window.innerWidth - cardWidth / 2 - 12
    );
    const top = rect.bottom + estimatedHeight + 16 > window.innerHeight
      ? Math.max(12, rect.top - estimatedHeight - 10)
      : rect.bottom + 10;

    setPosition({ left, top });
  };

  const openFollowUp = () => {
    if (!selectedText || !question.trim()) return;

    const id = crypto.randomUUID();
    localStorage.setItem(`study-follow-up:${id}`, JSON.stringify({
      selectedText,
      question: question.trim(),
      answerContext: `${title}\n\n${content}`.slice(0, 20000),
      createdAt: Date.now()
    }));

    window.open(
      `${import.meta.env.BASE_URL}follow-up?id=${encodeURIComponent(id)}`,
      '_blank',
      'noopener,noreferrer'
    );
    closePrompt();
  };

  return (
    <>
      <div
        ref={answerRef}
        className="cursor-text select-text"
        onMouseDown={(event) => {
          pointerStartRef.current = { x: event.clientX, y: event.clientY };
          didDragRef.current = false;
        }}
        onMouseMove={(event) => {
          if (!pointerStartRef.current || event.buttons !== 1) return;
          const distance = Math.hypot(
            event.clientX - pointerStartRef.current.x,
            event.clientY - pointerStartRef.current.y
          );
          if (distance > 4) didDragRef.current = true;
        }}
        onMouseUp={captureSelection}
        onTouchEnd={(event) => window.setTimeout(() => captureSelection(event), 50)}
        onClick={showPromptForSelection}
      >
        <MarkdownRenderer content={content} terms={terms} onTermClick={onTermClick} />
      </div>

      {position && (
        <div
          role="dialog"
          aria-label="Ask about selected text"
          className="fixed z-50 w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          style={{ left: position.left, top: position.top }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Ask about this
            </div>
            <button
              type="button"
              onClick={closePrompt}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close follow-up prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <blockquote className="mb-2 line-clamp-3 border-l-2 border-primary/40 pl-3 text-xs italic leading-relaxed text-muted-foreground">
            {selectedText}
          </blockquote>
          {wasTrimmed && (
            <p className="mb-2 text-[11px] text-muted-foreground">Only the first 3,000 characters will be included.</p>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              autoFocus
              value={question}
              onChange={(event) => setQuestion(event.target.value.slice(0, 1000))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  openFollowUp();
                }
              }}
              placeholder="Can you elaborate further?"
              rows={2}
              className="min-h-[68px] resize-none text-sm"
            />
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              disabled={!question.trim()}
              onClick={openFollowUp}
              aria-label="Open follow-up explanation"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Press Enter to open the answer in a new tab.</p>
        </div>
      )}
    </>
  );
}