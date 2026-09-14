import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Node as FlowNode,
  Edge as FlowEdge,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ConceptGraph, ConceptNode, ConceptEdge } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import { BookOpen, AlertCircle, Lightbulb } from 'lucide-react';

const kindIcons = {
  foundation: BookOpen,
  core: AlertCircle,
  application: Lightbulb,
};

const CustomNode = ({ data, selected }: any) => {
  const Icon = kindIcons[data.kind as keyof typeof kindIcons] || BookOpen;
  
  return (
    <div className={cn(
      "px-4 py-3 shadow-lg border-2 bg-card text-card-foreground flex items-center gap-3 w-[260px] transition-all",
      data.isHighlighted ? "border-primary shadow-primary/20 scale-105" : "border-border",
      selected && !data.isHighlighted ? "border-secondary-foreground shadow-xl scale-[1.02]" : ""
    )}>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2 !h-2 !border-none" />
      
      <div className={cn(
        "p-2 rounded-md",
        data.kind === 'foundation' ? "bg-secondary text-secondary-foreground" :
        data.kind === 'core' ? "bg-primary/20 text-primary-foreground" :
        "bg-accent text-accent-foreground"
      )}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{data.label}</div>
        <div className="text-xs text-muted-foreground capitalize">{data.kind}</div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-2 !h-2 !border-none" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

interface GraphViewProps {
  graph: ConceptGraph;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  highlightedNodeIds: string[];
}

// Simple DAG layout algorithm since we don't have dagre installed
function layoutNodes(nodes: ConceptNode[], edges: ConceptEdge[]) {
  const flowNodes: FlowNode[] = [];
  
  // Calculate in-degree for each node
  const inDegree: Record<string, number> = {};
  nodes.forEach(n => inDegree[n.id] = 0);
  edges.forEach(e => {
    if (inDegree[e.to] !== undefined) inDegree[e.to]++;
  });

  // Level assignment (BFS)
  const levels: Record<string, number> = {};
  const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  queue.forEach(id => levels[id] = 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels[current];
    
    const outgoing = edges.filter(e => e.from === current);
    for (const edge of outgoing) {
      if (levels[edge.to] === undefined || levels[edge.to] < currentLevel + 1) {
        levels[edge.to] = currentLevel + 1;
        queue.push(edge.to);
      }
    }
  }

  // Count nodes per level to center them horizontally
  const levelCounts: Record<number, number> = {};
  const levelCurrent: Record<number, number> = {};
  nodes.forEach(n => {
    const lvl = levels[n.id] || 0;
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
    levelCurrent[lvl] = 0;
  });

  const nodeWidth = 280;
  const nodeHeight = 120;
  const xSpacing = 40;
  const ySpacing = 60;

  return nodes.map(n => {
    const lvl = levels[n.id] || 0;
    const count = levelCounts[lvl];
    const currentIndex = levelCurrent[lvl];
    
    const totalWidth = count * nodeWidth + (count - 1) * xSpacing;
    const startX = -totalWidth / 2;
    
    const x = startX + currentIndex * (nodeWidth + xSpacing) + nodeWidth / 2;
    const y = lvl * (nodeHeight + ySpacing);
    
    levelCurrent[lvl]++;

    return {
      id: n.id,
      type: 'custom',
      position: { x, y },
      data: {
        ...n,
        isHighlighted: false // Will be dynamically set
      }
    };
  });
}

export function GraphView({ graph, selectedNodeId, onNodeSelect, highlightedNodeIds }: GraphViewProps) {
  const [nodes, setNodes] = React.useState<FlowNode[]>([]);
  const [edges, setEdges] = React.useState<FlowEdge[]>([]);

  // Initialize graph
  React.useEffect(() => {
    const flowNodes = layoutNodes(graph.nodes, graph.edges);
    const flowEdges = graph.edges.map(e => ({
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      animated: false,
      label: e.relationship,
      labelBgPadding: [8, 4] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: 'var(--color-background)', fillOpacity: 0.8 },
      style: { stroke: 'var(--color-border)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-border)' }
    }));
    
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graph]);

  // Update highlights dynamically
  React.useEffect(() => {
    setNodes(nds => nds.map(n => {
      const isHighlighted = highlightedNodeIds.includes(n.id);
      return {
        ...n,
        data: {
          ...n.data,
          isHighlighted
        }
      };
    }));

    setEdges(eds => eds.map(e => {
      const isHighlighted = highlightedNodeIds.includes(e.source) && highlightedNodeIds.includes(e.target);
      return {
        ...e,
        animated: isHighlighted,
        style: {
          stroke: isHighlighted ? 'var(--color-primary)' : 'var(--color-border)',
          strokeWidth: isHighlighted ? 3 : 2
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted ? 'var(--color-primary)' : 'var(--color-border)'
        }
      };
    }));
  }, [highlightedNodeIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: FlowNode) => {
    onNodeSelect(node.id);
  }, [onNodeSelect]);

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-muted/30"
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background color="var(--color-border)" gap={20} size={2} />
        <Controls className="!bg-card !border-border !shadow-md" />
      </ReactFlow>
    </div>
  );
}
