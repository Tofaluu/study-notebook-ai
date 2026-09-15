import React, { useRef, useLayoutEffect } from 'react';
import { useExplainStudyTopic } from '@workspace/api-client-react';
import { Chat, HistoryItem } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { BookOpen, Loader2, Send, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const chatScrollPositions = new Map<string, number>();

interface ChatViewProps {
  chat: Chat;
  onAddHistory: (items: HistoryItem[]) => void;
  onRename: (title: string) => void;
  onTermClick: (term: string, contextSnippet: string) => void;
  onFollowUp: (selectedText: string, question: string, answerContext: string) => void;
}

export function ChatView({ chat, onAddHistory, onRename, onTermClick, onFollowUp }: ChatViewProps) {
  const [prompt, setPrompt] = React.useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const explainMutation = useExplainStudyTopic();

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const savedScrollTop = chatScrollPositions.get(chat.id);
    if (savedScrollTop !== undefined) {
      scrollContainer.scrollTop = savedScrollTop;
    }
  }, [chat.id]);

  const handleSubmit = () => {
    const isDefaultPrompt = !prompt.trim() && chat.sources.length > 0;
    if (!prompt.trim() && chat.sources.length === 0) return;

    const actualPrompt = isDefaultPrompt ? "Explain the key concepts of the uploaded lectures." : prompt.trim();
    
    const userMessage: HistoryItem = {
      id: crypto.randomUUID(),
      type: 'user',
      content: actualPrompt,
      timestamp: Date.now()
    };

    onAddHistory([userMessage]);
    if (chat.history.length === 0 && chat.title === 'New Session') {
      onRename(actualPrompt.length > 42 ? `${actualPrompt.slice(0, 42)}…` : actualPrompt);
    }
    setPrompt('');

    explainMutation.mutate({ data: { prompt: actualPrompt, sources: chat.sources } }, {
      onSuccess: (data) => {
        const aiMessage: HistoryItem = {
          id: crypto.randomUUID(),
          type: 'ai',
          content: data.title,
          explanation: data,
          timestamp: Date.now()
        };
        onAddHistory([aiMessage]);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
      <div
        ref={scrollContainerRef}
        onScroll={(event) => {
          chatScrollPositions.set(chat.id, event.currentTarget.scrollTop);
        }}
        className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 scroll-smooth"
      >
        <div className="max-w-3xl mx-auto space-y-10 pb-32">
          {chat.history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center opacity-80 animate-in fade-in zoom-in duration-700">
              <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mb-6 shadow-inner rotate-3">
                <BookOpen className="w-10 h-10 text-primary/80 -rotate-3" />
              </div>
              <h2 className="text-3xl font-serif font-bold text-foreground mb-3 tracking-tight">{chat.title === 'New Session' ? 'Begin your session.' : chat.title}</h2>
              <p className="text-muted-foreground max-w-md text-lg">Upload your reading materials and ask a question, or let the AI summarize the core concepts to get started.</p>
            </div>
          ) : (
            chat.history.map((item) => (
              <div key={item.id} className={`flex w-full animate-in fade-in slide-in-from-bottom-4 duration-500 ${item.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {item.type === 'user' ? (
                  <div className="bg-primary text-primary-foreground px-6 py-4 rounded-2xl rounded-br-sm max-w-[85%] md:max-w-[75%] shadow-md">
                    <p className="font-medium text-[1.05rem] leading-relaxed">{item.content}</p>
                  </div>
                ) : (
                  <div className="w-full">
                    {item.explanation && (
                      <div className="bg-card border border-border/60 rounded-3xl p-6 md:p-10 shadow-sm">
                        <h2 className="text-3xl font-serif font-bold text-foreground mb-6 pb-4 border-b border-border/50">{item.explanation.title}</h2>
                        <SelectableAnswer
                          title={item.explanation.title}
                          content={item.explanation.answerMarkdown}
                          terms={item.explanation.terms}
                          onTermClick={onTermClick}
                          onFollowUp={onFollowUp}
                        />
                        
                        {item.explanation.sourceRefs && item.explanation.sourceRefs.length > 0 && (
                          <div className="mt-10 pt-6 border-t border-border/50">
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5" /> Sources Cited
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {item.explanation.sourceRefs.map((ref, i) => (
                                <div key={i} className="bg-muted/40 border border-border/50 px-4 py-3 rounded-xl text-sm flex flex-col gap-1.5 hover:bg-muted/60 transition-colors">
                                  <span className="font-semibold text-foreground line-clamp-1" title={ref.sourceName}>{ref.sourceName} <span className="text-muted-foreground font-normal ml-1">p.{ref.pageNumber}</span></span>
                                  <span className="text-muted-foreground italic line-clamp-2 leading-relaxed">"{ref.excerpt}"</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          
          {explainMutation.isPending && (
            <div className="flex w-full justify-start animate-in fade-in duration-300">
              <div className="bg-muted px-6 py-5 rounded-3xl rounded-bl-sm flex items-center gap-4 text-muted-foreground font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                Synthesizing knowledge...
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/90 to-transparent pt-10">
        <div className="max-w-3xl mx-auto relative flex items-end gap-3 bg-card border border-border/80 p-2 rounded-2xl shadow-lg focus-within:ring-2 focus-within:ring-primary/30 transition-all">
          <Textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={chat.sources.length > 0 ? "Ask a question about your materials..." : "Ask a general question..."}
            className="min-h-[52px] max-h-48 resize-none border-0 focus-visible:ring-0 bg-transparent text-[1.05rem] py-3.5 px-4 shadow-none font-medium scrollbar-thin"
            rows={1}
          />
          <Button 
            size="icon"
            className="h-[52px] w-[52px] rounded-xl shrink-0 shadow-md transition-all active:scale-95"
            disabled={(!prompt.trim() && chat.sources.length === 0) || explainMutation.isPending}
            onClick={handleSubmit}
          >
            {explainMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
          </Button>
        </div>
        <div className="max-w-3xl mx-auto mt-2 text-center hidden md:block">
          <p className="text-xs font-medium text-muted-foreground">Select text to copy it; click the selected passage to ask a focused follow-up.</p>
        </div>
      </div>
    </div>
  );
}
