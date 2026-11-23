import { descendants, topmost, worldOrigin, worldRect, wouldCreateCycle } from './hierarchy';
import { findCollection, getBox, indexDocument } from './lookup';
import type {
  Annotation,
  Collection,
  CollectionItem,
  Container,
  Document,
  Edge,
  Endpoint,
  Id,
  Node,
  NodeVariant,
  Point,
  Rect,
} from './model';
import { applyPatch, composePatches, EMPTY_PATCH, type ObjectChange, type Patch } from './patch';


export class CommandError extends Error {}

function update<C extends Collection>(collection: C, before: CollectionItem[C], after: CollectionItem[C]): ObjectChange {
  return { collection, id: before.id, before, after } as ObjectChange;
}

function insert<C extends Collection>(collection: C, after: CollectionItem[C]): ObjectChange {
  return { collection, id: after.id, before: null, after } as ObjectChange;
}

function remove<C extends Collection>(doc: Document, collection: C, before: CollectionItem[C]): ObjectChange {
  const index = (doc[collection] as readonly { id: Id }[]).findIndex((o) => o.id === before.id);
  return { collection, id: before.id, before, after: null, index } as ObjectChange;
}

export function sequence(doc: Document, ...steps: ((d: Document) => Patch)[]): Patch {
  let current = doc;
  const patches: Patch[] = [];
  for (const step of steps) {
    const patch = step(current);
    patches.push(patch);
    current = applyPatch(current, patch);
  }
  return composePatches(...patches);
}

function assertParent(doc: Document, parentId: Id | null): void {
  if (parentId !== null && !indexDocument(doc).containers.has(parentId)) {
    throw new CommandError(`Unknown container ${parentId}`);
  }
}

function assertNewId(doc: Document, id: Id): void {
  if (findCollection(doc, id) !== null) throw new CommandError(`Duplicate id ${id}`);
}

export interface NewNode {
  id: Id;
  serviceId: string;
  label: string;
  parentId: Id | null;
  at: Point;
  width: number;
  height: number;
  variant?: NodeVariant;
}

export function addNode(doc: Document, init: NewNode): Patch {
  assertNewId(doc, init.id);
  assertParent(doc, init.parentId);
  const o = worldOrigin(doc, init.parentId);
  const node: Node = {
    id: init.id,
    serviceId: init.serviceId,
    label: init.label,
    parentId: init.parentId,
    x: init.at.x - o.x,
    y: init.at.y - o.y,
    width: init.width,
    height: init.height,
    locked: false,
    variant: init.variant ?? 'icon',
  };
  return { changes: [insert('nodes', node)] };
}

export interface NewContainer extends Omit<Container, 'parentId' | 'x' | 'y' | 'locked'> {
  parentId: Id | null;
  rect: Rect;
}

export function addContainer(doc: Document, init: NewContainer): Patch {
  assertNewId(doc, init.id);
  assertParent(doc, init.parentId);
  const o = worldOrigin(doc, init.parentId);
  const { rect, ...rest } = init;
  const container: Container = { ...rest, x: rect.x - o.x, y: rect.y - o.y, width: rect.width, height: rect.height, locked: false };
  return { changes: [insert('containers', container)] };
}

function assertEndpoint(doc: Document, end: Endpoint): void {
  if (end.kind === 'attached' && !getBox(doc, end.objectId)) throw new CommandError(`Unknown endpoint ${end.objectId}`);
}

export function addEdge(doc: Document, edge: Edge): Patch {
  assertNewId(doc, edge.id);
  assertEndpoint(doc, edge.source);
  assertEndpoint(doc, edge.target);
  return { changes: [insert('edges', edge)] };
}

export function addAnnotation(doc: Document, annotation: Annotation): Patch {
  assertNewId(doc, annotation.id);
  return { changes: [insert('annotations', annotation)] };
}

type Editable<C extends Collection> = Partial<Omit<CollectionItem[C], 'id' | 'parentId'>>;

export function updateObject<C extends Collection>(doc: Document, collection: C, id: Id, fields: Editable<C>): Patch {
  const before = indexDocument(doc)[collection].get(id) as CollectionItem[C] | undefined;
  if (!before) throw new CommandError(`Unknown ${collection} ${id}`);
  if ('parentId' in fields) throw new CommandError('Use setParent to change parentId');
  if (collection === 'edges') {
    const f = fields as Partial<Edge>;
    if (f.source) assertEndpoint(doc, f.source);
    if (f.target) assertEndpoint(doc, f.target);
  }
  const after = { ...before, ...fields } as CollectionItem[C];
  return { changes: [update(collection, before, after)] };
}

export function setTitle(doc: Document, title: string): Patch {
  if (title === doc.title) return EMPTY_PATCH;
  return { changes: [{ collection: 'title', before: doc.title, after: title }] };
}

function endpointObject(end: Endpoint): Id | null {
  return end.kind === 'attached' ? end.objectId : null;
}

function shiftEndpoint(end: Endpoint, dx: number, dy: number): Endpoint {
  return end.kind === 'free' ? { ...end, x: end.x + dx, y: end.y + dy } : end;
}

export function moveBy(doc: Document, ids: Iterable<Id>, dx: number, dy: number): Patch {
  if (dx === 0 && dy === 0) return EMPTY_PATCH;
  const index = indexDocument(doc);
  const selected = new Set(ids);
  const changes: ObjectChange[] = [];
  const moved = new Set<Id>();
  for (const id of topmost(doc, [...selected].filter((i) => index.nodes.has(i) || index.containers.has(i)))) {
    const node = index.nodes.get(id);
    const container = index.containers.get(id);
    const box = node ?? container;
    if (!box || box.locked) continue;
    if (node) changes.push(update('nodes', node, { ...node, x: node.x + dx, y: node.y + dy }));
    if (container) {
      changes.push(update('containers', container, { ...container, x: container.x + dx, y: container.y + dy }));
      for (const d of descendants(doc, id)) moved.add(d);
    }
    moved.add(id);
  }
  for (const a of doc.annotations) {
    if (selected.has(a.id) || (a.targetId !== null && moved.has(a.targetId))) {
      changes.push(update('annotations', a, { ...a, x: a.x + dx, y: a.y + dy }));
    }
  }
  for (const e of doc.edges) {
    const s = endpointObject(e.source);
    const t = endpointObject(e.target);
    const ends = [s, t].filter((x): x is Id => x !== null);
    const whole = selected.has(e.id) || (ends.length > 0 && ends.every((id) => moved.has(id)));
    if (!whole) continue;
    const waypoints = e.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    const next: Edge = {
      ...e,
      waypoints,
      source: shiftEndpoint(e.source, dx, dy),
      target: shiftEndpoint(e.target, dx, dy),
    };
    if (waypoints.length > 0 || e.source.kind === 'free' || e.target.kind === 'free') changes.push(update('edges', e, next));
  }
  return { changes };
}

export function setParent(doc: Document, ids: Iterable<Id>, parentId: Id | null): Patch {
  assertParent(doc, parentId);
  const index = indexDocument(doc);
  const target = worldOrigin(doc, parentId);
  const changes: ObjectChange[] = [];
  for (const id of ids) {
    const node = index.nodes.get(id);
    const container = index.containers.get(id);
    const box = node ?? container;
    if (!box || box.parentId === parentId) continue;
    if (container && wouldCreateCycle(doc, id, parentId)) {
      throw new CommandError(`Moving ${id} into ${parentId} would create a cycle`);
    }
    const w = worldRect(doc, box);
    const fields = { parentId, x: w.x - target.x, y: w.y - target.y };
    if (node) changes.push(update('nodes', node, { ...node, ...fields }));
    if (container) changes.push(update('containers', container, { ...container, ...fields }));
  }
  return { changes };
}

export function setBounds(doc: Document, id: Id, rect: Rect): Patch {
  const index = indexDocument(doc);
  const box = getBox(doc, id);
  if (!box) throw new CommandError(`Unknown box ${id}`);
  const o = worldOrigin(doc, box.parentId);
  const x = rect.x - o.x;
  const y = rect.y - o.y;
  const width = Math.max(rect.width, 16);
  const height = Math.max(rect.height, 16);
  const node = index.nodes.get(id);
  if (node) return { changes: [update('nodes', node, { ...node, x, y, width, height })] };
  const container = index.containers.get(id)!;
  const changes: ObjectChange[] = [update('containers', container, { ...container, x, y, width, height })];
  const dx = x - container.x;
  const dy = y - container.y;
  if (dx !== 0 || dy !== 0) {
    for (const childId of index.children.get(id) ?? []) {
      const n = index.nodes.get(childId);
      const c = index.containers.get(childId);
      if (n) changes.push(update('nodes', n, { ...n, x: n.x - dx, y: n.y - dy }));
      if (c) changes.push(update('containers', c, { ...c, x: c.x - dx, y: c.y - dy }));
    }
  }
  return { changes };
}

export function deleteObjects(doc: Document, ids: Iterable<Id>): Patch {
  const index = indexDocument(doc);
  const doomed = new Set<Id>();
  for (const id of ids) {
    if (!findCollection(doc, id)) continue;
    doomed.add(id);
    if (index.containers.has(id)) for (const d of descendants(doc, id)) doomed.add(d);
  }
  const changes: ObjectChange[] = [];
  for (const e of doc.edges) {
    const s = endpointObject(e.source);
    const t = endpointObject(e.target);
    if (doomed.has(e.id) || (s !== null && doomed.has(s)) || (t !== null && doomed.has(t))) changes.push(remove(doc, 'edges', e));
  }
  for (const a of doc.annotations) {
    if (doomed.has(a.id)) changes.push(remove(doc, 'annotations', a));
    else if (a.targetId !== null && doomed.has(a.targetId)) changes.push(update('annotations', a, { ...a, targetId: null }));
  }
  for (const n of doc.nodes) if (doomed.has(n.id)) changes.push(remove(doc, 'nodes', n));
  for (const c of doc.containers) if (doomed.has(c.id)) changes.push(remove(doc, 'containers', c));
  return { changes: removalsLast(changes) };
}

export function removalsLast(changes: readonly ObjectChange[]): ObjectChange[] {
  const updates = changes.filter((c) => c.after !== null);
  const removals = changes.filter((c) => c.after === null).sort((a, b) => a.collection.localeCompare(b.collection) || (b.index ?? 0) - (a.index ?? 0));
  return [...updates, ...removals];
}

export function duplicate(doc: Document, ids: Iterable<Id>, newId: (collection: Collection) => Id, offset: Point): { patch: Patch; created: Id[] } {
  const index = indexDocument(doc);
  const selected = [...new Set(ids)];
  const roots = topmost(doc, selected.filter((id) => getBox(doc, id)));
  const map = new Map<Id, Id>();
  const changes: ObjectChange[] = [];
  const created: Id[] = [];
  const copyBox = (id: Id, isRoot: boolean) => {
    const fresh = newId(index.nodes.has(id) ? 'nodes' : 'containers');
    map.set(id, fresh);
    const shift = isRoot ? offset : { x: 0, y: 0 };
    const node = index.nodes.get(id);
    const container = index.containers.get(id);
    const parentOf = (p: Id | null) => (p !== null && map.has(p) ? map.get(p)! : p);
    if (node) changes.push(insert('nodes', { ...node, id: fresh, parentId: parentOf(node.parentId), x: node.x + shift.x, y: node.y + shift.y, locked: false }));
    if (container) changes.push(insert('containers', { ...container, id: fresh, parentId: parentOf(container.parentId), x: container.x + shift.x, y: container.y + shift.y, locked: false }));
    if (isRoot) created.push(fresh);
  };
  for (const root of roots) {
    copyBox(root, true);
    for (const d of descendants(doc, root)) copyBox(d, false);
  }
  const copyEnd = (end: Endpoint): Endpoint | null => {
    if (end.kind === 'free') return { ...end, x: end.x + offset.x, y: end.y + offset.y };
    const id = map.get(end.objectId);
    return id ? { ...end, objectId: id } : null;
  };
  for (const e of doc.edges) {
    const source = copyEnd(e.source);
    const target = copyEnd(e.target);
    const attachedInside = e.source.kind === 'attached' || e.target.kind === 'attached';
    if (!source || !target || (!attachedInside && !selected.includes(e.id))) continue;
    const fresh = newId('edges');
    changes.push(insert('edges', { ...e, id: fresh, source, target, waypoints: e.waypoints.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })) }));
    if (selected.includes(e.id)) created.push(fresh);
  }
  for (const a of doc.annotations) {
    if (!selected.includes(a.id)) continue;
    const fresh = newId('annotations');
    const targetId = a.targetId !== null ? (map.get(a.targetId) ?? a.targetId) : null;
    changes.push(insert('annotations', { ...a, id: fresh, x: a.x + offset.x, y: a.y + offset.y, targetId }));
    created.push(fresh);
  }
  return { patch: { changes }, created };
}

export function wrapInContainer(
  doc: Document,
  ids: Iterable<Id>,
  init: Omit<NewContainer, 'rect' | 'parentId'>,
  padding: number,
): Patch {
  const boxes = topmost(doc, [...ids].filter((id) => getBox(doc, id)));
  if (boxes.length === 0) throw new CommandError('Nothing to wrap');
  const rects = boxes.map((id) => worldRect(doc, getBox(doc, id)!));
  const minX = Math.min(...rects.map((r) => r.x)) - padding;
  const minY = Math.min(...rects.map((r) => r.y)) - padding - 16;
  const maxX = Math.max(...rects.map((r) => r.x + r.width)) + padding;
  const maxY = Math.max(...rects.map((r) => r.y + r.height)) + padding + 16;
  const parents = new Set(boxes.map((id) => getBox(doc, id)!.parentId));
  const parentId = parents.size === 1 ? [...parents][0]! : null;
  return sequence(
    doc,
    (d) => addContainer(d, { ...init, parentId, rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } }),
    (d) => setParent(d, boxes, init.id),
  );
}

export function moveInto(doc: Document, ids: readonly Id[], dx: number, dy: number, parents: ReadonlyMap<Id, Id | null>): Patch {
  return sequence(
    doc,
    (d) => moveBy(d, ids, dx, dy),
    (d) => {
      const byParent = new Map<Id | null, Id[]>();
      for (const [id, parent] of parents) {
        const box = getBox(d, id);
        if (!box || box.locked || box.parentId === parent) continue;
        if (parent !== null && !indexDocument(d).containers.has(parent)) continue;
        if (indexDocument(d).containers.has(id) && wouldCreateCycle(d, id, parent)) continue;
        const list = byParent.get(parent) ?? [];
        list.push(id);
        byParent.set(parent, list);
      }
      return composePatches(...[...byParent].map(([parent, list]) => setParent(d, list, parent)));
    },
  );
}

export function moveEach(doc: Document, deltas: ReadonlyMap<Id, Point>): Patch {
  return sequence(doc, ...[...deltas].map(([id, d]) => (current: Document) => moveBy(current, [id], d.x, d.y)));
}
