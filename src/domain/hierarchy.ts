import { indexDocument } from './lookup';
import type { Container, Document, Id, Node, Point, Rect } from './model';

/** Container ids from the direct parent up to the root. Stops on cycles. */
export function ancestors(doc: Document, id: Id): Id[] {
  const index = indexDocument(doc);
  const start = index.nodes.get(id) ?? index.containers.get(id);
  const result: Id[] = [];
  const seen = new Set<Id>([id]);
  let parent = start?.parentId ?? null;
  while (parent !== null && !seen.has(parent)) {
    const container = index.containers.get(parent);
    if (!container) break;
    result.push(parent);
    seen.add(parent);
    parent = container.parentId;
  }
  return result;
}

/** All nodes and containers below a container, depth first. */
export function descendants(doc: Document, id: Id): Id[] {
  const index = indexDocument(doc);
  const result: Id[] = [];
  const seen = new Set<Id>([id]);
  const visit = (parent: Id) => {
    for (const child of index.children.get(parent) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      result.push(child);
      visit(child);
    }
  };
  visit(id);
  return result;
}

/** Number of container ancestors. */
export function depth(doc: Document, id: Id): number {
  return ancestors(doc, id).length;
}

/** World position of a container's local origin, or (0,0) for `null`. */
export function worldOrigin(doc: Document, parentId: Id | null): Point {
  let x = 0;
  let y = 0;
  if (parentId === null) return { x, y };
  const index = indexDocument(doc);
  const chain = [parentId, ...ancestors(doc, parentId)];
  for (const cid of chain) {
    const c = index.containers.get(cid);
    if (!c) break;
    x += c.x;
    y += c.y;
  }
  return { x, y };
}

export function worldRect(doc: Document, box: Node | Container): Rect {
  const o = worldOrigin(doc, box.parentId);
  return { x: o.x + box.x, y: o.y + box.y, width: box.width, height: box.height };
}

/** True when making `parentId` the parent of `id` would create a cycle. */
export function wouldCreateCycle(doc: Document, id: Id, parentId: Id | null): boolean {
  if (parentId === null) return false;
  if (parentId === id) return true;
  return ancestors(doc, parentId).includes(id);
}

/** Ids of containers that sit on a parent cycle. */
export function findParentCycles(doc: Document): Id[] {
  const index = indexDocument(doc);
  const onCycle = new Set<Id>();
  for (const start of doc.containers) {
    const path: Id[] = [];
    const seen = new Set<Id>();
    let current: Container | undefined = start;
    while (current) {
      if (seen.has(current.id)) {
        const from = path.indexOf(current.id);
        for (const id of path.slice(from)) onCycle.add(id);
        break;
      }
      seen.add(current.id);
      path.push(current.id);
      current = current.parentId === null ? undefined : index.containers.get(current.parentId);
    }
  }
  return [...onCycle];
}

/**
 * Keeps only the topmost ids of a selection: an object whose ancestor is also
 * selected moves with that ancestor and must not be moved twice.
 */
export function topmost(doc: Document, ids: Iterable<Id>): Id[] {
  const set = new Set(ids);
  return [...set].filter((id) => !ancestors(doc, id).some((a) => set.has(a)));
}
