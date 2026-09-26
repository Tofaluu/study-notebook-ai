import React, { useEffect, useRef, useState } from 'react';
import type { ExplainableTerm } from '@workspace/api-client-react';
import { MessageSquareText, Send, X } from 'lucide-react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface SelectableAnswerProps {
  title: string;
  content: string;
  terms?: ExplainableTerm[];
  prerequisiteTerms?: string[];
  onTermClick: (term: string, contextSnippet: string) => void;
  onFollowUp?: (selectedText: string, question: string, answerContext: string) => void;
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

export function SelectableAnswer({ title, content, terms = [], prerequisiteTerms = [], onTermClick, onFollowUp }: SelectableAnswerProps) {
  const answerRef = useRef<HTMLDivElement>(null);
  const selectedRangeRef = useRef<Range | null>(null);
  const selectedTextRef = useRef('');
  const wasTrimmedRef = useRef(false);
  const [selectedText, setSelectedText] = useState('');
  const [question, setQuestion] = useState('');
  const [position, setPosition] = useState<SelectionPosition | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [wasTrimmed, setWasTrimmed] = useState(false);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      const selection = window.getSelection();
      const container = answerRef.current;
      if (!selection || selection.isCollapsed || !container || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;

      const rawText = extractReadableSelection(range, selection.toString());
      if (rawText.length < 2) return;

      selectedRangeRef.current = range.cloneRange();
      selectedTextRef.current = rawText.slice(0, 3000);
      wasTrimmedRef.current = rawText.length > 3000;
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchend', handleGlobalMouseUp);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePrompt();
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchend', handleGlobalMouseUp);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const closePrompt = () => {
    setSelectedText('');
    setQuestion('');
    setPosition(null);
    setWasTrimmed(false);
    selectedRangeRef.current = null;
    selectedTextRef.current = '';
    wasTrimmedRef.current = false;
    window.getSelection()?.removeAllRanges();
  };

  

  const handleModalDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.closest('textarea') || target.closest('button')) return;
    if (!position || !modalRef.current) return;

    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    
    // Read exact pixels to avoid string parsing issues, or just use offsetLeft/Top
    const startLeft = position.left;
    const startTop = position.top;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!modalRef.current) return;
      modalRef.current.style.left = `${startLeft + (moveEvent.clientX - startX)}px`;
      modalRef.current.style.top = `${startTop + (moveEvent.clientY - startY)}px`;
    };

    const onMouseUp = (moveEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      
      if (modalRef.current) {
        setPosition({
          left: parseFloat(modalRef.current.style.left),
          top: parseFloat(modalRef.current.style.top)
        });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const showPromptForSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const range = selectedRangeRef.current;
    if (!range || !selectedTextRef.current) return;

    const clickedSelection = Array.from(range.getClientRects()).some((rect) => (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ));
    if (!clickedSelection) return;

    event.preventDefault();
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

    setSelectedText(selectedTextRef.current);
    setWasTrimmed(wasTrimmedRef.current);
    setQuestion('');
    setPosition({ left, top });
  };

  const submitFollowUp = () => {
    if (!selectedText || !question.trim()) return;

    if (onFollowUp) {
      onFollowUp(selectedText, question.trim(), `${title}\n\n${content}`.slice(0, 20000));
    } else {
      // Backwards compatible fallback
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
    }
    closePrompt();
  };

  return (
    <>
      <div
        ref={answerRef}
        className="cursor-text select-text"
        onMouseDown={showPromptForSelection}
        
      >
        <MarkdownRenderer content={content} terms={terms} prerequisiteTerms={prerequisiteTerms} onTermClick={onTermClick} />
      </div>

      {position && (
        <div
          ref={modalRef}
          role="dialog"
          aria-label="Ask about selected text"
          className="fixed z-50 w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 cursor-move select-none"
          style={{ left: position.left, top: position.top }}
          onMouseDown={handleModalDragStart}
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
                  submitFollowUp();
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
              onClick={submitFollowUp}
              aria-label="Open follow-up explanation"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Press Enter to investigate further.</p>
        </div>
      )}
    </>
  );
}









