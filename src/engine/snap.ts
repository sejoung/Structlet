import type { Rect } from '../domain';

export const GRID = 8;

export function snapToGrid(v: number, grid = GRID): number {
  return Math.round(v / grid) * grid;
}

export interface Guide {
  readonly axis: 'x' | 'y';
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

export interface SnapResult {
  readonly dx: number;
  readonly dy: number;
  readonly guides: readonly Guide[];
}

export function snapMove(moving: Rect, dx: number, dy: number, others: readonly Rect[], threshold: number, grid = GRID): SnapResult {
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const xs = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width];
  const ys = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height];
  let bestX: { delta: number; at: number; other: Rect } | null = null;
  let bestY: { delta: number; at: number; other: Rect } | null = null;
  for (const o of others) {
    for (const a of xs(moved)) for (const b of xs(o)) {
      const d = b - a;
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) bestX = { delta: d, at: b, other: o };
    }
    for (const a of ys(moved)) for (const b of ys(o)) {
      const d = b - a;
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) bestY = { delta: d, at: b, other: o };
    }
  }
  const guides: Guide[] = [];
  const outX = bestX ? dx + bestX.delta : snapToGrid(moving.x + dx, grid) - moving.x;
  const outY = bestY ? dy + bestY.delta : snapToGrid(moving.y + dy, grid) - moving.y;
  const final = { ...moving, x: moving.x + outX, y: moving.y + outY };
  if (bestX) {
    const o = bestX.other;
    guides.push({ axis: 'x', at: bestX.at, from: Math.min(o.y, final.y), to: Math.max(o.y + o.height, final.y + final.height) });
  }
  if (bestY) {
    const o = bestY.other;
    guides.push({ axis: 'y', at: bestY.at, from: Math.min(o.x, final.x), to: Math.max(o.x + o.width, final.x + final.width) });
  }
  return { dx: outX, dy: outY, guides };
}
