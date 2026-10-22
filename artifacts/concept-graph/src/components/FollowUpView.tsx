import React, { useEffect, useRef } from 'react';
import { useExplainSelectedPassage, LectureSource, type StudyModel } from '@workspace/api-client-react';
import { FollowUpTab } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SourcesCited } from './SourcesCited';
import { Reveal } from './Reveal';

interface FollowUpViewProps {
  tab: FollowUpTab;
  sources: LectureSource[];
  model: StudyModel;
  onUpdateTab: (updates: Partial<FollowUpTab>) => void;
  onTermClick: (term: string, contextSnippet: string) => void;
  onFollowUp: (selectedText: string, question: string, answerContext: string) => void;
}

export const FollowUpView = React.memo(function FollowUpView({ tab, sources, model, onUpdateTab, onTermClick, onFollowUp }: FollowUpViewProps) {
  const explainMutation = useExplainSelectedPassage();
  const initRef = useRef(false);


  const requestExplanation = () => {
    explainMutation.mutate({
      data: {
        selectedText: tab.selectedText,
        question: tab.question,
        answerContext: tab.answerContext,
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
      requestExplanation();
    }
  }, [tab, sources, explainMutation, onUpdateTab]);

  if (tab.explanation) {
    return (
      <div id={`scroll-${tab.id}`} className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 bg-background">
        <div className="max-w-[46rem] mx-auto space-y-6 pb-20">
          <Reveal as="article" once={tab.id} className="rounded-2xl border border-border/60 bg-card px-5 py-6 shadow-sm md:px-12 md:py-10">
            <h2 className="mb-6 border-b border-border/50 pb-4 font-serif text-3xl font-semibold tracking-[-0.01em] text-foreground md:text-4xl">{tab.explanation.title}</h2>

            <figure className="mb-8 rounded-xl bg-muted/50 px-5 py-4">
              <figcaption className="mb-1.5 text-sm font-semibold text-muted-foreground">Selected Passage</figcaption>
              <blockquote className="mb-3 line-clamp-3 font-serif text-base italic leading-relaxed text-foreground/80">“{tab.selectedText}”</blockquote>
              <p className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Q: {tab.question}</p>
            </figure>

            <SelectableAnswer
              title={tab.explanation.title}
              content={tab.explanation.answerMarkdown}
              terms={tab.explanation.terms}
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
        <h2 className="mb-2 font-serif text-2xl font-semibold text-foreground">This follow-up didn’t load</h2>
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
      <h2 className="mb-2 font-serif text-2xl font-semibold text-foreground">Answering your follow-up</h2>
      <p className="max-w-sm text-muted-foreground">“{tab.question}”</p>
    </div>
  );
}, (prev, next) => prev.tab === next.tab && prev.sources === next.sources && prev.model === next.model);


