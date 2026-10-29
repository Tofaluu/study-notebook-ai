import { useAuth } from '@/hooks/use-auth';
import React, { useState } from 'react';
import { FileText, Trash2, UploadCloud, Loader2, Plus, Edit2, Settings, MoreHorizontal } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Chat } from '@/lib/db';
import type { LectureSource } from '@workspace/api-client-react';
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

// The notebook mark: a closed notebook with its ribbon bookmark in the accent (public/favicon.svg is the same drawing)
function NotebookMark() {
  return (
    <svg className="h-7 w-7 shrink-0 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" />
      <path d="M8.5 2.5v19" />
      <path d="M13.5 2.5v8l2-1.6 2 1.6v-8z" className="fill-primary stroke-primary" />
    </svg>
  );
}

// A section's bulk actions behind a "⋯" button, so destructive ones don't sit beside the heading in red
function SectionMenu({ label, items, buttonRef }: {
  label: string;
  items: { label: string; onSelect: () => void }[];
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.parentElement?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, buttonRef]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-foreground/5 hover:text-foreground active:scale-90"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label={label} className="absolute right-0 top-9 z-20 min-w-40 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95 duration-100 ease-out">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onSelect(); }}
              className="block w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-destructive transition-[transform,background-color] duration-150 ease-out hover:bg-destructive/10 focus-visible:bg-destructive/10 active:scale-[0.98]"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  isOpen: boolean;
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

export function Sidebar({ isOpen, chats, activeChatId, activeChat, onCreateChat, onSwitchChat, onDeleteChat, onDeleteAllChats, onRenameChat, onSetSources }: SidebarProps) {
  const { user } = useAuth();
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  // Which bulk removal is waiting for confirmation (opened from a section's ⋯ menu)
  const [confirming, setConfirming] = useState<'notebooks' | 'materials' | null>(null);
  const notebooksMenuRef = React.useRef<HTMLButtonElement>(null);
  const materialsMenuRef = React.useRef<HTMLButtonElement>(null);

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
          const { extractTextFromPDF } = await import('@/lib/pdf');
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
    <aside className={`
      bg-muted border-border flex flex-col shrink-0 transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
      absolute md:relative z-50 h-[100dvh]
      ${isOpen
        ? "translate-x-0 w-72 lg:w-80 border-r opacity-100"
        : "-translate-x-full md:translate-x-0 md:w-0 border-r-0 opacity-0 overflow-hidden w-72"
      }
    `}>
      <div className="p-4 lg:p-6 border-b border-border/50 flex items-center justify-between gap-3 shrink-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <NotebookMark />
          <h1 className="truncate font-serif text-2xl text-foreground">Study Notebook</h1>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col scrollbar-thin">
        {/* Chats Section */}
        <div className="p-4 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between px-2 mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Notebooks</h2>
            <div className="flex items-center gap-1">
              {chats.length > 1 || chats[0]?.history?.length > 0 || chats[0]?.sources?.length > 0 ? (
                <>
                  <SectionMenu
                    label="More notebook actions"
                    buttonRef={notebooksMenuRef}
                    items={[{ label: 'Delete all notebooks…', onSelect: () => setConfirming('notebooks') }]}
                  />
                  <AlertDialog open={confirming === 'notebooks'} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
                    <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); notebooksMenuRef.current?.focus(); }}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete all notebooks?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Every notebook, with its messages, pages and PDFs, will be removed from this browser. This can’t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onDeleteAllChats} variant="destructive">
                          Delete all
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : null}
              <button onClick={onCreateChat} className="flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-foreground/5 active:scale-90" aria-label="New Notebook" title="New notebook">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <ul className="space-y-1">
            {chats.map(chat => (
              <li
                key={chat.id}
                className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${
                  chat.id === activeChatId ? 'bg-card text-foreground shadow-sm' : 'text-foreground hover:bg-foreground/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  {editingChatId === chat.id ? (
                    <input
                      autoFocus
                      aria-label="Notebook name"
                      onFocus={e => e.target.select()}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
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
                    <button
                      type="button"
                      onClick={() => onSwitchChat(chat.id)}
                      aria-current={chat.id === activeChatId ? 'page' : undefined}
                      className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-[transform,background-color] duration-150 ease-out active:scale-[0.99] ${chat.id === activeChatId ? 'font-medium' : ''}`}
                    >
                      <span title={chat.title}>{chat.title}</span>
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                  <button onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditTitle(chat.title); }} className="flex h-8 w-8 items-center justify-center rounded-md transition-[transform,background-color] duration-150 ease-out hover:bg-foreground/10 active:scale-90" aria-label={`Rename ${chat.title}`} title="Rename">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button onClick={(e) => e.stopPropagation()} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-[transform,background-color] duration-150 ease-out hover:bg-destructive/10 active:scale-90" aria-label={`Delete ${chat.title}`} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()} className="max-h-[85vh] overflow-y-auto w-[90vw] max-w-lg">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this notebook?</AlertDialogTitle>
                        <AlertDialogDescription className="break-words max-h-60 overflow-y-auto">
                          <span className="font-semibold text-foreground">“{chat.title}”</span> and its messages, pages and PDFs will be removed from this browser. This can’t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }} variant="destructive">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Materials Section */}
        {activeChat && (
          <div className="p-4 space-y-4 shrink-0">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-medium text-muted-foreground">Materials</h2>
              {activeChat.sources.length > 0 && (
                <>
                  <SectionMenu
                    label="More material actions"
                    buttonRef={materialsMenuRef}
                    items={[{ label: 'Remove all materials…', onSelect: () => setConfirming('materials') }]}
                  />
                  <AlertDialog open={confirming === 'materials'} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
                    <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); materialsMenuRef.current?.focus(); }}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove all materials?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The {activeChat.sources.length === 1 ? 'file' : `${activeChat.sources.length} files`} attached to this notebook will be removed. Answers you already have stay, but new questions won’t see these files.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onSetSources([])} variant="destructive">
                          Remove all
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
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
              className={`group flex h-28 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.99] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
                isUploading ? 'cursor-wait opacity-70 border-border'
                  : isDraggingFiles ? 'cursor-copy border-primary bg-primary/10'
                  : 'cursor-pointer border-border hover:border-foreground/30 hover:bg-foreground/[0.03]'
              }`}
            >
              <div className="flex flex-col items-center justify-center pt-4 pb-4">
                {isUploading ? <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mb-2" /> : <UploadCloud className="w-6 h-6 text-muted-foreground group-hover:text-foreground mb-2 transition-colors" />}
                <p className="px-2 text-center text-sm font-medium text-foreground">
                  {isUploading ? 'Reading files…' : isDraggingFiles ? 'Drop to add' : 'Add PDFs or images'}
                </p>
                {!isUploading && !isDraggingFiles && <p className="text-xs text-muted-foreground">or drop them here</p>}
              </div>
              <input type="file" className="sr-only" aria-label="Add PDFs or images" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp" multiple onChange={handleFileUpload} disabled={isUploading} />
            </label>
            {uploadError && <p role="alert" className="px-2 text-xs text-destructive">{uploadError}</p>}

            <ul className="space-y-2">
              {activeChat.sources.map(s => (
                <li
                  key={s.id}
                  className="group relative flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  {s.type === 'image' && s.base64Data ? <div className="w-8 h-8 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center"><img src={s.base64Data} alt={s.name} className="w-full h-full object-cover" /></div> : <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0 pr-8">
                    <p className="text-sm font-medium text-foreground truncate" title={s.name}>{s.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.type === 'image' ? 'Image' : s.pageCount + ' pages'}</p>
                  </div>
                  <button
                    onClick={() => onSetSources(activeChat.sources.filter(src => src.id !== s.id))}
                    aria-label={`Remove ${s.name}`}
                    title="Remove"
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 transition-[transform,opacity,background-color,color] duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 active:scale-90 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border/50 shrink-0 bg-background/50 flex items-center justify-between">
        {user ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold uppercase">
              {displayName.charAt(0)}
            </div>
            <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
              {displayName}
            </span>
          </div>
        ) : (
          <button
            onClick={() => window.dispatchEvent(new Event('open-auth'))}
            className="flex items-center gap-2 rounded px-1 text-sm font-medium text-foreground underline-offset-4 transition-[transform,opacity] duration-150 ease-out hover:underline active:scale-95"
          >
            <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
            Sign In / Sign Up
          </button>
        )}

        <div className="flex items-center gap-1">
          {user && (
            <button
              onClick={async () => {
                const { supabase } = await import('@/lib/supabase');
                const { clearLocalChats } = await import('@/lib/db');
                await clearLocalChats();
                await supabase.auth.signOut();
                window.location.reload();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-foreground/5 hover:text-destructive active:scale-90"
              aria-label="Sign out"
              title="Sign out"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          )}
          <button
            onClick={() => window.dispatchEvent(new Event('open-settings'))}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-foreground/5 hover:text-foreground active:scale-90"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

















