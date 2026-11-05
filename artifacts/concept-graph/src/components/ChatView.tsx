import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { useExplainStudyTopic, type StudyModel } from '@workspace/api-client-react';
import { Chat, HistoryItem } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { Loader2, Mic, MicOff, Send, Square, Sparkles } from 'lucide-react';
import { DEMO_SOURCE_ID } from '@/lib/demo';
import { SourcesCited } from './SourcesCited';
import { Reveal } from './Reveal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useVoiceRecognition } from '@/hooks/use-voice-recognition';
import { parseVoiceCommand } from '@/lib/voice-commands';
import { toast } from '@/hooks/use-toast';

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
  onOpenNewTab?: (term: string, contextSnippet?: string) => void;
}

export const ChatView = React.memo(function ChatView({ chat, model, onAddHistory, onRemoveHistory, onRename, onTermClick, onFollowUp, onAddSources, onOpenDemo, onOpenNewTab }: ChatViewProps) {
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

  // Voice recognition & command handling with AI-assisted correction
  const handleVoiceFinal = useCallback(async (transcript: string) => {
    // 1. Check if user configured an API key to leverage AI intent & phonetic correction
    const hasAnyKey = typeof window !== 'undefined' && !!(
      window.localStorage.getItem('study-notebook-gemini-key') ||
      window.localStorage.getItem('study-notebook-api-key') ||
      window.localStorage.getItem('study-notebook-openai-key') ||
      window.localStorage.getItem('study-notebook-anthropic-key')
    );

    let action = parseVoiceCommand(transcript);

    // If an API key is available, call the fast-path LLM voice action route for phonetic correction
    if (hasAnyKey) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const geminiKey = window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key');
        if (geminiKey) headers['x-gemini-api-key'] = geminiKey;
        const openaiKey = window.localStorage.getItem('study-notebook-openai-key');
        if (openaiKey) headers['x-openai-api-key'] = openaiKey;
        const anthropicKey = window.localStorage.getItem('study-notebook-anthropic-key');
        if (anthropicKey) headers['x-anthropic-api-key'] = anthropicKey;

        const res = await fetch('/api/study/voice/action', {
          method: 'POST',
          headers,
          body: JSON.stringify({ transcript, model }),
        });
        if (res.ok) {
          const aiAction = await res.json();
          if (aiAction && aiAction.action) {
            action = {
              type: aiAction.action,
              term: aiAction.term || '',
              title: aiAction.title || '',
              text: aiAction.text || transcript,
              contextSnippet: `Opened via voice command: "${transcript}".`,
            } as any;
          }
        }
      } catch {
        // Fall back to local regex action if network/call fails
      }
    }

    if (action.type === 'new_concept_tab' && (action as any).term) {
      const targetTerm = (action as any).term;
      toast({
        title: 'Voice Command Executed',
        description: `Opening new tab for "${targetTerm}"...`,
      });
      if (onOpenNewTab) {
        onOpenNewTab(targetTerm, (action as any).contextSnippet);
      } else {
        onTermClick(targetTerm, (action as any).contextSnippet || '');
      }
      return;
    }

    if (action.type === 'rename_notebook' && (action as any).title) {
      const newTitle = (action as any).title;
      toast({
        title: 'Notebook Renamed',
        description: `Renamed to "${newTitle}"`,
      });
      onRename(newTitle);
      return;
    }

    // Default: append or set prompt
    const textToInsert = (action as any).text || transcript;
    setPrompt((prev) => (prev ? `${prev} ${textToInsert}` : textToInsert));
  }, [model, onOpenNewTab, onTermClick, onRename]);

  const handleVoiceError = useCallback((err: string) => {
    toast({
      title: 'Speech Recognition',
      description: err === 'not-allowed' ? 'Microphone permission denied.' : `Speech error: ${err}`,
      variant: 'destructive',
    });
  }, []);

  const {
    isListening,
    fullTranscript,
    remainingSilenceMs,
    isSupported: isVoiceSupported,
    toggleListening,
  } = useVoiceRecognition({
    silenceBufferMs: 3000,
    onFinalTranscript: handleVoiceFinal,
    onError: handleVoiceError,
  });

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
        {/* Real-time Voice Listening Indicator Banner with 3s silence countdown */}
        {isListening && (
          <div className="mx-auto mb-2 flex max-w-[46rem] items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs text-primary animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
              <span className="font-semibold shrink-0">Listening:</span>
              <span className="truncate italic text-foreground/80">
                {fullTranscript || 'Say "Open a new tab and explain [concept]" or dictate a question...'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {remainingSilenceMs !== null && fullTranscript && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  processing in {(remainingSilenceMs / 1000).toFixed(1)}s
                </span>
              )}
              <button
                onClick={toggleListening}
                className="rounded px-2 py-0.5 text-[11px] font-semibold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        )}

        <div className="relative mx-auto flex max-w-[46rem] items-end gap-2 sm:gap-3 rounded-2xl border border-border/80 bg-card p-2 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] transition-[border-color,box-shadow] duration-200 focus-within:border-foreground/30 focus-within:shadow-[0_12px_36px_rgb(0,0,0,0.1)] dark:focus-within:shadow-[0_12px_36px_rgb(0,0,0,0.4)]">
          <Textarea
            autoFocus
            aria-label={chat.sources.length > 0 ? 'Ask about your materials' : 'Ask a question'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown} onPaste={handlePaste}
            placeholder={chat.sources.length > 0 ? "Ask about your materials..." : "Ask a question..."}
            className="min-h-[52px] max-h-48 resize-none border-0 bg-transparent px-3 sm:px-4 py-3.5 text-[1.0625rem] shadow-none focus-visible:outline-none focus-visible:ring-0 scrollbar-thin"
            rows={1}
          />
          {isVoiceSupported && (
            <Button
              type="button"
              size="icon"
              variant={isListening ? "default" : "ghost"}
              aria-label={isListening ? "Stop voice listening" : "Start voice listening"}
              title={isListening ? "Listening... (click to stop)" : "Voice input (try 'Open a new tab and explain [topic]')"}
              className={`h-[52px] w-[52px] shrink-0 rounded-xl transition-all duration-200 ${
                isListening
                  ? "bg-primary text-primary-foreground shadow-md animate-pulse ring-2 ring-primary/40"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={toggleListening}
            >
              {isListening ? (
                <MicOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Mic className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>
          )}
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
        <div className="mx-auto mt-2 hidden max-w-[46rem] items-center justify-between px-1 text-xs text-muted-foreground md:flex">
          <span>Highlight any part of an answer to ask a follow-up about that passage.</span>
          {isVoiceSupported && (
            <span className="inline-flex items-center gap-1 text-[11px] opacity-75">
              <Sparkles className="h-3 w-3 text-primary" /> Voice: "Open new tab for [topic]"
            </span>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => prev.chat.history === next.chat.history && prev.chat.sources === next.chat.sources && prev.chat.title === next.chat.title && prev.model === next.model);

