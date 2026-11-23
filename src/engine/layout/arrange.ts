import type { Id, Point } from '../../domain';


export const LAYOUT_MODES = ['flow', 'flow-down', 'grid'] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export interface LayoutItem {
  readonly id: Id;
  readonly width: number;
  readonly height: number;
}

export interface LayoutLink {
  readonly from: Id;
  readonly to: Id;
  readonly rank?: boolean;
}

export const LAYOUT_GAP = { primary: 72, secondary: 56 } as const;

export function ranks(ids: readonly Id[], links: readonly LayoutLink[]): Map<Id, number> {
  const out = new Map<Id, Id[]>(ids.map((id) => [id, []]));
  for (const l of links) if (l.from !== l.to && out.has(l.from) && out.has(l.to)) out.get(l.from)!.push(l.to);
  const state = new Map<Id, 1 | 2>();
  const dag = new Map<Id, Id[]>(ids.map((id) => [id, []]));
  const visit = (id: Id) => {
    state.set(id, 1);
    for (const next of out.get(id)!) {
      if (state.get(next) === 1) continue;
      dag.get(id)!.push(next);
      if (!state.has(next)) visit(next);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  const rank = new Map<Id, number>();
  const longest = (id: Id): number => {
    const hit = rank.get(id);
    if (hit !== undefined) return hit;
    rank.set(id, 0);
    let r = 0;
    for (const [from, tos] of dag) if (tos.includes(id)) r = Math.max(r, longest(from) + 1);
    rank.set(id, r);
    return r;
  };
  for (const id of ids) longest(id);
  return rank;
}

function countCrossings(layers: Id[][], links: readonly LayoutLink[]): number {
  let total = 0;
  for (let i = 0; i < layers.length - 1; i++) {
    const a = new Map(layers[i]!.map((id, k) => [id, k]));
    const b = new Map(layers[i + 1]!.map((id, k) => [id, k]));
    const pairs = links.flatMap((l) => (a.has(l.from) && b.has(l.to) ? [[a.get(l.from)!, b.get(l.to)!]] : a.has(l.to) && b.has(l.from) ? [[a.get(l.to)!, b.get(l.from)!]] : []));
    for (let x = 0; x < pairs.length; x++)
      for (let y = x + 1; y < pairs.length; y++) if ((pairs[x]![0]! - pairs[y]![0]!) * (pairs[x]![1]! - pairs[y]![1]!) < 0) total++;
  }
  return total;
}

export function orderLayers(layers: Id[][], links: readonly LayoutLink[]): Id[][] {
  const neighbours = new Map<Id, Id[]>();
  for (const l of links) {
    neighbours.set(l.from, [...(neighbours.get(l.from) ?? []), l.to]);
    neighbours.set(l.to, [...(neighbours.get(l.to) ?? []), l.from]);
  }
  let best = layers.map((l) => [...l]);
  let bestCrossings = countCrossings(best, links);
  let current = best.map((l) => [...l]);
  for (let sweep = 0; sweep < 6; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? current.map((_, i) => i).slice(1) : current.map((_, i) => i).reverse().slice(1);
    for (const i of order) {
      const ref = current[down ? i - 1 : i + 1]!;
      const pos = new Map(ref.map((id, k) => [id, k]));
      const layer = current[i]!;
      const bary = new Map(
        layer.map((id, k) => {
          const ns = (neighbours.get(id) ?? []).filter((n) => pos.has(n)).map((n) => pos.get(n)!);
          return [id, ns.length ? ns.reduce((s, v) => s + v, 0) / ns.length : k];
        }),
      );
      current[i] = [...layer].sort((a, b) => bary.get(a)! - bary.get(b)! || layer.indexOf(a) - layer.indexOf(b));
    }
    const c = countCrossings(current, links);
    if (c < bestCrossings) {
      best = current.map((l) => [...l]);
      bestCrossings = c;
    }
  }
  return best;
}

export function arrange(items: readonly LayoutItem[], links: readonly LayoutLink[], mode: LayoutMode, gap = LAYOUT_GAP): Map<Id, Point> {
  if (items.length === 0) return new Map();
  const size = new Map(items.map((i) => [i.id, i]));
  const ids = items.map((i) => i.id);
  const validLinks = links.filter((link) => size.has(link.from) && size.has(link.to));
  if (mode === 'grid') return arrangeGrid(ids, size, validLinks, gap.secondary);
  const flowLinks = validLinks.filter((link) => link.rank !== false);
  if (!flowLinks.length && ids.length > 3) return arrangeGrid(ids, size, validLinks, gap.secondary);
  const rank = ranks(ids, flowLinks);
  const layerCount = Math.max(...rank.values()) + 1;
  const layers: Id[][] = Array.from({ length: layerCount }, () => []);
  for (const id of ids) layers[rank.get(id)!]!.push(id);
  const ordered = orderLayers(layers, validLinks);
  const place = (layers: Id[][]) => placeFlow(layers, size, mode, gap);
  let best = place(ordered);
  let cost = wireCost(best, size, validLinks);
  if (ids.length <= 80) for (const layer of ordered) {
    for (let i = 1; i < layer.length; i++) {
      [layer[i - 1], layer[i]] = [layer[i]!, layer[i - 1]!];
      const candidate = place(ordered);
      const score = wireCost(candidate, size, validLinks);
      if (score < cost) {
        best = candidate;
        cost = score;
      } else [layer[i - 1], layer[i]] = [layer[i]!, layer[i - 1]!];
    }
  }
  return best;
}

function placeFlow(ordered: Id[][], size: ReadonlyMap<Id, LayoutItem>, mode: LayoutMode, gap: typeof LAYOUT_GAP): Map<Id, Point> {
  const result = new Map<Id, Point>();
  const horizontal = mode === 'flow';
  const along = (id: Id) => (horizontal ? size.get(id)!.width : size.get(id)!.height);
  const across = (id: Id) => (horizontal ? size.get(id)!.height : size.get(id)!.width);
  const layerThickness = ordered.map((l) => Math.max(...l.map(along)));
  const layerSpan = ordered.map((l) => l.reduce((s, id) => s + across(id), 0) + gap.secondary * (l.length - 1));
  const maxSpan = Math.max(...layerSpan);
  let primary = 0;
  ordered.forEach((layer, i) => {
    let secondary = (maxSpan - layerSpan[i]!) / 2;
    for (const id of layer) {
      const p = primary + (layerThickness[i]! - along(id)) / 2;
      result.set(id, horizontal ? { x: p, y: secondary } : { x: secondary, y: p });
      secondary += across(id) + gap.secondary;
    }
    primary += layerThickness[i]! + gap.primary;
  });
  return result;
}


function arrangeGrid(ids: Id[], size: ReadonlyMap<Id, LayoutItem>, links: readonly LayoutLink[], gap: number): Map<Id, Point> {
  const cols = Math.ceil(Math.sqrt(ids.length));
  const place = () => placeGrid(ids, size, cols, gap);
  let best = place();
  if (links.length === 0 || ids.length > 160) return best;

  let cost = wireCost(best, size, links);
  const optimize = (a: number, b: number) => {
    if (a === b || b >= ids.length) return;
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    const candidate = place();
    const score = wireCost(candidate, size, links);
    if (score < cost) {
      best = candidate;
      cost = score;
    } else [ids[a], ids[b]] = [ids[b]!, ids[a]!];
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < ids.length; i++) {
      if (ids.length <= 18) {
        for (let j = i + 1; j < ids.length; j++) optimize(i, j);
      } else {
        optimize(i, i + 1);
        optimize(i, i + cols);
      }
    }
  }
  return best;
}

function placeGrid(ids: readonly Id[], size: ReadonlyMap<Id, LayoutItem>, cols: number, gap: number): Map<Id, Point> {
  const widths: number[] = [];
  const heights: number[] = [];
  ids.forEach((id, i) => {
    const item = size.get(id)!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    widths[col] = Math.max(widths[col] ?? 0, item.width);
    heights[row] = Math.max(heights[row] ?? 0, item.height);
  });
  const starts = (lengths: number[]) => {
    let next = 0;
    return lengths.map((length) => {
      const start = next;
      next += length + gap;
      return start;
    });
  };
  const xs = starts(widths);
  const ys = starts(heights);
  return new Map(ids.map((id, i) => {
    const item = size.get(id)!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return [id, { x: xs[col]! + (widths[col]! - item.width) / 2, y: ys[row]! + (heights[row]! - item.height) / 2 }];
  }));
}

function wireCost(positions: ReadonlyMap<Id, Point>, sizes: ReadonlyMap<Id, LayoutItem>, links: readonly LayoutLink[]): number {
  const centers = new Map([...positions].map(([id, point]) => {
    const size = sizes.get(id)!;
    return [id, { x: point.x + size.width / 2, y: point.y + size.height / 2 }];
  }));
  const pairs = new Map<Id, Set<Id>>();
  const segments: [Point, Point][] = [];
  let cost = 0;
  for (const { from, to } of links) {
    const a = centers.get(from)!;
    const b = centers.get(to)!;
    cost += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (pairs.get(from)?.has(to) || pairs.get(to)?.has(from)) continue;
    const targets = pairs.get(from) ?? new Set<Id>();
    targets.add(to);
    pairs.set(from, targets);
    segments.push([a, b]);
  }
  if (segments.length > 100) return cost;
  for (const [i, [a, b]] of segments.entries()) {
    for (let j = 0; j < i; j++) {
      const [p, q] = segments[j]!;
      if (crosses(a, b, p, q)) cost += 120;
    }
  }
  return cost;
}

function crosses(a: Point, b: Point, p: Point, q: Point): boolean {
  const side = (start: Point, end: Point, point: Point) =>
    (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  return side(a, b, p) * side(a, b, q) < 0 && side(p, q, a) * side(p, q, b) < 0;
}
