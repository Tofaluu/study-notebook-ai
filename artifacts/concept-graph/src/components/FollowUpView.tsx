import React, { useEffect, useRef } from 'react';
import { useExplainSelectedPassage, LectureSource, type StudyModel } from '@workspace/api-client-react';
import { FollowUpTab } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { Loader2, AlertCircle, Quote } from 'lucide-react';

interface FollowUpViewProps {
  tab: FollowUpTab;
  sources: LectureSource[];
  model: StudyModel;
  onUpdateTab: (updates: Partial<FollowUpTab>) => void;
  onTermClick: (term: string, contextSnippet: string) => void;
  onFollowUp: (selectedText: string, question: string, answerContext: string) => void;
}

export function FollowUpView({ tab, sources, model, onUpdateTab, onTermClick, onFollowUp }: FollowUpViewProps) {
  const explainMutation = useExplainSelectedPassage();
  const initRef = useRef(false);

  useEffect(() => {
    if (!tab.explanation && !explainMutation.isPending && !initRef.current) {
      initRef.current = true;
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
    }
  }, [tab, sources, explainMutation, onUpdateTab]);

  if (tab.explanation) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 bg-background">
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          <div className="bg-card border border-border/60 rounded-3xl p-6 md:p-10 shadow-sm animate-in fade-in zoom-in-95 duration-500">
            <h2 className="text-3xl font-serif font-bold text-foreground mb-6 pb-4 border-b border-border/50">{tab.explanation.title}</h2>
            
            <div className="bg-muted/40 border-l-4 border-primary/40 p-4 rounded-r-xl mb-8">
              <div className="flex items-center gap-2 mb-2 text-primary font-medium text-sm">
                <Quote className="w-4 h-4" /> Selected Passage
              </div>
              <p className="text-sm italic text-muted-foreground mb-4 line-clamp-3">{tab.selectedText}</p>
              <div className="text-sm font-semibold text-foreground border-t border-border/50 pt-3">
                Q: {tab.question}
              </div>
            </div>

            <SelectableAnswer
              title={tab.explanation.title}
              content={tab.explanation.answerMarkdown}
              terms={tab.explanation.terms}
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
        <h3 className="text-xl font-serif font-bold text-foreground mb-2">Investigation Failed</h3>
        <p className="text-muted-foreground max-w-sm mb-6">We couldn't process this follow-up question. Please try asking in the main chat.</p>
        <button onClick={() => onUpdateTab({ title: 'Error' })} className="text-primary hover:underline text-sm font-medium">
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 animate-in fade-in duration-700">
      <Loader2 className="w-10 h-10 animate-spin text-primary mb-6" />
      <h3 className="text-xl font-serif font-bold text-foreground mb-2">Investigating Passage</h3>
      <p className="text-muted-foreground max-w-sm text-center">Looking into your question about the selected text...</p>
    </div>
  );
}
