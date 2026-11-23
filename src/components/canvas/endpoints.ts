import { descendants, indexDocument, topmost, type Document, type Endpoint, type Id, type Point, type Rect } from '../../domain';
import { boxAt, containerAt, nearestPort, union, type Scene } from '../../engine';

export function endpointAt(scene: Scene, world: Point, exclude: ReadonlySet<Id>, zoom: number): Endpoint {
  const target = boxAt(scene, world, exclude, 6 / zoom);
  if (!target) return { kind: 'free', x: Math.round(world.x), y: Math.round(world.y) };
  const frame = scene.frames.get(target)!;
  const near = nearestPort(frame, world);
  const line = { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right }[near.side];
  const distance = near.side === 'top' || near.side === 'bottom' ? Math.abs(world.y - line) : Math.abs(world.x - line);
  if (distance <= 10 / zoom) return { kind: 'attached', objectId: target, side: near.side, offset: near.offset };
  return { kind: 'attached', objectId: target, side: 'auto', offset: null };
}

export function movableIds(doc: Document, selection: readonly Id[]): Id[] {
  const index = indexDocument(doc);
  const boxes = topmost(doc, selection.filter((id) => index.nodes.has(id) || index.containers.has(id)));
  const unlocked = boxes.filter((id) => !(index.nodes.get(id) ?? index.containers.get(id))!.locked);
  return [...unlocked, ...selection.filter((id) => index.annotations.has(id) || index.edges.has(id))];
}

export function movingRect(scene: Scene, ids: readonly Id[]): Rect | null {
  return union(ids.map((id) => scene.rects.get(id) ?? scene.annotations.find((a) => a.id === id)?.rect).filter((r): r is Rect => !!r));
}

export function movingSet(doc: Document, ids: readonly Id[]): Set<Id> {
  const set = new Set(ids);
  for (const id of ids) if (indexDocument(doc).containers.has(id)) for (const d of descendants(doc, id)) set.add(d);
  return set;
}

export function dropParents(doc: Document, scene: Scene, ids: readonly Id[]): Map<Id, Id | null> {
  const index = indexDocument(doc);
  const exclude = movingSet(doc, ids);
  const parents = new Map<Id, Id | null>();
  for (const id of ids) {
    if (!index.nodes.has(id) && !index.containers.has(id)) continue;
    const r = scene.rects.get(id);
    if (!r) continue;
    parents.set(id, containerAt(scene, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, exclude));
  }
  return parents;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function resizeRect(start: Rect, handle: ResizeHandle, dx: number, dy: number, min = { width: 80, height: 56 }): Rect {
  const snap = (v: number) => Math.round(v / 8) * 8;
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('e')) right = Math.max(left + min.width, snap(right + dx));
  if (handle.includes('w')) left = Math.min(right - min.width, snap(left + dx));
  if (handle.includes('s')) bottom = Math.max(top + min.height, snap(bottom + dy));
  if (handle.includes('n')) top = Math.min(bottom - min.height, snap(top + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
