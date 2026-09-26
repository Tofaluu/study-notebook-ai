import React, { useEffect, useRef } from 'react';
import { useExplainTechnicalConcept, LectureSource, type StudyModel } from '@workspace/api-client-react';
import { ConceptTab } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { Loader2, AlertCircle } from 'lucide-react';

interface ConceptViewProps {
  tab: ConceptTab;
  sources: LectureSource[];
  model: StudyModel;
  onUpdateTab: (updates: Partial<ConceptTab>) => void;
  onTermClick: (term: string, contextSnippet: string) => void;
  onFollowUp: (selectedText: string, question: string, answerContext: string) => void;
}

export function ConceptView({ tab, sources, model, onUpdateTab, onTermClick, onFollowUp }: ConceptViewProps) {
  const explainMutation = useExplainTechnicalConcept();
  const initRef = useRef(false);

  useEffect(() => {
    if (!tab.explanation && !explainMutation.isPending && !initRef.current) {
      initRef.current = true;
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
    }
  }, [tab, sources, explainMutation, onUpdateTab]);

  if (tab.explanation) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 bg-background">
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          <div className="bg-card border border-border/60 rounded-3xl p-6 md:p-10 shadow-sm ">
            <h2 className="text-3xl font-serif font-bold text-foreground mb-6 pb-4 border-b border-border/50">{tab.explanation.title}</h2>
            <SelectableAnswer
              title={tab.explanation.title}
              content={tab.explanation.answerMarkdown}
              prerequisiteTerms={tab.explanation.prerequisiteTerms}
              onTermClick={onTermClick}
              onFollowUp={onFollowUp}
            />
            {tab.explanation.sourceRefs && tab.explanation.sourceRefs.length > 0 && (
              <div className="mt-10 pt-6 border-t border-border/50">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
                  Sources Cited
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tab.explanation.sourceRefs.map((ref, i) => (
                    <div key={i} className="bg-muted/40 border border-border/50 px-4 py-3 rounded-xl text-sm flex flex-col gap-1.5">
                      <span className="font-semibold text-foreground line-clamp-1">{ref.sourceName} <span className="text-muted-foreground font-normal ml-1">p.{ref.pageNumber}</span></span>
                      <span className="text-muted-foreground italic line-clamp-2">"{ref.excerpt}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (explainMutation.isError) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-xl font-serif font-bold text-foreground mb-2">Analysis Failed</h3>
        <p className="text-muted-foreground max-w-sm mb-6">We couldn't unpack this concept. Please try asking in the main chat.</p>
        <button onClick={() => onUpdateTab({ title: 'Error' })} className="text-primary hover:underline text-sm font-medium">
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 animate-in fade-in duration-700">
      <Loader2 className="w-10 h-10 animate-spin text-primary mb-6" />
      <h3 className="text-xl font-serif font-bold text-foreground mb-2">Analyzing Concept</h3>
      <p className="text-muted-foreground">"{tab.term}"</p>
    </div>
  );
}
