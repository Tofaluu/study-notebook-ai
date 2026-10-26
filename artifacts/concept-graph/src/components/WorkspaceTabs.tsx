import React, { useState, useRef, useEffect } from 'react';
import { FileText, MessageSquareText, MessageCircle, X, PanelLeft, ChevronRight, ChevronDown, KeyRound, BookOpen } from 'lucide-react';
import { WorkspaceTab } from '@/lib/db';
import type { StudyModel } from '@workspace/api-client-react';
import { STUDY_MODEL_OPTIONS } from '@/lib/models';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WorkspaceTabsProps {
  onToggleSidebar?: () => void;
  tabs: WorkspaceTab[];
  activeTabId: string;
  model: StudyModel;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onModelChange: (model: StudyModel) => void;
  onReorderTabs?: (newTabs: WorkspaceTab[]) => void;
  onUpdateTab?: (tabId: string, updates: Partial<WorkspaceTab>) => void;
  isReaderMode?: boolean;
  onToggleReaderMode?: () => void;
}

export function WorkspaceTabs({ tabs, activeTabId, model, onSwitch, onClose, onModelChange, onReorderTabs, onUpdateTab, onToggleSidebar, isReaderMode, onToggleReaderMode }: WorkspaceTabsProps) {
  const [keys, setKeys] = useState({ gemini: false, openai: false, anthropic: false });
  useEffect(() => {
    const checkKeys = () => {
      setKeys({
        gemini: !!(window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key')),
        openai: !!window.localStorage.getItem('study-notebook-openai-key'),
        anthropic: !!window.localStorage.getItem('study-notebook-anthropic-key')
      });
    };
    checkKeys();
    window.addEventListener('storage', checkKeys);
    window.addEventListener('api-keys-updated', checkKeys);
    return () => {
      window.removeEventListener('storage', checkKeys);
      window.removeEventListener('api-keys-updated', checkKeys);
    };
  }, []);

  // Keep the active tab visible when the strip scrolls (narrow screens, many tabs)
  useEffect(() => {
    document.getElementById(`tab-${activeTabId}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  const noKeysConfigured = !keys.gemini && !keys.openai && !keys.anthropic;
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabWidth, setEditingTabWidth] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetTabId: string, isChatTab: boolean) => {
    e.preventDefault();
    if (isChatTab || !draggedTabId || draggedTabId === targetTabId || !onReorderTabs) return;

    const draggedTabObj = tabs.find(t => t.id === draggedTabId);
    const targetTabObj = tabs.find(t => t.id === targetTabId);
    if (draggedTabObj?.parentId !== targetTabObj?.parentId) return;

    const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
    const targetIndex = tabs.findIndex(t => t.id === targetTabId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    // Calculate mouse position relative to the hovered tab to prevent flickering
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const isRightHalf = mouseX > rect.width / 2;

    // Only swap if the mouse has crossed the 50% threshold of the target tab
    if (draggedIndex < targetIndex && !isRightHalf) return;
    if (draggedIndex > targetIndex && isRightHalf) return;

    let draggedSubtreeSize = 1;
    while (draggedIndex + draggedSubtreeSize < tabs.length && tabs[draggedIndex + draggedSubtreeSize].parentId === draggedTabId) {
      draggedSubtreeSize++;
    }

    let targetSubtreeSize = 1;
    while (targetIndex + targetSubtreeSize < tabs.length && tabs[targetIndex + targetSubtreeSize].parentId === targetTabId) {
      targetSubtreeSize++;
    }

    const newTabs = [...tabs];
    const draggedChunk = newTabs.splice(draggedIndex, draggedSubtreeSize);

    const adjustedTargetIndex = targetIndex > draggedIndex
      ? targetIndex - draggedSubtreeSize
      : targetIndex;

    const insertIndex = targetIndex > draggedIndex
      ? adjustedTargetIndex + targetSubtreeSize
      : adjustedTargetIndex;

    newTabs.splice(insertIndex, 0, ...draggedChunk);
    onReorderTabs(newTabs);
  };

  // Pointer events so resizing works with a mouse, pen or finger
  const startResize = (e: React.PointerEvent<HTMLDivElement>, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const tabElement = handle.closest('.tab-container') as HTMLElement | null;
    if (!tabElement) return;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = tabElement.offsetWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const newWidth = Math.max(100, Math.min(600, startWidth + (moveEvent.clientX - startX)));
      onUpdateTab?.(tabId, { customWidth: newWidth });
    };
    const stop = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      handle.removeEventListener('lostpointercapture', stop);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);
  };

  const startEditing = (tabId: string, title: string, element: Element | null) => {
    setEditingTabWidth(element instanceof HTMLElement ? element.offsetWidth : null);
    setEditingTabId(tabId);
    setEditTitle(title);
  };

  const focusTab = (tabId: string) => {
    requestAnimationFrame(() => document.getElementById(`tab-${tabId}`)?.focus());
  };

  const submitEdit = (tabId: string, fallbackTitle: string) => {
    if (onUpdateTab) {
      onUpdateTab(tabId, { customName: editTitle.trim() || fallbackTitle });
    }
    setEditingTabId(null);
  };

  const isDescendantOfCollapsed = (tabId: string) => {
    let current = tabs.find(t => t.id === tabId);
    while (current?.parentId) {
      if (collapsedParents.has(current.parentId)) return true;
      current = tabs.find(t => t.id === current?.parentId);
    }
    return false;
  };

  const visibleTabs = tabs.filter(t => !isDescendantOfCollapsed(t.id));

  // Roving focus: arrow keys move between tabs, Delete closes, F2 renames.
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const tab = visibleTabs[index];
    let next: WorkspaceTab | undefined;
    if (e.key === 'ArrowRight') next = visibleTabs[(index + 1) % visibleTabs.length];
    else if (e.key === 'ArrowLeft') next = visibleTabs[(index - 1 + visibleTabs.length) % visibleTabs.length];
    else if (e.key === 'Home') next = visibleTabs[0];
    else if (e.key === 'End') next = visibleTabs[visibleTabs.length - 1];
    else if ((e.key === 'Delete' || e.key === 'Backspace') && tab.type !== 'chat') {
      e.preventDefault();
      const fallback = visibleTabs[index - 1] ?? visibleTabs[index + 1];
      onClose(tab.id);
      if (fallback) focusTab(fallback.id);
      return;
    } else if (e.key === 'F2' && tab.type !== 'chat') {
      e.preventDefault();
      startEditing(tab.id, tab.customName || tab.title, e.currentTarget.closest('.tab-container'));
      return;
    }
    if (next) {
      e.preventDefault();
      onSwitch(next.id);
      focusTab(next.id);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 p-2 min-h-[48px]">
      <button
        onClick={onToggleSidebar}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-90"
        aria-label="Toggle Sidebar"
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <div role="tablist" aria-label="Open pages" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
        {visibleTabs.map((tab, index) => {
          const hasChildren = tabs.some(t => t.parentId === tab.id);
          const isCollapsed = collapsedParents.has(tab.id);
          const isChild = !!tab.parentId;
          const isActive = !isReaderMode && tab.id === activeTabId;
          const displayTitle = tab.customName || tab.title;
          const isChatTab = tab.type === 'chat';
          const Icon = isChatTab ? MessageCircle : tab.type === 'concept' ? FileText : MessageSquareText;

          return (
            <React.Fragment key={tab.id}>
              {!isChild && index > 0 && <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />}
              <div
                draggable={!isChatTab && editingTabId !== tab.id}
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleDragOver(e, tab.id, isChatTab)}
                onDragEnd={() => setDraggedTabId(null)}
                className={`tab-container group relative flex shrink-0 items-center gap-1 rounded-md border px-2 transition-[background-color,border-color,color,transform] duration-150 ease-out ${
                  isActive
                    ? 'border-border bg-card text-foreground'
                    : isChild
                      ? 'border-transparent bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                } ${draggedTabId === tab.id ? 'opacity-50' : ''}`}
                style={tab.customWidth && tab.customWidth > 0 ? { width: tab.customWidth } : (editingTabId === tab.id && editingTabWidth ? { width: editingTabWidth } : {})}
              >
                {hasChildren && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedParents(prev => {
                        const next = new Set(prev);
                        if (next.has(tab.id)) next.delete(tab.id);
                        else next.add(tab.id);
                        return next;
                      });
                    }}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `Show pages opened from ${displayTitle}` : `Hide pages opened from ${displayTitle}`}
                    className="-ml-1 flex h-7 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted-foreground/15 active:scale-90"
                  >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                )}

                {editingTabId === tab.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
                    <Icon className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                    <input
                      autoFocus
                      aria-label="Page name"
                      className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-sm"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => submitEdit(tab.id, displayTitle)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          submitEdit(tab.id, displayTitle);
                          focusTab(tab.id);
                        }
                        if (e.key === 'Escape') {
                          setEditingTabId(null);
                          focusTab(tab.id);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    title={displayTitle}
                    onClick={() => onSwitch(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    onDoubleClick={(e) => {
                      if (!isChatTab) startEditing(tab.id, displayTitle, e.currentTarget.closest('.tab-container'));
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1.5 text-left transition-transform duration-150 ease-out active:scale-[0.98]"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} aria-hidden="true" />
                    <span
                      className={`min-w-0 flex-1 truncate whitespace-nowrap text-sm ${!isChild && !isChatTab ? 'font-medium' : ''}`}
                      style={tab.customWidth === undefined || tab.customWidth === 0 ? { maxWidth: '140px' } : {}}
                    >
                      {displayTitle}
                    </span>
                  </button>
                )}

                {!isChatTab && (
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(tab.id);
                      }}
                      className={`flex h-7 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[transform,opacity,background-color,color] duration-150 ease-out hover:bg-muted-foreground/15 hover:text-foreground active:scale-90 [@media(hover:none)]:opacity-100 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                      }`}
                      aria-label={`Close ${displayTitle}`}
                      title="Close (Delete)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div
                      aria-hidden="true"
                      className="absolute bottom-0 right-0 top-0 w-1.5 cursor-col-resize touch-none opacity-0 transition-opacity hover:bg-primary/50 group-hover:opacity-100"
                      onPointerDown={(e) => startResize(e, tab.id)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateTab?.(tab.id, { customWidth: -1 });
                      }}
                    />
                  </>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {onToggleReaderMode && (
        <button
          type="button"
          onClick={onToggleReaderMode}
          aria-pressed={isReaderMode}
          title={isReaderMode ? 'Exit Notebook Reader view' : 'Combine chat and tabs into a readable notebook'}
          className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs font-medium shadow-sm transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] ${
            isReaderMode
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="max-sm:hidden">Read Notebook</span>
        </button>
      )}
      {noKeysConfigured ? (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'api' } }))}
          aria-label="Add API key"
          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-foreground/5 active:scale-95 max-sm:w-9 max-sm:justify-center max-sm:px-0"
        >
          <KeyRound className="h-4 w-4 sm:hidden" aria-hidden="true" />
          <span className="max-sm:hidden">Add API key</span>
        </button>
      ) : (
        <Select value={model} onValueChange={(value) => onModelChange(value as StudyModel)}>
          <SelectTrigger aria-label="Model" className="h-9 w-[120px] shrink-0 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground shadow-sm sm:w-[150px]">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">Google</SelectLabel>
              {STUDY_MODEL_OPTIONS.filter(o => o.provider === 'Google').map(option => (
                <SelectItem key={option.value} value={option.value} disabled={!keys.gemini} className="focus:bg-foreground/5 focus:text-foreground cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground mt-1">OpenAI</SelectLabel>
              {STUDY_MODEL_OPTIONS.filter(o => o.provider === 'OpenAI').map(option => (
                <SelectItem key={option.value} value={option.value} disabled={!keys.openai} className="focus:bg-foreground/5 focus:text-foreground cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground mt-1">Anthropic</SelectLabel>
              {STUDY_MODEL_OPTIONS.filter(o => o.provider === 'Anthropic').map(option => (
                <SelectItem key={option.value} value={option.value} disabled={!keys.anthropic} className="focus:bg-foreground/5 focus:text-foreground cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}










