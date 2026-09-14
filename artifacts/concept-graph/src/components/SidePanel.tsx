import React from 'react';
import { ConceptNode, PageReference, ConceptAnswer, ConceptGraph, LectureSource } from '@workspace/api-client-react';
import { openReferenceView } from '@/lib/viewer';
import { BookOpen, MessagesSquare, X, ExternalLink, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAskConceptQuestion } from '@workspace/api-client-react';

interface SidePanelProps {
  selectedNode: ConceptNode | null;
  onCloseNode: () => void;
  graph: ConceptGraph | null;
  sources: LectureSource[];
  onHighlightNodes: (nodeIds: string[]) => void;
}

export function SidePanel({ selectedNode, onCloseNode, graph, sources, onHighlightNodes }: SidePanelProps) {
  const [activeTab, setActiveTab] = React.useState<'node' | 'chat'>('node');
  
  // Switch to node tab when a node is selected
  React.useEffect(() => {
    if (selectedNode) {
      setActiveTab('node');
    }
  }, [selectedNode]);

  if (!selectedNode && activeTab === 'node') {
    if (!graph) return null;
    return (
      <div className="w-96 border-l border-border bg-card flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <BookOpen className="w-12 h-12 mb-4 opacity-20" />
        <p>Select a concept node to explore its summary and exact source references.</p>
        <button 
          onClick={() => setActiveTab('chat')}
          className="mt-6 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:brightness-95 transition-all text-sm font-medium"
        >
          Open Chat
        </button>
      </div>
    );
  }

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col h-full overflow-hidden shadow-2xl z-10 relative">
      <div className="flex items-center border-b border-border p-2">
        <button
          className={cn("flex-1 py-2 text-sm font-medium transition-colors border-b-2", activeTab === 'node' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          onClick={() => setActiveTab('node')}
        >
          Node Focus
        </button>
        <button
          className={cn("flex-1 py-2 text-sm font-medium transition-colors border-b-2", activeTab === 'chat' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          onClick={() => setActiveTab('chat')}
        >
          Q&A Chat
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'node' && selectedNode && (
          <NodeTab node={selectedNode} onClose={onCloseNode} />
        )}
        {activeTab === 'chat' && graph && (
          <ChatTab graph={graph} sources={sources} onHighlightNodes={onHighlightNodes} />
        )}
      </div>
    </div>
  );
}

function NodeTab({ node, onClose }: { node: ConceptNode; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-start justify-between bg-muted/30">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{node.kind}</div>
          <h2 className="text-xl font-bold font-serif leading-tight">{node.label}</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" /> Overview
          </h3>
          <p className="text-sm leading-relaxed text-card-foreground/90">{node.summary}</p>
        </section>

        {node.pageRefs && node.pageRefs.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-3">Source References</h3>
            <div className="space-y-3">
              {node.pageRefs.map((ref, idx) => (
                <div key={idx} className="border border-border rounded-lg bg-background p-3 text-sm group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-xs text-primary">{ref.sourceName}, p.{ref.pageNumber}</div>
                    <button 
                      onClick={() => openReferenceView(ref.sourceName, ref.pageNumber, ref.excerpt)}
                      className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Open full reference"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed line-clamp-4 hover:line-clamp-none transition-all">
                    "{ref.excerpt}"
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ChatTab({ graph, sources, onHighlightNodes }: { graph: ConceptGraph, sources: LectureSource[], onHighlightNodes: (nodeIds: string[]) => void }) {
  const [messages, setMessages] = React.useState<{role: 'user' | 'ai', content: string, answer?: ConceptAnswer}[]>([]);
  const [input, setInput] = React.useState('');
  
  const askMutation = useAskConceptQuestion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || askMutation.isPending) return;

    const query = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: query }]);

    askMutation.mutate({
      data: { question: query, graph, sources }
    }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, { role: 'ai', content: data.answer, answer: data }]);
        if (data.relatedNodeIds.length > 0) {
          onHighlightNodes(data.relatedNodeIds);
        }
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-4">
            <MessagesSquare className="w-10 h-10 mb-4 opacity-20" />
            <p className="text-sm">Ask a question about the concepts.</p>
            <p className="text-xs mt-2 opacity-60">The AI will use the graph and exact sources to answer.</p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={cn("flex flex-col max-w-[90%]", m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
            <div className={cn(
              "px-3 py-2 rounded-xl text-sm",
              m.role === 'user' ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted text-foreground rounded-bl-none"
            )}>
              {m.content}
            </div>
            
            {m.answer && m.answer.sourceRefs.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.answer.sourceRefs.map((ref, idx) => (
                  <button
                    key={idx}
                    onClick={() => openReferenceView(ref.sourceName, ref.pageNumber, ref.excerpt)}
                    className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center gap-1"
                  >
                    p.{ref.pageNumber} <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        
        {askMutation.isPending && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm mr-auto bg-muted px-3 py-2 rounded-xl rounded-bl-none">
            <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-border bg-background">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about these concepts..."
            className="w-full bg-muted border-none rounded-full pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            disabled={askMutation.isPending}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || askMutation.isPending}
            className="absolute right-1.5 p-1.5 bg-primary text-primary-foreground rounded-full disabled:opacity-50 hover:brightness-110 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
