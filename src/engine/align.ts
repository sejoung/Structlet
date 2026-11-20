import type { Id, Point, Rect } from '../domain';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

export interface Placed {
  readonly id: Id;
  readonly rect: Rect;
}

/** World deltas that align boxes to the selection's edge or center. */
export function alignDeltas(items: readonly Placed[], mode: AlignMode): Map<Id, Point> {
  const out = new Map<Id, Point>();
  if (items.length < 2) return out;
  const left = Math.min(...items.map((i) => i.rect.x));
  const right = Math.max(...items.map((i) => i.rect.x + i.rect.width));
  const top = Math.min(...items.map((i) => i.rect.y));
  const bottom = Math.max(...items.map((i) => i.rect.y + i.rect.height));
  for (const { id, rect: r } of items) {
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = left - r.x;
    if (mode === 'right') dx = right - (r.x + r.width);
    if (mode === 'center') dx = (left + right) / 2 - (r.x + r.width / 2);
    if (mode === 'top') dy = top - r.y;
    if (mode === 'bottom') dy = bottom - (r.y + r.height);
    if (mode === 'middle') dy = (top + bottom) / 2 - (r.y + r.height / 2);
    if (dx !== 0 || dy !== 0) out.set(id, { x: Math.round(dx), y: Math.round(dy) });
  }
  return out;
}

/** World deltas that make the gaps between boxes equal along an axis. */
export function distributeDeltas(items: readonly Placed[], axis: DistributeAxis): Map<Id, Point> {
  const out = new Map<Id, Point>();
  if (items.length < 3) return out;
  const h = axis === 'horizontal';
  const sorted = [...items].sort((a, b) => (h ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));
  const start = h ? sorted[0]!.rect.x : sorted[0]!.rect.y;
  const last = sorted[sorted.length - 1]!.rect;
  const end = h ? last.x + last.width : last.y + last.height;
  const total = sorted.reduce((s, i) => s + (h ? i.rect.width : i.rect.height), 0);
  const gap = (end - start - total) / (sorted.length - 1);
  let cursor = start;
  for (const { id, rect } of sorted) {
    const d = Math.round(cursor - (h ? rect.x : rect.y));
    if (d !== 0) out.set(id, h ? { x: d, y: 0 } : { x: 0, y: d });
    cursor += (h ? rect.width : rect.height) + gap;
  }
  return out;
}
