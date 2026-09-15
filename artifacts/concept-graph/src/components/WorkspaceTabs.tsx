import React from 'react';
import { FileText, MessageSquareText, MessageCircle, X } from 'lucide-react';
import { WorkspaceTab } from '@/lib/db';

interface WorkspaceTabsProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
}

export function WorkspaceTabs({ tabs, activeTabId, onSwitch, onClose }: WorkspaceTabsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto p-2 bg-muted/30 border-b border-border min-h-[48px] scrollbar-none">
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSwitch(tab.id)}
            className={`
              group flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-all border shrink-0
              ${isActive 
                ? 'bg-card border-border shadow-sm text-foreground' 
                : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'}
            `}
          >
            {tab.type === 'chat' && <MessageCircle className="w-4 h-4 text-primary/70 shrink-0" />}
            {tab.type === 'concept' && <FileText className="w-4 h-4 text-primary/70 shrink-0" />}
            {tab.type === 'follow-up' && <MessageSquareText className="w-4 h-4 text-primary/70 shrink-0" />}
            
            <span className="text-sm font-medium whitespace-nowrap truncate max-w-[140px]">
              {tab.title}
            </span>
            
            {tab.type !== 'chat' && (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
