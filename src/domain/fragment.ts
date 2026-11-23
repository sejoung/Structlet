import { descendants, topmost, worldOrigin, worldRect } from './hierarchy';
import { getBox, indexDocument } from './lookup';
import type { Annotation, Collection, Container, Document, Edge, Endpoint, Id, Node, Point } from './model';
import type { ObjectChange, Patch } from './patch';

export interface Fragment {
  readonly nodes: readonly Node[];
  readonly containers: readonly Container[];
  readonly edges: readonly Edge[];
  readonly annotations: readonly Annotation[];
}

export function extractFragment(doc: Document, ids: Iterable<Id>): Fragment {
  const index = indexDocument(doc);
  const selected = new Set(ids);
  const roots = topmost(doc, [...selected].filter((id) => getBox(doc, id)));
  const inside = new Set<Id>();
  const nodes: Node[] = [];
  const containers: Container[] = [];
  const take = (id: Id, root: boolean) => {
    inside.add(id);
    const box = getBox(doc, id)!;
    const w = worldRect(doc, box);
    const fields = root ? { parentId: null, x: w.x, y: w.y } : {};
    const node = index.nodes.get(id);
    if (node) nodes.push({ ...node, ...fields });
    const container = index.containers.get(id);
    if (container) containers.push({ ...container, ...fields });
  };
  for (const root of roots) {
    take(root, true);
    for (const d of descendants(doc, root)) take(d, false);
  }
  const ok = (end: Endpoint) => end.kind === 'free' || inside.has(end.objectId);
  const edges = doc.edges.filter((e) => ok(e.source) && ok(e.target) && (selected.has(e.id) || e.source.kind === 'attached' || e.target.kind === 'attached'));
  const annotations = doc.annotations
    .filter((a) => selected.has(a.id) || (a.targetId !== null && inside.has(a.targetId)))
    .map((a) => (a.targetId !== null && !inside.has(a.targetId) ? { ...a, targetId: null } : a));
  containers.sort((a, b) => (a.parentId === null ? 0 : 1) - (b.parentId === null ? 0 : 1));
  return { nodes, containers, edges, annotations };
}

export function isEmptyFragment(f: Fragment): boolean {
  return f.nodes.length + f.containers.length + f.edges.length + f.annotations.length === 0;
}

export function pasteFragment(doc: Document, f: Fragment, newId: (c: Collection) => Id, offset: Point, parentId: Id | null): { patch: Patch; created: Id[] } {
  const origin = worldOrigin(doc, parentId);
  const map = new Map<Id, Id>();
  for (const c of f.containers) map.set(c.id, newId('containers'));
  for (const n of f.nodes) map.set(n.id, newId('nodes'));
  const created: Id[] = [];
  const changes: ObjectChange[] = [];
  const place = <T extends Node | Container>(box: T): T => {
    const id = map.get(box.id)!;
    if (box.parentId === null || !map.has(box.parentId)) {
      created.push(id);
      return { ...box, id, parentId, x: box.x + offset.x - origin.x, y: box.y + offset.y - origin.y, locked: false };
    }
    return { ...box, id, parentId: map.get(box.parentId)! };
  };
  for (const c of f.containers) changes.push({ collection: 'containers', id: map.get(c.id)!, before: null, after: place(c) });
  for (const n of f.nodes) changes.push({ collection: 'nodes', id: map.get(n.id)!, before: null, after: place(n) });
  const end = (e: Endpoint): Endpoint => (e.kind === 'free' ? { ...e, x: e.x + offset.x, y: e.y + offset.y } : { ...e, objectId: map.get(e.objectId) ?? e.objectId });
  for (const e of f.edges) {
    const id = newId('edges');
    changes.push({ collection: 'edges', id, before: null, after: { ...e, id, source: end(e.source), target: end(e.target), waypoints: e.waypoints.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })) } });
  }
  for (const a of f.annotations) {
    const id = newId('annotations');
    created.push(id);
    const targetId = a.targetId !== null ? (map.get(a.targetId) ?? null) : null;
    changes.push({ collection: 'annotations', id, before: null, after: { ...a, id, x: a.x + offset.x, y: a.y + offset.y, targetId } });
  }
  return { patch: { changes }, created };
}
