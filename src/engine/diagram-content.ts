import { ancestors, indexDocument, type Document, type Edge, type Id } from '../domain';

export const DIAGRAM_CONTENTS = ['all', 'flow', 'operations'] as const;
export type DiagramContent = (typeof DIAGRAM_CONTENTS)[number];

export function availableDiagramContents(doc: Document): readonly DiagramContent[] {
  if (!doc.edges.some((edge) => edge.relationship)) return ['all'];
  return doc.edges.some((edge) => !edge.relationship) ? DIAGRAM_CONTENTS : ['all', 'operations'];
}

export function projectDiagramContent(doc: Document, content: DiagramContent): Document {
  if (content === 'all') return doc;
  const relationships = doc.edges.filter((edge) => edge.relationship);
  if (relationships.length === 0 || (content === 'flow' && relationships.length === doc.edges.length)) return doc;

  const flow = content === 'flow';
  const edges = flow ? doc.edges.filter((edge) => !edge.relationship) : relationships;
  const visible = endpointIds(edges);
  if (flow) {
    const operations = endpointIds(relationships);
    const { children } = indexDocument(doc);
    for (const { id } of doc.nodes) if (!operations.has(id)) visible.add(id);
    for (const { id } of doc.containers) if (!children.has(id) && !operations.has(id)) visible.add(id);
  }
  const retained = new Set(visible);
  for (const id of visible) for (const parent of ancestors(doc, id)) retained.add(parent);
  for (const { id } of edges) retained.add(id);
  return {
    ...doc,
    nodes: doc.nodes.filter(({ id }) => retained.has(id)),
    containers: doc.containers.filter(({ id }) => retained.has(id)),
    edges,
    annotations: doc.annotations.filter(({ targetId }) => targetId === null ? flow : retained.has(targetId)),
  };
}

function endpointIds(edges: readonly Edge[]): Set<Id> {
  const ids = new Set<Id>();
  for (const { source, target } of edges) {
    if (source.kind === 'attached') ids.add(source.objectId);
    if (target.kind === 'attached') ids.add(target.objectId);
  }
  return ids;
}
