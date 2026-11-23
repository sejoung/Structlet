import { indexDocument, type Container, type Document, type Edge, type Endpoint, type Id, type Node } from '../domain';
import type { Appearance } from './appearance';
import type { LayoutMode } from './layout/arrange';
import { layoutDocument } from './layout/document';
import { computeScene } from './scene';
import { measureText } from './text';

export interface DiagramView {
  readonly folded: ReadonlySet<Id>;
  readonly layout: LayoutMode | null;
  label(area: Container, services: number): readonly [string, string];
}

/** Build a temporary diagram for rendering. It must never replace the editable document. */
export function computeDiagramView(doc: Document, appearance: Appearance, view: DiagramView) {
  if (view.folded.size === 0) return computeScene(doc, appearance);
  const index = indexDocument(doc);
  const representatives = new Map<Id, Id>();
  const summaries = new Map<Id, Container>();
  const counts = new Map<Id, number>();
  const walk = (parent: Id | null, foldedParent?: Id) => {
    for (const id of index.children.get(parent) ?? []) {
      if (foldedParent) representatives.set(id, foldedParent);
      const area = index.containers.get(id);
      if (area) {
        const own = !foldedParent && view.folded.has(id) && !!index.children.get(id)?.length;
        if (own) summaries.set(id, area);
        walk(id, foldedParent ?? (own ? id : undefined));
      } else if (foldedParent) counts.set(foldedParent, (counts.get(foldedParent) ?? 0) + 1);
    }
  };
  walk(null);
  if (summaries.size === 0) return computeScene(doc, appearance);

  const lift = (end: Endpoint): Endpoint => {
    if (end.kind !== 'attached') return end;
    const id = representatives.get(end.objectId) ?? end.objectId;
    return summaries.has(id) ? { kind: 'attached', objectId: id, side: 'auto', offset: null } : end;
  };
  const edges: Edge[] = [];
  const bundles = new Map<string, { at: number; count: number; label: string }>();
  for (const edge of doc.edges) {
    const source = lift(edge.source);
    const target = lift(edge.target);
    if (source === edge.source && target === edge.target) {
      edges.push(edge);
      continue;
    }
    if (source.kind === 'attached' && target.kind === 'attached' && source.objectId === target.objectId) continue;
    const key = JSON.stringify([endpointKey(source), endpointKey(target), edge.label, edge.style.shape, edge.style.dashed, edge.style.arrow]);
    const bundle = bundles.get(key);
    if (bundle) {
      bundle.count++;
      edges[bundle.at] = { ...edges[bundle.at]!, label: bundle.label ? `${bundle.label} × ${bundle.count}` : `× ${bundle.count}` };
    } else {
      bundles.set(key, { at: edges.length, count: 1, label: edge.label });
      edges.push({ ...edge, source, target, routingMode: 'auto', waypoints: [] });
    }
  }

  const summaryNodes: Node[] = [...summaries.values()].map((area) => {
    const lines = view.label(area, counts.get(area.id) ?? 0);
    const width = Math.max(172, Math.min(290, Math.ceil(Math.max(...lines.map((line) => measureText(line, 12))) + 68)));
    return { id: area.id, serviceId: '', label: lines.join('\n'), parentId: area.parentId, x: area.x, y: area.y, width, height: 58, locked: false, variant: 'box' };
  });
  const containers = doc.containers.filter((area) => !summaries.has(area.id) && !representatives.has(area.id));
  const nodes = [...doc.nodes.filter((node) => !representatives.has(node.id)), ...summaryNodes];
  const projected: Document = {
    ...doc, containers, nodes, edges,
    annotations: doc.annotations.filter((note) => !note.targetId || !representatives.has(note.targetId)),
  };
  const arranged = view.layout ? layoutDocument({
    ...projected, containers: containers.map((area) => ({ ...area, locked: false })),
    nodes: nodes.map((node) => ({ ...node, locked: false })),
  }, view.layout) : projected;
  return computeScene(arranged, appearance, summaries);
}

function endpointKey(end: Endpoint) {
  return end.kind === 'attached' ? end.objectId : [end.x, end.y];
}
