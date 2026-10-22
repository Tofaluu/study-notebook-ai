import React, { useEffect, useRef } from 'react';
import { useExplainTechnicalConcept, LectureSource, type StudyModel } from '@workspace/api-client-react';
import { ConceptTab } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { getDemoConcept } from '@/lib/demo';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SourcesCited } from './SourcesCited';
import { Reveal } from './Reveal';

interface ConceptViewProps {
  tab: ConceptTab;
  sources: LectureSource[];
  model: StudyModel;
  onUpdateTab: (updates: Partial<ConceptTab>) => void;
  onTermClick: (term: string, contextSnippet: string) => void;
  onFollowUp: (selectedText: string, question: string, answerContext: string) => void;
}

export const ConceptView = React.memo(function ConceptView({ tab, sources, model, onUpdateTab, onTermClick, onFollowUp }: ConceptViewProps) {
  const explainMutation = useExplainTechnicalConcept();
  const initRef = useRef(false);

  const requestExplanation = () => {
    explainMutation.mutate({
      data: {
        term: tab.term,
        context: tab.contextSnippet,
        model,
        sources
      }
    }, {
      onSuccess: (data) => {
        onUpdateTab({ explanation: data });
      }
    });
  };

  useEffect(() => {
    if (!tab.explanation && !explainMutation.isPending && !initRef.current) {
      initRef.current = true;
      const demoExplanation = getDemoConcept(sources, tab.term);
      if (demoExplanation) {
        onUpdateTab({ explanation: demoExplanation });
        return;
      }
      requestExplanation();
    }
  }, [tab, sources, explainMutation, onUpdateTab]);

  if (tab.explanation) {
    return (
      <div id={`scroll-${tab.id}`} className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 bg-background">
        <div className="max-w-[46rem] mx-auto space-y-6 pb-20">
          <Reveal as="article" once={tab.id} className="rounded-2xl border border-border/60 bg-card px-5 py-6 shadow-sm md:px-12 md:py-10">
            <h2 className="mb-6 border-b border-border/50 pb-4 font-serif text-3xl font-semibold tracking-[-0.01em] text-foreground md:text-4xl">{tab.explanation.title}</h2>
            <SelectableAnswer
              title={tab.explanation.title}
              content={tab.explanation.answerMarkdown}
              prerequisiteTerms={tab.explanation.prerequisiteTerms}
              onTermClick={onTermClick}
              onFollowUp={onFollowUp}
            />
            <SourcesCited refs={tab.explanation.sourceRefs} />
          </Reveal>
        </div>
      </div>
    );
  }

  if (explainMutation.isError) {
    return (
      <div role="alert" className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
        <h2 className="mb-2 font-serif text-2xl font-semibold text-foreground">“{tab.term}” didn’t load</h2>
        <p className="mb-6 max-w-sm text-muted-foreground">
          {explainMutation.error instanceof Error && explainMutation.error.message
            ? explainMutation.error.message
            : 'The server didn’t respond. Check your connection and try again.'}
        </p>
        <Button variant="outline" onClick={requestExplanation}>Try again</Button>
      </div>
    );
  }

  return (
    <div role="status" className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
      <Loader2 className="mb-5 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <h2 className="mb-2 font-serif text-2xl font-semibold text-foreground">Explaining “{tab.term}”</h2>
      <p className="text-muted-foreground">Writing a beginner-friendly page from your materials…</p>
    </div>
  );
}, (prev, next) => prev.tab === next.tab && prev.sources === next.sources && prev.model === next.model);


