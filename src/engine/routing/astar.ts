import type { Point, Rect } from '../../domain';
import { segmentHitsRect, strictlyInside } from '../geometry';

/**
 * A* over a sparse orthogonal grid made from obstacle edges and the two
 * endpoints. Minimises length plus a penalty per bend. Returns `null` when no
 * path exists inside the search area.
 */

export const BEND_COST = 40;
const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

class Heap {
  private items: { key: number; cost: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(key: number, cost: number): void {
    const a = this.items;
    a.push({ key, cost });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.cost <= a[i]!.cost) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!.key;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.cost < a[m]!.cost) m = l;
        if (r < a.length && a[r]!.cost < a[m]!.cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
}

export interface SearchInput {
  start: Point;
  /** Direction index into DIRS the route arrives with at `start`, or -1. */
  startDir: Point | null;
  end: Point;
  /** Direction the route must travel when it reaches `end`, or null. */
  endDir: Point | null;
  obstacles: readonly Rect[];
  area: Rect;
}

export function orthogonalSearch(input: SearchInput): Point[] | null {
  const { start, end, obstacles, area } = input;
  const xs = uniqueSorted([start.x, end.x, (start.x + end.x) / 2, area.x, area.x + area.width, ...obstacles.flatMap((o) => [o.x, o.x + o.width])]);
  const ys = uniqueSorted([start.y, end.y, (start.y + end.y) / 2, area.y, area.y + area.height, ...obstacles.flatMap((o) => [o.y, o.y + o.height])]);
  const W = xs.length;
  const H = ys.length;
  const blocked = (p: Point) => obstacles.some((o) => strictlyInside(o, p));
  const si = xs.indexOf(Math.round(start.x * 100) / 100);
  const sj = ys.indexOf(Math.round(start.y * 100) / 100);
  const ei = xs.indexOf(Math.round(end.x * 100) / 100);
  const ej = ys.indexOf(Math.round(end.y * 100) / 100);
  if (si < 0 || sj < 0 || ei < 0 || ej < 0) return null;
  if (blocked(start) || blocked(end)) return null;

  const dirIndex = (d: Point | null) => (d ? DIRS.findIndex((x) => x.x === d.x && x.y === d.y) : 4);
  // State key: ((j * W + i) * 5 + dir); dir 4 means "no direction yet".
  const key = (i: number, j: number, d: number) => (j * W + i) * 5 + d;
  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new Heap();
  const h = (i: number, j: number) => Math.abs(xs[i]! - end.x) + Math.abs(ys[j]! - end.y);
  const startKey = key(si, sj, dirIndex(input.startDir));
  best.set(startKey, 0);
  heap.push(startKey, h(si, sj));
  const endDir = dirIndex(input.endDir);
  let found = -1;
  let iterations = 0;
  while (heap.size > 0 && iterations++ < 40000) {
    const k = heap.pop();
    const d = k % 5;
    const cell = (k - d) / 5;
    const i = cell % W;
    const j = (cell - i) / W;
    const g = best.get(k)!;
    if (i === ei && j === ej && (endDir === 4 || d === endDir)) {
      found = k;
      break;
    }
    for (let nd = 0; nd < 4; nd++) {
      if (d !== 4 && DIRS[nd]!.x === -DIRS[d]!.x && DIRS[nd]!.y === -DIRS[d]!.y) continue;
      const ni = i + DIRS[nd]!.x;
      const nj = j + DIRS[nd]!.y;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const a = { x: xs[i]!, y: ys[j]! };
      const b = { x: xs[ni]!, y: ys[nj]! };
      if (b.x < area.x || b.x > area.x + area.width || b.y < area.y || b.y > area.y + area.height) continue;
      if (blocked(b) || obstacles.some((o) => segmentHitsRect(a, b, o))) continue;
      const turn = d !== 4 && nd !== d ? BEND_COST : 0;
      const cost = g + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + turn;
      const nk = key(ni, nj, nd);
      if (cost < (best.get(nk) ?? Infinity)) {
        best.set(nk, cost);
        prev.set(nk, k);
        heap.push(nk, cost + h(ni, nj));
      }
    }
  }
  if (found < 0) return null;
  const path: Point[] = [];
  let k: number | undefined = found;
  while (k !== undefined) {
    const cell = (k - (k % 5)) / 5;
    const i = cell % W;
    path.push({ x: xs[i]!, y: ys[(cell - i) / W]! });
    k = prev.get(k);
  }
  return path.reverse();
}
