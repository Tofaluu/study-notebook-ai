import React, { useEffect, useState } from 'react';
import { useExplainSelectedPassage } from '@workspace/api-client-react';
import { SelectableAnswer } from '@/components/SelectableAnswer';

export default function FollowUpPage() {
  const explain = useExplainSelectedPassage();
  const [explanation, setExplanation] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      const data = localStorage.getItem(`study-follow-up:${id}`);
      if (data) {
        const parsed = JSON.parse(data);
        explain.mutate({
          data: {
            selectedText: parsed.selectedText,
            question: parsed.question,
            answerContext: parsed.answerContext,
            sources: []
          }
        }, {
          onSuccess: setExplanation
        });
      }
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-8 bg-background min-h-[100dvh]">
      <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl mb-8 flex flex-col gap-2">
        <strong className="font-semibold">Legacy Page Access</strong>
        <p className="text-sm">This is a legacy page. New follow-up questions now open seamlessly inside your main workspace tabs. You may close this browser tab and return to the application.</p>
      </div>
      {explanation ? (
        <div className="bg-card border border-border/60 rounded-3xl p-6 md:p-10 shadow-sm">
          <h2 className="text-3xl font-serif font-bold text-foreground mb-6 pb-4 border-b border-border/50">{explanation.title}</h2>
          <SelectableAnswer 
            title={explanation.title} 
            content={explanation.answerMarkdown} 
            onTermClick={() => {}} 
          />
        </div>
      ) : (
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-6 py-1">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="h-4 bg-muted rounded col-span-2"></div>
                <div className="h-4 bg-muted rounded col-span-1"></div>
              </div>
              <div className="h-4 bg-muted rounded w-full"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
