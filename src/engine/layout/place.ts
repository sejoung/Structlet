import { ancestors, indexDocument, topmost, worldRect, type Container, type Document, type Id, type Node, type Point, type Rect } from '../../domain';
import { intersects, union } from '../geometry';
import { NODE_LABEL } from '../scene';
import { measureText, wrapText } from '../text';
import { arrange, LAYOUT_GAP, type LayoutItem, type LayoutLink, type LayoutMode } from './arrange';

/** Space inside an area around its contents: sides, below the header, bottom. */
export const AREA_PADDING = { side: 32, top: 56, bottom: 32 } as const;

/** Slot a box occupies when laid out, and where the box sits inside it. */
export interface Footprint {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
}

export function footprint(box: Node | Container): Footprint {
  if (!('serviceId' in box) || box.variant === 'box') return { width: box.width, height: box.height, offsetX: 0 };
  const lines = box.label.trim() ? wrapText(box.label, NODE_LABEL.maxWidth, NODE_LABEL.fontSize, 4) : [];
  const labelW = Math.max(0, ...lines.map((l) => measureText(l, NODE_LABEL.fontSize)));
  const width = Math.ceil(Math.max(box.width, labelW) + 16);
  const height = box.height + (lines.length ? NODE_LABEL.gap + lines.length * NODE_LABEL.lineHeight : 0);
  return { width, height, offsetX: (width - box.width) / 2 };
}

/** Edges between objects lifted to the given sibling items (an item stands for its whole subtree). */
export function liftLinks(doc: Document, items: ReadonlySet<Id>): LayoutLink[] {
  const itemFor = (id: Id): Id | null => (items.has(id) ? id : (ancestors(doc, id).find((a) => items.has(a)) ?? null));
  const links: LayoutLink[] = [];
  for (const e of doc.edges) {
    if (e.source.kind !== 'attached' || e.target.kind !== 'attached') continue;
    const from = itemFor(e.source.objectId);
    const to = itemFor(e.target.objectId);
    if (from && to && from !== to) links.push({ from, to });
  }
  return links;
}

export interface SelectionLayout {
  /** World deltas per moved box. */
  readonly moves: Map<Id, Point>;
  /** New world rectangles for areas that must grow to hold the result. */
  readonly grow: Map<Id, Rect>;
}

/**
 * Lays out the selected boxes within their parents, starting at each group's
 * current top-left corner. Locked boxes stay where they are; manual routes
 * are left untouched by the caller.
 */
export function layoutSelection(doc: Document, ids: readonly Id[], mode: LayoutMode): SelectionLayout {
  const index = indexDocument(doc);
  const box = (id: Id) => index.nodes.get(id) ?? index.containers.get(id);
  const chosen = topmost(doc, ids.filter((id) => box(id) && !box(id)!.locked));
  const groups = new Map<Id | null, Id[]>();
  for (const id of chosen) groups.set(box(id)!.parentId, [...(groups.get(box(id)!.parentId) ?? []), id]);
  const moves = new Map<Id, Point>();
  const after = new Map<Id, Rect>();
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const feet = new Map(members.map((id) => [id, footprint(box(id)!)]));
    const rects = new Map(members.map((id) => [id, worldRect(doc, box(id)!)]));
    const items: LayoutItem[] = members.map((id) => ({ id, width: feet.get(id)!.width, height: feet.get(id)!.height }));
    const pos = arrange(items, liftLinks(doc, new Set(members)), mode);
    const originX = Math.min(...members.map((id) => rects.get(id)!.x - feet.get(id)!.offsetX));
    const originY = Math.min(...members.map((id) => rects.get(id)!.y));
    for (const id of members) {
      const r = rects.get(id)!;
      const p = pos.get(id)!;
      const x = Math.round(originX + p.x + feet.get(id)!.offsetX);
      const y = Math.round(originY + p.y);
      if (x !== r.x || y !== r.y) moves.set(id, { x: x - r.x, y: y - r.y });
      after.set(id, { ...r, x, y });
    }
  }
  return { moves, grow: growAreas(doc, after) };
}

/** Grows ancestor areas so moved boxes stay inside them, innermost first. */
function growAreas(doc: Document, moved: ReadonlyMap<Id, Rect>): Map<Id, Rect> {
  const index = indexDocument(doc);
  const grow = new Map<Id, Rect>();
  const current = (id: Id): Rect => grow.get(id) ?? moved.get(id) ?? worldRect(doc, (index.nodes.get(id) ?? index.containers.get(id))!);
  const parents = [...new Set([...moved.keys()].flatMap((id) => ancestors(doc, id)))];
  parents.sort((a, b) => ancestors(doc, b).length - ancestors(doc, a).length);
  for (const pid of parents) {
    const kids = index.children.get(pid) ?? [];
    const content = union(kids.map(current));
    if (!content) continue;
    const r = current(pid);
    const need = {
      x: Math.min(r.x, content.x - AREA_PADDING.side),
      y: Math.min(r.y, content.y - AREA_PADDING.top),
      right: Math.max(r.x + r.width, content.x + content.width + AREA_PADDING.side),
      bottom: Math.max(r.y + r.height, content.y + content.height + AREA_PADDING.bottom),
    };
    const next = { x: need.x, y: need.y, width: need.right - need.x, height: need.bottom - need.y };
    if (next.x !== r.x || next.y !== r.y || next.width !== r.width || next.height !== r.height) grow.set(pid, next);
  }
  return grow;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Gives positions to the boxes in `place` (and sizes to new areas in it),
 * keeping every other box where it is. Areas are measured innermost first.
 * A new box linked to a placed sibling goes next to it; the rest are laid out
 * with the parent's mode below the existing contents.
 */
export function placeNew(doc: Document, place: ReadonlySet<Id>, modes: ReadonlyMap<Id | null, LayoutMode>, fallback: LayoutMode = 'flow'): Document {
  const index = indexDocument(doc);
  const boxes = new Map<Id, Mutable<Node> | Mutable<Container>>([...doc.containers, ...doc.nodes].map((b) => [b.id, { ...b }]));
  const parents: (Id | null)[] = [...doc.containers].sort((a, b) => ancestors(doc, b.id).length - ancestors(doc, a.id).length).map((c) => c.id);
  parents.push(null);
  for (const pid of parents) {
    const kids = index.children.get(pid) ?? [];
    const fresh = kids.filter((id) => place.has(id));
    const container = pid === null ? null : boxes.get(pid)!;
    if (fresh.length > 0) placeChildren(doc, boxes, pid, kids, fresh, modes.get(pid) ?? fallback);
    if (container && (place.has(container.id) || fresh.length > 0)) fitArea(boxes, container, kids, place.has(container.id));
  }
  return {
    ...doc,
    nodes: doc.nodes.map((n) => boxes.get(n.id) as Node),
    containers: doc.containers.map((c) => boxes.get(c.id) as Container),
  };
}

function slot(b: Node | Container): Rect {
  const f = footprint(b);
  return { x: b.x - f.offsetX, y: b.y, width: f.width, height: f.height };
}

function placeChildren(doc: Document, boxes: Map<Id, Mutable<Node> | Mutable<Container>>, pid: Id | null, kids: readonly Id[], fresh: readonly Id[], mode: LayoutMode): void {
  const freshSet = new Set(fresh);
  const occupied: Rect[] = kids.filter((id) => !freshSet.has(id)).map((id) => slot(boxes.get(id)!));
  const links = liftLinks(doc, new Set(kids));
  const remaining: Id[] = [];
  for (const id of fresh) {
    const b = boxes.get(id)!;
    const f = footprint(b);
    const link = links.find((l) => (l.to === id && !freshSet.has(l.from)) || (l.from === id && !freshSet.has(l.to)));
    if (!link) {
      remaining.push(id);
      continue;
    }
    const anchor = slot(boxes.get(link.to === id ? link.from : link.to)!);
    const x = link.to === id ? anchor.x + anchor.width + LAYOUT_GAP.primary : anchor.x - LAYOUT_GAP.primary - f.width;
    let y = anchor.y;
    for (let tries = 0; tries < 40 && occupied.some((o) => intersects(o, { x: x - 8, y: y - 8, width: f.width + 16, height: f.height + 16 })); tries++) y += 24;
    b.x = Math.round(x + f.offsetX);
    b.y = Math.round(y);
    occupied.push({ x, y, width: f.width, height: f.height });
  }
  if (remaining.length === 0) return;
  const items = remaining.map((id) => ({ id, ...footprint(boxes.get(id)!) }));
  const pos = arrange(items, links.filter((l) => remaining.includes(l.from) && remaining.includes(l.to)), mode);
  const existing = union(occupied);
  const start = existing
    ? { x: existing.x, y: existing.y + existing.height + LAYOUT_GAP.primary }
    : pid === null
      ? { x: 40, y: 40 }
      : { x: AREA_PADDING.side, y: AREA_PADDING.top };
  for (const it of items) {
    const p = pos.get(it.id)!;
    const b = boxes.get(it.id)!;
    b.x = Math.round(start.x + p.x + it.offsetX);
    b.y = Math.round(start.y + p.y);
  }
}

function fitArea(boxes: Map<Id, Mutable<Node> | Mutable<Container>>, area: Mutable<Container> | Mutable<Node>, kids: readonly Id[], isNew: boolean): void {
  const content = union(kids.map((id) => slot(boxes.get(id)!)));
  if (!content) {
    if (isNew) {
      area.width = Math.max(area.width, 240);
      area.height = Math.max(area.height, 160);
    }
    return;
  }
  // Children are local to the area: shift them right/down if they start too close to its edge.
  const dx = Math.max(0, AREA_PADDING.side - content.x);
  const dy = Math.max(0, AREA_PADDING.top - content.y);
  if (dx || dy) for (const id of kids) {
    const k = boxes.get(id)!;
    k.x += dx;
    k.y += dy;
  }
  const width = content.x + dx + content.width + AREA_PADDING.side;
  const height = content.y + dy + content.height + AREA_PADDING.bottom;
  area.width = Math.round(isNew ? Math.max(width, 240) : Math.max(area.width, width));
  area.height = Math.round(isNew ? Math.max(height, 160) : Math.max(area.height, height));
}
