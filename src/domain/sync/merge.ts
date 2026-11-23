import type { Collection, Container, Document, Endpoint, Id, Node } from '../model';

export type MergeSide = 'local' | 'remote';

export interface Conflict {
  readonly key: string;
  readonly collection: Collection | 'title';
  readonly id?: Id;
  readonly field?: string;
  readonly local: unknown;
  readonly remote: unknown;
}

export interface Merged {
  readonly document: Document;
  readonly conflicts: Conflict[];
}

type Choose = (conflict: Conflict) => MergeSide | undefined;
type Item = Record<string, unknown> & { id: Id };

const GROUPS: Record<string, readonly string[]> = {
  x: ['x', 'y'],
  y: ['x', 'y'],
  width: ['width', 'height'],
  height: ['width', 'height'],
  routingMode: ['routingMode', 'waypoints'],
  waypoints: ['routingMode', 'waypoints'],
};
const GROUP_NAMES: Record<string, string> = { x: 'position', width: 'size', routingMode: 'route' };
const COLLECTIONS: Collection[] = ['containers', 'nodes', 'edges', 'annotations'];

export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  if (keys.length !== Object.keys(right).filter((key) => right[key] !== undefined).length) return false;
  return keys.every((key) => same(left[key], right[key]));
}

function resolve<T>(base: T, local: T, remote: T, conflict: () => Omit<Conflict, 'local' | 'remote'>, choose: Choose, conflicts: Conflict[]): T {
  if (same(local, remote) || same(base, remote)) return local;
  if (same(base, local)) return remote;
  const found = { ...conflict(), local, remote };
  conflicts.push(found);
  return choose(found) === 'remote' ? remote : local;
}

function mergeFields(collection: Collection, base: Item, local: Item, remote: Item, choose: Choose, conflicts: Conflict[]): Item {
  const out: Item = { ...local };
  const done = new Set<string>();
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    if (key === 'id' || done.has(key)) continue;
    const fields = GROUPS[key] ?? [key];
    fields.forEach((f) => done.add(f));
    const pick = (item: Item) => Object.fromEntries(fields.map((f) => [f, item[f]]));
    const field = GROUP_NAMES[fields[0]!] ?? fields[0]!;
    const value = resolve(pick(base), pick(local), pick(remote), () => ({ key: `${collection}:${local.id}:${field}`, collection, id: local.id, field }), choose, conflicts);
    Object.assign(out, value);
  }
  return out;
}

function mergeList(collection: Collection, base: readonly Item[], local: readonly Item[], remote: readonly Item[], choose: Choose, conflicts: Conflict[]): Item[] {
  const b = new Map(base.map((o) => [o.id, o]));
  const r = new Map(remote.map((o) => [o.id, o]));
  const l = new Map(local.map((o) => [o.id, o]));
  const ids = [...local.map((o) => o.id), ...remote.map((o) => o.id).filter((id) => !l.has(id))];
  const out: Item[] = [];
  for (const id of ids) {
    const was = b.get(id);
    const mine = l.get(id);
    const theirs = r.get(id);
    if (mine && theirs) {
      out.push(mergeFields(collection, was ?? mine, mine, theirs, choose, conflicts));
      continue;
    }
    const kept = mine ?? theirs!;
    if (!was) {
      out.push(kept);
      continue;
    }
    if (same(was, kept)) continue;
    const found: Conflict = { key: `${collection}:${id}`, collection, id, local: mine, remote: theirs };
    conflicts.push(found);
    const side = choose(found) ?? 'local';
    const chosen = side === 'local' ? mine : theirs;
    if (chosen) out.push(chosen);
  }
  return out;
}

function originIn(containers: ReadonlyMap<Id, Container>, id: Id | null, guard = 0): { x: number; y: number } {
  if (id === null || guard > 64) return { x: 0, y: 0 };
  const c = containers.get(id);
  if (!c) return { x: 0, y: 0 };
  const p = originIn(containers, c.parentId, guard + 1);
  return { x: p.x + c.x, y: p.y + c.y };
}

function repair(doc: Document, base: Document, local: Document, remote: Document): Document {
  const known = new Map<Id, Container>();
  for (const d of [base, remote, local]) for (const c of d.containers) known.set(c.id, c);
  let containers = [...doc.containers];
  const present = () => new Map(containers.map((c) => [c.id, c]));
  for (let pass = 0; pass < 8; pass++) {
    const map = present();
    const onCycle = new Set<Id>();
    for (const start of containers) {
      const seen = new Set<Id>();
      let cur: Container | undefined = start;
      while (cur && cur.parentId !== null) {
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        if (cur.parentId === start.id) {
          onCycle.add(start.id);
          break;
        }
        cur = map.get(cur.parentId);
      }
    }
    if (onCycle.size === 0) break;
    const localById = new Map(local.containers.map((c) => [c.id, c]));
    containers = containers.map((c) => {
      if (!onCycle.has(c.id)) return c;
      const mine = localById.get(c.id);
      if (mine) return mine.parentId === c.parentId ? c : { ...c, parentId: mine.parentId, x: mine.x, y: mine.y };
      const world = originIn(map, c.parentId);
      return { ...c, parentId: null, x: world.x + c.x, y: world.y + c.y };
    });
  }
  const fixParent = <T extends Node | Container>(box: T): T => {
    const live = present();
    if (box.parentId === null || live.has(box.parentId)) return box;
    const world = originIn(known, box.parentId);
    let parent: Id | null = box.parentId;
    while (parent !== null && !live.has(parent)) parent = known.get(parent)?.parentId ?? null;
    const target = originIn(live, parent);
    return { ...box, parentId: parent, x: world.x + box.x - target.x, y: world.y + box.y - target.y };
  };
  for (let i = 0; i < 4; i++) containers = containers.map(fixParent);
  const nodes = doc.nodes.map(fixParent);
  const boxes = new Set<Id>([...nodes.map((n) => n.id), ...containers.map((c) => c.id)]);
  const ok = (e: Endpoint) => e.kind === 'free' || boxes.has(e.objectId);
  const edges = doc.edges.filter((e) => ok(e.source) && ok(e.target));
  const all = new Set<Id>([...boxes, ...edges.map((e) => e.id)]);
  const annotations = doc.annotations.map((a) => (a.targetId !== null && !all.has(a.targetId) ? { ...a, targetId: null } : a));
  return { ...doc, containers, nodes, edges, annotations };
}

export function mergeDocuments(base: Document, local: Document, remote: Document, choose: Choose = () => undefined): Merged {
  const conflicts: Conflict[] = [];
  const title = resolve(base.title, local.title, remote.title, () => ({ key: 'title', collection: 'title' as const }), choose, conflicts);
  const lists = Object.fromEntries(
    COLLECTIONS.map((c) => [c, mergeList(c, base[c] as unknown as Item[], local[c] as unknown as Item[], remote[c] as unknown as Item[], choose, conflicts)]),
  ) as unknown as Pick<Document, Collection>;
  const merged: Document = { ...local, title, ...lists };
  return { document: repair(merged, base, local, remote), conflicts };
}
