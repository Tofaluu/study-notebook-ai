import React, { useEffect, useState } from 'react';
import { useExplainTechnicalConcept, TechnicalConceptExplanation } from '@workspace/api-client-react';
import { loadSession } from '@/lib/db';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loader2, ArrowLeft, BookOpen, FileText } from 'lucide-react';

export default function ConceptPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const term = searchParams.get('term') || '';
  const context = searchParams.get('context') || '';
  
  const [explanation, setExplanation] = useState<TechnicalConceptExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const explainMutation = useExplainTechnicalConcept();

  useEffect(() => {
    async function init() {
      const db = await loadSession();
      explainMutation.mutate(
        { data: { term, context, sources: db.sources } },
        {
          onSuccess: (data) => setExplanation(data),
          onError: () => setError('Failed to explain concept.')
        }
      );
    }
    if (term) init();
  }, [term, context]);

  const handlePrereqClick = (prereqTerm: string) => {
    const params = new URLSearchParams({ term: prereqTerm, context: `Prerequisite for ${term}` });
    window.open(`${import.meta.env.BASE_URL}concept?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  if (!term) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground font-medium text-lg">No concept specified. Please close this tab and select a term from your study notebook.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background font-sans">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-0.5">Concept Deep Dive</p>
              <h1 className="font-serif text-2xl font-bold text-foreground leading-tight truncate">{term}</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 pb-32">
        {error ? (
          <div className="bg-destructive/10 text-destructive p-6 rounded-2xl border border-destructive/20 font-medium text-center">
            {error}
          </div>
        ) : explainMutation.isPending || !explanation ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground animate-in fade-in duration-500">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-6" />
            <p className="text-xl font-medium tracking-tight">Synthesizing deep dive for <span className="text-foreground font-bold">{term}</span>...</p>
            <p className="text-sm mt-3 opacity-70">Consulting your study materials and generating context.</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h2 className="text-4xl font-serif font-bold text-foreground mb-8 pb-4 border-b border-border/50 tracking-tight">{explanation.title}</h2>
            
            <MarkdownRenderer 
              content={explanation.answerMarkdown} 
              prerequisiteTerms={explanation.prerequisiteTerms}
              onTermClick={handlePrereqClick}
            />

            {explanation.prerequisiteTerms && explanation.prerequisiteTerms.length > 0 && (
              <div className="mt-12 p-6 bg-muted/30 border border-primary/20 rounded-2xl">
                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4 text-primary" /> Prerequisite Concepts
                </h4>
                <div className="flex flex-wrap gap-2">
                  {explanation.prerequisiteTerms.map((prereq, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePrereqClick(prereq)}
                      className="bg-card border border-border px-4 py-2.5 rounded-lg text-sm font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all shadow-sm active:scale-95"
                    >
                      {prereq}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {explanation.sourceRefs && explanation.sourceRefs.length > 0 && (
              <div className="mt-12 pt-8 border-t border-border/50">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-5 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Supporting Sources
                </h4>
                <div className="grid gap-4">
                  {explanation.sourceRefs.map((ref, idx) => (
                    <div key={idx} className="bg-card border border-border/60 p-5 rounded-xl flex flex-col gap-2 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{ref.sourceName}</span>
                        <span className="px-2 py-0.5 bg-muted rounded text-xs font-medium text-muted-foreground">Page {ref.pageNumber}</span>
                      </div>
                      <p className="text-[0.95rem] text-muted-foreground italic leading-relaxed border-l-2 border-primary/40 pl-4 py-1">
                        "{ref.excerpt}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}