import React, { useEffect, useState } from 'react';
import {
  SelectedPassageExplanation,
  useExplainSelectedPassage
} from '@workspace/api-client-react';
import { BookOpen, FileText, Loader2, MessageSquareQuote } from 'lucide-react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { loadSession } from '@/lib/db';

interface FollowUpPayload {
  selectedText: string;
  question: string;
  answerContext: string;
  createdAt: number;
}

function readPayload(id: string): FollowUpPayload | null {
  try {
    const raw = localStorage.getItem(`study-follow-up:${id}`);
    if (!raw) return null;
    const payload = JSON.parse(raw) as FollowUpPayload;
    if (!payload.selectedText || !payload.question) return null;
    return payload;
  } catch {
    return null;
  }
}

export default function FollowUpPage() {
  const id = new URLSearchParams(window.location.search).get('id') ?? '';
  const [payload] = useState(() => readPayload(id));
  const [explanation, setExplanation] = useState<SelectedPassageExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const explainMutation = useExplainSelectedPassage();

  useEffect(() => {
    if (!payload) return;

    loadSession().then((session) => {
      explainMutation.mutate(
        {
          data: {
            selectedText: payload.selectedText,
            question: payload.question,
            answerContext: payload.answerContext,
            sources: session.sources
          }
        },
        {
          onSuccess: setExplanation,
          onError: () => setError('Gemini could not answer this follow-up. Please close this tab and try again.')
        }
      );
    });
  }, [payload]);

  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
        <p className="max-w-lg text-lg font-medium text-muted-foreground">
          This follow-up is no longer available. Return to Study Notebook and select the passage again.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background font-sans">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Passage Follow-up</p>
              <h1 className="truncate font-serif text-xl font-bold leading-tight text-foreground">{payload.question}</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 pb-32">
        <section className="mb-10 rounded-2xl border border-primary/20 bg-muted/30 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <MessageSquareQuote className="h-4 w-4 text-primary" />
            Selected passage
          </div>
          <blockquote className="border-l-2 border-primary/50 pl-4 text-base italic leading-relaxed text-foreground/80">
            {payload.selectedText}
          </blockquote>
          <p className="mt-4 font-semibold text-foreground">{payload.question}</p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-center font-medium text-destructive">
            {error}
          </div>
        ) : explainMutation.isPending || !explanation ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mb-5 h-10 w-10 animate-spin text-primary" />
            <p className="text-xl font-medium text-foreground">Explaining your selection...</p>
            <p className="mt-2 text-sm">Consulting the original answer and your study materials.</p>
          </div>
        ) : (
          <article className="animate-in fade-in slide-in-from-bottom-6 duration-500">
            <h2 className="mb-8 border-b border-border/50 pb-4 font-serif text-4xl font-bold tracking-tight text-foreground">
              {explanation.title}
            </h2>
            <MarkdownRenderer content={explanation.answerMarkdown} />

            {explanation.sourceRefs.length > 0 && (
              <div className="mt-12 border-t border-border/50 pt-8">
                <h3 className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <FileText className="h-4 w-4" /> Supporting Sources
                </h3>
                <div className="grid gap-4">
                  {explanation.sourceRefs.map((ref, index) => (
                    <div key={`${ref.sourceId}-${ref.pageNumber}-${index}`} className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{ref.sourceName}</span>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Page {ref.pageNumber}</span>
                      </div>
                      <p className="border-l-2 border-primary/40 py-1 pl-4 text-[0.95rem] italic leading-relaxed text-muted-foreground">
                        “{ref.excerpt}”
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        )}
      </main>
    </div>
  );
}