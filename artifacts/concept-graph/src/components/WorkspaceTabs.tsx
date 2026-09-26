import React, { useState, useRef, useEffect } from 'react';
import { FileText, MessageSquareText, MessageCircle, X, PanelLeft } from 'lucide-react';
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
}

export function WorkspaceTabs({ tabs, activeTabId, model, onSwitch, onClose, onModelChange, onReorderTabs, onUpdateTab, onToggleSidebar }: WorkspaceTabsProps) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabWidth, setEditingTabWidth] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetTabId: string, isChatTab: boolean) => {
    e.preventDefault();
    if (isChatTab || !draggedTabId || draggedTabId === targetTabId || !onReorderTabs) return;

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

    const newTabs = [...tabs];
    const [draggedTab] = newTabs.splice(draggedIndex, 1);
    newTabs.splice(targetIndex, 0, draggedTab);
    onReorderTabs(newTabs);
  };

  const startResize = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    
    const startX = e.clientX;
    const tabElement = (e.currentTarget as HTMLElement).closest('.tab-container') as HTMLElement;
    if (!tabElement) return;
    
    const startWidth = tabElement.offsetWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(100, Math.min(600, startWidth + (moveEvent.clientX - startX)));
      if (onUpdateTab) onUpdateTab(tabId, { customWidth: newWidth });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const submitEdit = (tabId: string, fallbackTitle: string) => {
    if (onUpdateTab) {
      onUpdateTab(tabId, { customName: editTitle.trim() || fallbackTitle });
    }
    setEditingTabId(null);
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/30 border-b border-border min-h-[48px]">
      <div className="flex items-center justify-center mr-1">
        <button onClick={onToggleSidebar} className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors" aria-label="Toggle Sidebar">
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const displayTitle = tab.customName || tab.title;
          const isChatTab = tab.type === 'chat';
          
          return (
            <div
              key={tab.id}
              title={displayTitle}
              onClick={() => onSwitch(tab.id)}
              draggable={!isChatTab}
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id, isChatTab)}
              onDragEnd={() => setDraggedTabId(null)}
              onDoubleClick={(e) => {
                if (!isChatTab) {
                  setEditingTabWidth((e.currentTarget as HTMLElement).offsetWidth);
                  setEditingTabId(tab.id);
                  setEditTitle(displayTitle);
                }
              }}
              className={`
                tab-container relative group flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors border shrink-0
                ${isActive 
                  ? 'bg-card border-border shadow-sm text-foreground' 
                  : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'}
                ${draggedTabId === tab.id ? 'opacity-50' : 'opacity-100'}
              `}
              style={tab.customWidth && tab.customWidth > 0 ? { width: tab.customWidth } : (editingTabId === tab.id && editingTabWidth ? { width: editingTabWidth } : {})}
            >
              {isChatTab && <MessageCircle className="w-4 h-4 text-primary/70 shrink-0" />}
              {tab.type === 'concept' && <FileText className="w-4 h-4 text-primary/70 shrink-0" />}
              {tab.type === 'follow-up' && <MessageSquareText className="w-4 h-4 text-primary/70 shrink-0" />}
              
              {editingTabId === tab.id ? (
                <input 
                  autoFocus
                  className="flex-1 min-w-0 bg-background border border-border rounded px-1 py-0.5 text-sm outline-none"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => submitEdit(tab.id, displayTitle)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitEdit(tab.id, displayTitle);
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className="text-sm font-medium whitespace-nowrap truncate flex-1 min-w-0"
                  style={tab.customWidth === undefined || tab.customWidth === 0 ? { maxWidth: '140px' } : {}}
                >
                  {displayTitle}
                </span>
              )}
              
              {!isChatTab && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-all shrink-0 ml-1"
                    aria-label="Close tab"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => startResize(e, tab.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (onUpdateTab) onUpdateTab(tab.id, { customWidth: -1 });
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      <Select value={model} onValueChange={(value) => onModelChange(value as StudyModel)}>
        <SelectTrigger className="h-8 w-[150px] shrink-0 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/30">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground">Google</SelectLabel>
            {STUDY_MODEL_OPTIONS.filter(o => o.provider === 'Google').map(option => (
              <SelectItem key={option.value} value={option.value} className="focus:bg-primary/10 focus:text-primary cursor-pointer text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground mt-1">OpenAI</SelectLabel>
            {STUDY_MODEL_OPTIONS.filter(o => o.provider === 'OpenAI').map(option => (
              <SelectItem key={option.value} value={option.value} className="focus:bg-primary/10 focus:text-primary cursor-pointer text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground mt-1">Anthropic</SelectLabel>
            {STUDY_MODEL_OPTIONS.filter(o => o.provider === 'Anthropic').map(option => (
              <SelectItem key={option.value} value={option.value} className="focus:bg-primary/10 focus:text-primary cursor-pointer text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}


