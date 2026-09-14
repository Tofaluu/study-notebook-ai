import React, { useState, useEffect } from 'react';
import { ConceptGraph, LectureSource } from '@workspace/api-client-react';
import { loadSession, saveSession } from '@/lib/db';
import { WorkspaceSidebar } from '@/components/WorkspaceSidebar';
import { GraphView } from '@/components/GraphView';
import { SidePanel } from '@/components/SidePanel';
import { Lightbulb, Loader2 } from 'lucide-react';

export default function Home() {
  const [sources, setSources] = useState<LectureSource[]>([]);
  const [graph, setGraph] = useState<ConceptGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Load session on mount
  useEffect(() => {
    loadSession().then(data => {
      if (data.sources) setSources(data.sources);
      if (data.graph) setGraph(data.graph);
      setIsInitializing(false);
    });
  }, []);

  // Save session when graph or sources change
  useEffect(() => {
    if (!isInitializing) {
      saveSession(graph, sources);
    }
  }, [graph, sources, isInitializing]);

  const handleGraphGenerated = (newGraph: ConceptGraph) => {
    setGraph(newGraph);
    setSelectedNodeId(null);
    setHighlightedNodeIds([]);
  };

  const handleNodeSelect = (nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    
    if (!nodeId || !graph) {
      setHighlightedNodeIds([]);
      return;
    }

    // Highlight the selected node and its prerequisites
    const highlighted = new Set<string>();
    highlighted.add(nodeId);
    
    // Simple BFS for prerequisites (edges directed FROM prerequisite TO dependent, wait - let's check the API).
    // Usually a dependency graph points from Prerequisite -> Concept.
    // So to find prerequisites of `nodeId`, we look for edges where `to === nodeId`.
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const incomingEdges = graph.edges.filter(e => e.to === current);
      for (const edge of incomingEdges) {
        if (!highlighted.has(edge.from)) {
          highlighted.add(edge.from);
          queue.push(edge.from);
        }
      }
    }
    
    setHighlightedNodeIds(Array.from(highlighted));
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedNode = selectedNodeId && graph 
    ? graph.nodes.find(n => n.id === selectedNodeId) || null 
    : null;

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden font-sans">
      <WorkspaceSidebar 
        sources={sources}
        setSources={setSources}
        onGraphGenerated={handleGraphGenerated}
      />
      
      <main className="flex-1 relative flex">
        <div className="flex-1 relative h-full">
          {graph ? (
            <>
              <div className="absolute top-4 left-4 z-10 max-w-sm bg-card border border-border p-4 rounded-xl shadow-lg">
                <h2 className="font-bold text-lg leading-tight flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" /> 
                  {graph.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3 hover:line-clamp-none transition-all">{graph.overview}</p>
              </div>
              <GraphView 
                graph={graph} 
                selectedNodeId={selectedNodeId}
                onNodeSelect={handleNodeSelect}
                highlightedNodeIds={highlightedNodeIds}
              />
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground bg-[radial-gradient(circle_at_center,var(--color-muted)_0%,transparent_100%)] opacity-60">
              <div className="w-24 h-24 bg-card border border-border rounded-2xl shadow-xl flex items-center justify-center mb-6 -rotate-6">
                <Lightbulb className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Knowledge Mapping</h2>
              <p className="max-w-md">Upload lecture slides or PDFs on the left, then click Generate Graph to visually explore concept prerequisites and dependencies.</p>
            </div>
          )}
        </div>

        <SidePanel 
          selectedNode={selectedNode}
          onCloseNode={() => handleNodeSelect(null)}
          graph={graph}
          sources={sources}
          onHighlightNodes={(nodeIds) => setHighlightedNodeIds(nodeIds)}
        />
      </main>
    </div>
  );
}
