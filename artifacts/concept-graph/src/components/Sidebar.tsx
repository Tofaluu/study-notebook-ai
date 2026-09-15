import React, { useState } from 'react';
import { BookOpen, FileText, Trash2, UploadCloud, Loader2, Plus, Edit2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Chat } from '@/lib/db';
import type { LectureSource } from '@workspace/api-client-react';
import { extractTextFromPDF } from '@/lib/pdf';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  activeChat: Chat | null;
  onCreateChat: () => void;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onSetSources: (sources: LectureSource[]) => void;
}

export function Sidebar({ chats, activeChatId, activeChat, onCreateChat, onSwitchChat, onDeleteChat, onRenameChat, onSetSources }: SidebarProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const processFiles = async (files: File[]) => {
    if (!activeChat || files.length === 0 || isUploading) return;
    const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    const rejectedCount = files.length - pdfFiles.length;

    if (pdfFiles.length === 0) {
      setUploadError('Please choose PDF files only.');
      return;
    }

    setUploadError(rejectedCount > 0 ? `${rejectedCount} non-PDF skipped.` : null);
    setIsUploading(true);
    
    try {
      const newSources = [];
      for (const file of pdfFiles) {
        const extracted = await extractTextFromPDF(file);
        newSources.push({
          id: crypto.randomUUID(),
          name: file.name,
          text: extracted.text,
          pageCount: extracted.pageCount,
          pages: extracted.pages
        });
      }
      onSetSources([...activeChat.sources, ...newSources]);
    } catch (err) {
      setUploadError('One or more PDFs could not be read.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

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
            <button onClick={onCreateChat} className="p-1 hover:bg-foreground/5 rounded text-foreground transition-colors" aria-label="New Notebook">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1">
            {chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => onSwitchChat(chat.id)}
                className={`
                  group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
                  ${chat.id === activeChatId ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/80 hover:bg-foreground/5'}
                `}
              >
                <div className="flex-1 min-w-0">
                  {editingChatId === chat.id ? (
                    <input
                      autoFocus
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
                    <span className="text-sm truncate block">{chat.title}</span>
                  )}
                </div>
                
                <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditTitle(chat.title); }} className="p-1.5 hover:bg-foreground/10 rounded-md transition-colors" aria-label="Rename notebook">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete “${chat.title}” and all of its saved messages, tabs, and PDFs from this browser?`)) {
                      onDeleteChat(chat.id);
                    }
                  }} className="p-1.5 hover:bg-destructive/10 text-destructive/80 hover:text-destructive rounded-md transition-colors" aria-label="Delete notebook">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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
                  {isUploading ? 'Extracting text...' : isDraggingFiles ? 'Drop PDFs here' : 'Drop PDFs here or browse'}
                </p>
              </div>
              <input type="file" className="hidden" accept="application/pdf,.pdf" multiple onChange={handleFileUpload} disabled={isUploading} />
            </label>
            {uploadError && <p className="px-2 text-xs text-destructive">{uploadError}</p>}

            <div className="space-y-2">
              {activeChat.sources.map(s => (
                <div key={s.id} className="bg-card border border-border p-3 rounded-xl flex items-start gap-3 group relative shadow-sm">
                  <FileText className="w-5 h-5 text-primary/70 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={s.name}>{s.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.pageCount} pages</p>
                  </div>
                  <button onClick={() => onSetSources(activeChat.sources.filter(src => src.id !== s.id))} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-md transition-all absolute right-2 top-2">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border/50 shrink-0 bg-background/50">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold tracking-wider text-muted-foreground uppercase px-1">Gemini API Key</label>
          <input
            type="password"
            placeholder="Paste Gemini Key (BYOK)"
            className="w-full bg-card border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
            defaultValue={window.localStorage.getItem('study-notebook-api-key') || ''}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (val) {
                window.localStorage.setItem('study-notebook-api-key', val);
              } else {
                window.localStorage.removeItem('study-notebook-api-key');
              }
            }}
          />
          <p className="text-[10px] text-muted-foreground px-1 leading-tight">Key is saved in browser local storage and sent directly to your backend.</p>
        </div>
      </div>
    </aside>
  );
}
