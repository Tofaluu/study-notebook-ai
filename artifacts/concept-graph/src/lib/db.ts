import { get, set } from 'idb-keyval';
import type { ConceptGraph, LectureSource } from '@workspace/api-client-react';

const GRAPH_KEY = 'concept-graph-latest';
const SOURCES_KEY = 'concept-graph-sources';

export async function saveSession(graph: ConceptGraph | null, sources: LectureSource[]) {
  if (graph) {
    await set(GRAPH_KEY, graph);
  }
  await set(SOURCES_KEY, sources);
}

export async function loadSession(): Promise<{ graph: ConceptGraph | null, sources: LectureSource[] }> {
  const [graph, sources] = await Promise.all([
    get<ConceptGraph>(GRAPH_KEY),
    get<LectureSource[]>(SOURCES_KEY),
  ]);
  
  return {
    graph: graph || null,
    sources: sources || []
  };
}

export async function clearSession() {
  await set(GRAPH_KEY, null);
  await set(SOURCES_KEY, []);
}
