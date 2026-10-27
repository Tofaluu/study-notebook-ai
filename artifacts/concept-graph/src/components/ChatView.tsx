import React, { useRef, useLayoutEffect } from 'react';
import { useExplainStudyTopic, type StudyModel } from '@workspace/api-client-react';
import { Chat, HistoryItem } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { Loader2, Send, Square } from 'lucide-react';
import { DEMO_SOURCE_ID } from '@/lib/demo';
import { SourcesCited } from './SourcesCited';
import { Reveal } from './Reveal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatViewProps {
  chat: Chat;
  model: StudyModel;
  onAddHistory: (items: HistoryItem[]) => void;
  onRemoveHistory?: (itemId: string) => void;
  onRename: (title: string) => void;
  onTermClick: (term: string, contextSnippet: string) => void;
  onFollowUp: (selectedText: string, question: string, answerContext: string) => void;
  onAddSources: (sources: any[]) => void;
  onOpenDemo: () => void;
}

export const ChatView = React.memo(function ChatView({ chat, model, onAddHistory, onRemoveHistory, onRename, onTermClick, onFollowUp, onAddSources, onOpenDemo }: ChatViewProps) {
  const [prompt, setPrompt] = React.useState('');
  const [expandedMessages, setExpandedMessages] = React.useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const explainMutation = useExplainStudyTopic();
  const cancelTokenRef = useRef(0);
  const pendingUserMsgIdRef = useRef<string | null>(null);
  const pendingPromptTextRef = useRef<string>('');
  const isDemo = chat.sources.some(source => source.id === DEMO_SOURCE_ID);
  // Only messages that arrive while the chat is open animate in; reopening a chat shows its history as it was
  const openedAtRef = useRef(Date.now());
  const enters = (item: HistoryItem) => item.timestamp > openedAtRef.current;

  const handleCancel = () => {
    cancelTokenRef.current += 1;
    explainMutation.reset();

    if (pendingUserMsgIdRef.current && onRemoveHistory) {
      onRemoveHistory(pendingUserMsgIdRef.current);
      if (pendingPromptTextRef.current) {
        setPrompt(pendingPromptTextRef.current);
      }
    }
    pendingUserMsgIdRef.current = null;
    pendingPromptTextRef.current = '';
  };

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && explainMutation.isPending) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [explainMutation.isPending]);

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // The demo should open on its question, not scrolled past the answer
    scrollContainer.scrollTop = isDemo ? 0 : scrollContainer.scrollHeight;
  }, [chat.id]);

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    if (imageItems.length > 0) {
      e.preventDefault();
      const newSources = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
        
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        newSources.push({
          id: crypto.randomUUID(),
          name: file.name || `Pasted Image ${new Date().toLocaleTimeString()}`,
          type: 'image' as const,
          text: `[Pasted Image: ${file.name || 'image'}]`,
          base64Data: base64,
          mimeType: file.type,
          pageCount: 1,
          pages: [{ pageNumber: 1, text: `[Pasted Image: ${file.name || 'image'}]` }]
        });
      }
      onAddSources(newSources);
    }
  };

  const runExplain = (variables: Parameters<typeof explainMutation.mutate>[0]) => {
    const currentToken = cancelTokenRef.current;
    explainMutation.mutate(variables, {
      onSuccess: (data) => {
        if (currentToken !== cancelTokenRef.current) return;
        pendingUserMsgIdRef.current = null;
        pendingPromptTextRef.current = '';
        onAddHistory([{
          id: crypto.randomUUID(),
          type: 'ai',
          content: data.title,
          explanation: data,
          timestamp: Date.now()
        }]);
      }
    });
  };

  const handleSubmit = () => {
    if (explainMutation.isPending) return;
    const isDefaultPrompt = !prompt.trim() && chat.sources.length > 0;
    if (!prompt.trim() && chat.sources.length === 0) return;

    const actualPrompt = isDefaultPrompt ? "Explain the key concepts of the uploaded lectures." : prompt.trim();
    
    const userMessage: HistoryItem = {
      id: crypto.randomUUID(),
      type: 'user',
      content: actualPrompt,
      timestamp: Date.now()
    };

    pendingUserMsgIdRef.current = userMessage.id;
    pendingPromptTextRef.current = prompt.trim() || actualPrompt;

    onAddHistory([userMessage]);
    if (chat.history.length === 0 && chat.title === 'New Session') {
      const trimmed = actualPrompt.trim();
      const firstLine = trimmed.split('\n')[0];
      const title = firstLine.length > 50 ? `${firstLine.slice(0, 50).trim()}...` : firstLine;
      onRename(title || 'Untitled Session');
    }

    // Build chat context from the last 4 messages (2 turns)
    const recentHistory = chat.history.slice(-4);
    const historyContext = recentHistory
      .map(item => `${item.type === 'user' ? 'User' : 'AI'}: ${item.type === 'user' ? item.content : item.explanation?.answerMarkdown || ''}`)
      .join('\n\n');
      
    const fullPrompt = historyContext 
      ? `PREVIOUS CHAT HISTORY FOR CONTEXT:\n${historyContext}\n\nCURRENT QUESTION:\n${actualPrompt}`
      : actualPrompt;

    setPrompt('');
    runExplain({ data: { prompt: fullPrompt, model, sources: chat.sources } });

    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && explainMutation.isPending) {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      
      className="flex-1 min-w-0 min-h-0 overflow-y-auto scroll-smooth flex flex-col relative"
    >
      <div className="p-4 md:p-8 flex-1">
        <div className="max-w-[46rem] mx-auto space-y-10 pb-32">
          {chat.history.length === 0 ? (
            <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center">
              <Reveal once={`welcome:${chat.id}`}>
                <div className="space-y-2 mb-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Study Session Guide
                  </div>
                  <h2 className="font-serif text-3xl md:text-4xl font-semibold tracking-[-0.015em] text-foreground">
                    {chat.title === 'New Session' ? 'Begin your session.' : chat.title}
                  </h2>
                  <p className="text-base md:text-lg leading-relaxed text-muted-foreground">
                    Add lecture PDFs or images in the sidebar, then ask a question. Leave the box empty and press Send to get a summary of key concepts instead.
                  </p>
                </div>

                <div className="mb-8 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-card/60 p-4 transition-colors hover:border-border hover:bg-card">
                    <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary">
                      01
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">Click underlined terms</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Opens a dedicated page explaining the concept simply, with prerequisites it builds upon.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/60 p-4 transition-colors hover:border-border hover:bg-card">
                    <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary">
                      02
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">Highlight &amp; ask follow-up</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Select any text passage and click it to ask a targeted question about that specific section.
                    </p>
                  </div>
                </div>

                {onOpenDemo && (
                  <Button variant="outline" onClick={onOpenDemo} className="self-start gap-2 shadow-xs">
                    Explore the demo notebook
                  </Button>
                )}
              </Reveal>
            </div>
          ) : (
            <>
            {isDemo && (
              <div className="rounded-xl bg-accent/60 px-5 py-4 text-sm leading-relaxed text-foreground" data-testid="demo-banner">
                <p>
                  <span className="font-semibold">This is a demo notebook with pre-written answers.</span>{' '}
                  Click an underlined term to open its concept page, or highlight any text to ask a follow-up.{' '}
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'api' } }))}
                    className="font-semibold text-accent-foreground underline decoration-accent-foreground/40 underline-offset-4 hover:decoration-accent-foreground"
                  >
                    Add an API key
                  </button>{' '}
                  to ask your own questions.
                </p>
              </div>
            )}
            {chat.history.map((item) => (
              <div key={item.id} className={`flex w-full ${item.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {item.type === 'user' ? (() => {
                  const isLongMessage = item.content.length > 260 || item.content.split('\n').length > 4;
                  const isExpanded = expandedMessages.has(item.id);
                  return (
                    <Reveal
                      once={item.id}
                      play={enters(item)}
                      effect="animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out"
                      className="max-w-[85%] rounded-2xl rounded-br-sm border border-border/70 bg-muted px-5 py-3.5 text-foreground md:max-w-[75%]"
                    >
                      <p
                        className={`text-[1.0625rem] font-medium leading-relaxed break-words ${
                          !isExpanded && isLongMessage
                            ? 'line-clamp-4 whitespace-pre-line'
                            : 'whitespace-pre-wrap'
                        }`}
                      >
                        {item.content}
                      </p>
                      {isLongMessage && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMessages((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                          className="mt-2 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.97]"
                        >
                          {isExpanded ? 'Collapse message' : 'Show full message'}
                        </button>
                      )}
                    </Reveal>
                  );
                })() : (
                  <div className="w-full">
                    {item.explanation && (
                      item.explanation.title === 'Cancelled' ? (
                        <div className="rounded-xl border border-border/50 bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground italic">
                          Response was stopped.
                        </div>
                      ) : (
                        <article className="rounded-2xl border border-border/60 bg-card px-5 py-6 shadow-sm md:px-12 md:py-10">
                          {/* The card is there at once and its text comes in, once per page load. A new answer and the
                              demo, which opens at the top, write themselves in; a saved notebook opens at its latest
                              answer, so its text fades in instead. */}
                          <Reveal once={item.id} effect={enters(item) || isDemo ? undefined : 'animate-in fade-in duration-500 ease-out'}>
                          <SelectableAnswer
                            title={item.explanation.title}
                            header={
                              <h2 className="mb-6 border-b border-border/50 pb-4 font-serif text-3xl font-semibold tracking-[-0.01em] text-foreground md:text-4xl">
                                {item.explanation.title}
                              </h2>
                            }
                            content={item.explanation.answerMarkdown}
                            terms={item.explanation.terms}
                            onTermClick={onTermClick}
                            onFollowUp={onFollowUp}
                          />
                          <SourcesCited refs={item.explanation.sourceRefs} />
                          </Reveal>
                        </article>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
            </>
          )}

          {explainMutation.isPending && (
            <div className="flex w-full justify-start" role="status">
              <div className="flex items-center gap-3 rounded-2xl rounded-bl-sm bg-muted px-5 py-4 text-muted-foreground animate-in fade-in duration-300 ease-out">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                {chat.sources.length > 0
                  ? 'Reading your materials and writing an answer…'
                  : 'Writing an answer…'}
              </div>
            </div>
          )}

          {explainMutation.isError && (
            <div role="alert" className="rounded-xl border border-destructive/40 px-5 py-4 text-sm animate-in fade-in duration-200 ease-out">
              <p className="font-semibold text-foreground">The answer didn’t come through.</p>
              <p className="mt-1 text-muted-foreground">
                {explainMutation.error instanceof Error && explainMutation.error.message
                  ? explainMutation.error.message
                  : 'The server didn’t respond. Check your connection and try again.'}
              </p>
              <div className="mt-3 flex gap-2">
                {explainMutation.variables && (
                  <Button size="sm" variant="outline" onClick={() => runExplain(explainMutation.variables!)}>
                    Try again
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => explainMutation.reset()}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto w-full bg-background/95 backdrop-blur-xs px-4 pb-4 pt-3">
        <div className="relative mx-auto flex max-w-[46rem] items-end gap-3 rounded-2xl border border-border/80 bg-card p-2 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] transition-[border-color,box-shadow] duration-200 focus-within:border-foreground/30 focus-within:shadow-[0_12px_36px_rgb(0,0,0,0.1)] dark:focus-within:shadow-[0_12px_36px_rgb(0,0,0,0.4)]">
          <Textarea
            autoFocus
            aria-label={chat.sources.length > 0 ? 'Ask about your materials' : 'Ask a question'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown} onPaste={handlePaste}
            placeholder={chat.sources.length > 0 ? "Ask about your materials..." : "Ask a question..."}
            className="min-h-[52px] max-h-48 resize-none border-0 bg-transparent px-4 py-3.5 text-[1.0625rem] shadow-none focus-visible:outline-none focus-visible:ring-0 scrollbar-thin"
            rows={1}
          />
          {explainMutation.isPending ? (
            <Button size="icon" variant="outline" aria-label="Stop generating (Escape)" title="Stop (Esc)" className="h-[52px] w-[52px] shrink-0 rounded-xl border-border/80 bg-background" onClick={handleCancel}>
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            </Button>
          ) : (
            <Button size="icon" aria-label="Send" className="h-[52px] w-[52px] shrink-0 rounded-xl" disabled={!prompt.trim() && chat.sources.length === 0} onClick={handleSubmit}>
              <Send className="ml-0.5 h-5 w-5" aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="mx-auto mt-2 hidden max-w-[46rem] text-center text-xs text-muted-foreground md:block">
          Highlight any part of an answer and click it to ask a follow-up about that passage.
        </p>
      </div>
    </div>
  );
}, (prev, next) => prev.chat.history === next.chat.history && prev.chat.sources === next.chat.sources && prev.chat.title === next.chat.title && prev.model === next.model);

