import React, { useState, useEffect, useRef } from 'react';
import { useExplainStudyTopic, LectureSource } from '@workspace/api-client-react';
import { loadSession, saveSession, HistoryItem, clearSession } from '@/lib/db';
import { extractTextFromPDF } from '@/lib/pdf';
import { SelectableAnswer } from '@/components/SelectableAnswer';
import { BookOpen, FileText, Send, Trash2, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function Home() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sources, setSources] = useState<LectureSource[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const explainMutation = useExplainStudyTopic();

  useEffect(() => {
    loadSession().then(data => {
      setHistory(data.history);
      setSources(data.sources);
      setIsInitializing(false);
    });
  }, []);

  useEffect(() => {
    if (history.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, explainMutation.isPending]);

  const processFiles = async (files: File[]) => {
    if (files.length === 0 || isUploading) return;

    const pdfFiles = files.filter(
      file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    const rejectedCount = files.length - pdfFiles.length;

    if (pdfFiles.length === 0) {
      setUploadError('Please choose PDF files only.');
      return;
    }

    setUploadError(
      rejectedCount > 0
        ? `${rejectedCount} non-PDF ${rejectedCount === 1 ? 'file was' : 'files were'} skipped.`
        : null
    );
    setIsUploading(true);
    try {
      const newSources: LectureSource[] = [];
      for (const file of pdfFiles) {
        const extracted = await extractTextFromPDF(file);
        newSources.push({
          id: Math.random().toString(36).substring(2),
          name: file.name,
          text: extracted.text,
          pageCount: extracted.pageCount,
          pages: extracted.pages
        });
      }
      const updatedSources = [...sources, ...newSources];
      setSources(updatedSources);
      await saveSession(history, updatedSources);
    } catch (err) {
      console.error(err);
      setUploadError('One or more PDFs could not be read. Please try another file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    void processFiles(Array.from(e.dataTransfer.files));
  };

  const removeSource = async (id: string) => {
    const updated = sources.filter(s => s.id !== id);
    setSources(updated);
    await saveSession(history, updated);
  };

  const handleClearSession = async () => {
    await clearSession();
    setHistory([]);
    setSources([]);
  };

  const handleTermClick = (term: string, contextSnippet: string) => {
    const params = new URLSearchParams({ term, context: contextSnippet });
    window.open(`${import.meta.env.BASE_URL}concept?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleSubmit = async () => {
    const isDefaultPrompt = !prompt.trim() && sources.length > 0;
    if (!prompt.trim() && sources.length === 0) return;

    const actualPrompt = isDefaultPrompt ? "Explain the key concepts of the uploaded lectures." : prompt.trim();
    
    const userMessage: HistoryItem = {
      id: Math.random().toString(36).substring(2),
      type: 'user',
      content: actualPrompt,
      timestamp: Date.now()
    };

    const newHistory = [...history, userMessage];
    setHistory(newHistory);
    setPrompt('');

    explainMutation.mutate({ data: { prompt: actualPrompt, sources } }, {
      onSuccess: (data) => {
        const aiMessage: HistoryItem = {
          id: Math.random().toString(36).substring(2),
          type: 'ai',
          content: data.title,
          explanation: data,
          timestamp: Date.now()
        };
        const updatedHistory = [...newHistory, aiMessage];
        setHistory(updatedHistory);
        saveSession(updatedHistory, sources);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (isInitializing) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-[100dvh] bg-background w-full overflow-hidden font-sans">
      <aside className="w-80 bg-muted border-r border-border flex flex-col hidden md:flex shrink-0">
        <div className="p-6 border-b border-border/50 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="font-serif text-xl font-bold text-foreground">Study Notebook</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase">Materials</h2>
            {sources.length > 0 && (
              <button onClick={handleClearSession} className="text-xs text-destructive hover:underline font-medium">Clear All</button>
            )}
          </div>
          
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isUploading) setIsDraggingFiles(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = isUploading ? 'none' : 'copy';
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDraggingFiles(false);
              }
            }}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl bg-card transition-all group ${
              isUploading
                ? 'cursor-wait opacity-70 border-primary/30'
                : isDraggingFiles
                  ? 'cursor-copy border-primary bg-primary/10 scale-[1.01] shadow-sm'
                  : 'cursor-pointer border-primary/30 hover:bg-primary/5 hover:border-primary/60'
            }`}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {isUploading ? <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" /> : <UploadCloud className="w-6 h-6 text-primary/70 group-hover:text-primary mb-2 transition-colors" />}
              <p className="text-xs text-muted-foreground font-medium">
                {isUploading ? 'Extracting text...' : isDraggingFiles ? 'Drop PDFs here' : 'Drop PDFs here or browse'}
              </p>
              {!isUploading && !isDraggingFiles && (
                <p className="mt-1 text-[11px] text-muted-foreground/70">Multiple files supported</p>
              )}
            </div>
            <input type="file" className="hidden" accept="application/pdf,.pdf" multiple onChange={handleFileUpload} disabled={isUploading} />
          </label>
          {uploadError && (
            <p role="alert" className="px-2 text-xs leading-relaxed text-destructive">
              {uploadError}
            </p>
          )}

          <div className="space-y-2">
            {sources.map(s => (
              <div key={s.id} className="bg-card border border-border p-3 rounded-xl flex items-start gap-3 group relative shadow-sm">
                <FileText className="w-5 h-5 text-primary/70 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate" title={s.name}>{s.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.pageCount} pages</p>
                </div>
                <button onClick={() => removeSource(s.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-md transition-all absolute right-2 top-2">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative bg-background">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-10 pb-32">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center opacity-80 animate-in fade-in zoom-in duration-700">
                <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mb-6 shadow-inner rotate-3">
                  <BookOpen className="w-10 h-10 text-primary/80 -rotate-3" />
                </div>
                <h2 className="text-3xl font-serif font-bold text-foreground mb-3 tracking-tight">Begin your session.</h2>
                <p className="text-muted-foreground max-w-md text-lg">Upload your reading materials and ask a question, or let the AI summarize the core concepts to get started.</p>
              </div>
            ) : (
              history.map((item, idx) => (
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
                            onTermClick={handleTermClick}
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
            <div ref={bottomRef} className="h-1" />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/90 to-transparent pt-10">
          <div className="max-w-3xl mx-auto relative flex items-end gap-3 bg-card border border-border/80 p-2 rounded-2xl shadow-lg focus-within:ring-2 focus-within:ring-primary/30 transition-all">
            <Textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sources.length > 0 ? "Ask a question about your materials..." : "Ask a general question..."}
              className="min-h-[52px] max-h-48 resize-none border-0 focus-visible:ring-0 bg-transparent text-[1.05rem] py-3.5 px-4 shadow-none font-medium scrollbar-thin"
              rows={1}
            />
            <Button 
              size="icon"
              className="h-[52px] w-[52px] rounded-xl shrink-0 shadow-md transition-all active:scale-95"
              disabled={(!prompt.trim() && sources.length === 0) || explainMutation.isPending || isUploading}
              onClick={handleSubmit}
            >
              {explainMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </Button>
          </div>
          <div className="max-w-3xl mx-auto mt-2 text-center hidden md:block">
            <p className="text-xs font-medium text-muted-foreground">Click a highlighted term, or select any passage to ask a focused follow-up.</p>
          </div>
        </div>
      </main>
    </div>
  );
}