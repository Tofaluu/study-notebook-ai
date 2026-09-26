import React, { useState } from 'react';
import { BookOpen, FileText, Trash2, UploadCloud, Loader2, Plus, Edit2, Key } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Chat } from '@/lib/db';
import type { LectureSource } from '@workspace/api-client-react';
import { extractTextFromPDF } from '@/lib/pdf';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  activeChat: Chat | null;
  onCreateChat: () => void;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onDeleteAllChats: () => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onSetSources: (sources: LectureSource[]) => void;
}

export function Sidebar({ chats, activeChatId, activeChat, onCreateChat, onSwitchChat, onDeleteChat, onDeleteAllChats, onRenameChat, onSetSources }: SidebarProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);

  const processFilesRef = React.useRef<((files: File[]) => Promise<void>) | null>(null);

  React.useEffect(() => {
    const handleCustomUpload = (e: Event) => {
      const files = (e as CustomEvent<File[]>).detail;
      if (processFilesRef.current) processFilesRef.current(files);
    };
    window.addEventListener('upload-pdfs', handleCustomUpload);
    return () => window.removeEventListener('upload-pdfs', handleCustomUpload);
  }, []);

  const processFiles = async (files: File[]) => {
    if (!activeChat || files.length === 0 || isUploading) return;
    const allowedFiles = files.filter(f => 
      f.type === 'application/pdf' || 
      f.name.toLowerCase().endsWith('.pdf') ||
      f.type.startsWith('image/')
    );
    const rejectedCount = files.length - allowedFiles.length;

    if (allowedFiles.length === 0) {
      setUploadError('Please choose PDF or image files.');
      return;
    }

    setUploadError(rejectedCount > 0 ? `${rejectedCount} unsupported files skipped.` : null);
    setIsUploading(true);
    
    try {
      const newSources = [];
      for (const file of allowedFiles) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const extracted = await extractTextFromPDF(file);
          newSources.push({
            id: crypto.randomUUID(),
            name: file.name,
            type: 'pdf' as const,
            text: extracted.text,
            pageCount: extracted.pageCount,
            pages: extracted.pages
          });
        } else if (file.type.startsWith('image/')) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          newSources.push({
            id: crypto.randomUUID(),
            name: file.name,
            type: 'image' as const,
            text: `[Image file: ${file.name}]`,
            base64Data: base64,
            mimeType: file.type,
            pageCount: 1,
            pages: [{ pageNumber: 1, text: `[Image file: ${file.name}]` }]
          });
        }
      }
      onSetSources([...activeChat.sources, ...newSources]);
    } catch (err) {
      console.error("PDF Parsing Error:", err);
      setUploadError('One or more PDFs could not be read.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  processFilesRef.current = processFiles;

  return (
    <aside className="w-72 lg:w-80 bg-muted border-r border-border hidden md:flex flex-col shrink-0 transition-colors">
      <div className="p-4 lg:p-6 border-b border-border/50 flex items-center justify-between gap-3 shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="truncate font-serif text-xl font-bold text-foreground">Study Notebook</h1>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col scrollbar-thin">
        {/* Chats Section */}
        <div className="p-4 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between px-2 mb-3">
            <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Notebooks</h2>
            <div className="flex items-center gap-2">
              {chats.length > 1 || chats[0]?.history?.length > 0 || chats[0]?.sources?.length > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="text-xs text-destructive hover:underline font-medium">Clear All</button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all notebooks?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete all notebooks? This will permanently delete all saved messages, tabs, and PDFs from this browser. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDeleteAllChats} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              <button onClick={onCreateChat} className="p-1 hover:bg-foreground/5 rounded text-foreground transition-colors" aria-label="New Notebook">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {chats.map(chat => (
              <div 
                key={chat.id} 
                onMouseEnter={() => setHoveredChatId(chat.id)}
                onMouseLeave={() => setHoveredChatId(null)}
                onClick={() => onSwitchChat(chat.id)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
                  ${chat.id === activeChatId ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/80 hover:bg-foreground/5'}
                `}
              >
                <div className="flex-1 min-w-0">
                  {editingChatId === chat.id ? (
                    <input
                      autoFocus
                      onFocus={e => e.target.select()}
                      className="w-full bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => {
                        onRenameChat(chat.id, editTitle || chat.title);
                        setEditingChatId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          onRenameChat(chat.id, editTitle || chat.title);
                          setEditingChatId(null);
                        } else if (e.key === 'Escape') {
                          setEditingChatId(null);
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-sm truncate block" title={chat.title}>{chat.title}</span>
                  )}
                </div>
                
                <div className={`transition-opacity duration-200 flex items-center shrink-0 ${hoveredChatId === chat.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                  <button onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditTitle(chat.title); }} className="p-1.5 hover:bg-foreground/10 rounded-md transition-colors" aria-label="Rename notebook">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button onClick={(e) => e.stopPropagation()} className="p-1.5 hover:bg-destructive/10 text-destructive/80 hover:text-destructive rounded-md transition-colors" aria-label="Delete notebook">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Notebook?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{chat.title}"? This will permanently delete all saved messages, tabs, and PDFs from this browser. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Materials Section */}
        {activeChat && (
          <div className="p-4 space-y-4 shrink-0">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Materials</h2>
              {activeChat.sources.length > 0 && (
                <button onClick={() => onSetSources([])} className="text-xs text-destructive hover:underline font-medium">Clear All</button>
              )}
            </div>
            
            <label
              onDragEnter={(e) => { e.preventDefault(); if (!isUploading) setIsDraggingFiles(true); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = isUploading ? 'none' : 'copy'; }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFiles(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFiles(false);
                processFiles(Array.from(e.dataTransfer.files));
              }}
              className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl bg-card transition-all group ${
                isUploading ? 'cursor-wait opacity-70 border-primary/30'
                  : isDraggingFiles ? 'cursor-copy border-primary bg-primary/10 scale-[1.01] shadow-sm'
                  : 'cursor-pointer border-primary/30 hover:bg-primary/5 hover:border-primary/60'
              }`}
            >
              <div className="flex flex-col items-center justify-center pt-4 pb-4">
                {isUploading ? <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" /> : <UploadCloud className="w-6 h-6 text-primary/70 group-hover:text-primary mb-2 transition-colors" />}
                <p className="text-xs text-muted-foreground font-medium text-center px-2">
                  {isUploading ? 'Processing files...' : isDraggingFiles ? 'Drop files here' : 'Drop PDFs or Images here'}
                </p>
              </div>
              <input type="file" className="hidden" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp" multiple onChange={handleFileUpload} disabled={isUploading} />
            </label>
            {uploadError && <p className="px-2 text-xs text-destructive">{uploadError}</p>}

            <div className="space-y-2">
              {activeChat.sources.map(s => (
                <div 
                  key={s.id} 
                  onMouseEnter={() => setHoveredSourceId(s.id)}
                  onMouseLeave={() => setHoveredSourceId(null)}
                  className="bg-card border border-border p-3 rounded-xl flex items-start gap-3 relative shadow-sm"
                >
                  {s.type === 'image' && s.base64Data ? <div className="w-8 h-8 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center"><img src={s.base64Data} alt={s.name} className="w-full h-full object-cover" /></div> : <FileText className="w-5 h-5 text-primary/70 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0 pr-8">
                    <p className="text-sm font-medium text-foreground truncate" title={s.name}>{s.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.type === 'image' ? 'Image' : s.pageCount + ' pages'}</p>
                  </div>
                  <button onClick={() => onSetSources(activeChat.sources.filter(src => src.id !== s.id))} className={`transition-opacity duration-200 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-md absolute right-2 top-2 ${hoveredSourceId === s.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border/50 shrink-0 bg-background/50">
        <button
          onClick={() => window.dispatchEvent(new Event('open-api-key-modal'))}
          className="w-full flex items-center justify-center gap-2 bg-card border border-border rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Key className="w-4 h-4" />
          API Key Settings
        </button>
      </div>
    </aside>
  );
}

