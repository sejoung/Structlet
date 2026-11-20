import type { Id, Point } from '../../domain';

/**
 * Arranges sized items relative to (0,0). `flow` ranks items by the longest
 * path of the edges between them (left to right), `flow-down` does the same
 * top to bottom, `grid` fills rows. Deterministic for the same input.
 */

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
}

export const LAYOUT_GAP = { primary: 72, secondary: 40 } as const;

/** Longest-path ranks; edges that would close a cycle are ignored. */
export function ranks(ids: readonly Id[], links: readonly LayoutLink[]): Map<Id, number> {
  const out = new Map<Id, Id[]>(ids.map((id) => [id, []]));
  for (const l of links) if (l.from !== l.to && out.has(l.from) && out.has(l.to)) out.get(l.from)!.push(l.to);
  // Drop back edges found by DFS in input order.
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

/** Orders items inside each layer by the barycenter of their neighbours, keeping the order with fewest crossings. */
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
  const result = new Map<Id, Point>();
  if (items.length === 0) return result;
  const size = new Map(items.map((i) => [i.id, i]));
  if (mode === 'grid') {
    const cols = Math.ceil(Math.sqrt(items.length));
    const colW: number[] = [];
    const rowH: number[] = [];
    items.forEach((it, k) => {
      const c = k % cols;
      const r = Math.floor(k / cols);
      colW[c] = Math.max(colW[c] ?? 0, it.width);
      rowH[r] = Math.max(rowH[r] ?? 0, it.height);
    });
    items.forEach((it, k) => {
      const c = k % cols;
      const r = Math.floor(k / cols);
      const x = colW.slice(0, c).reduce((s, v) => s + v + gap.secondary, 0);
      const y = rowH.slice(0, r).reduce((s, v) => s + v + gap.secondary, 0);
      result.set(it.id, { x: x + (colW[c]! - it.width) / 2, y: y + (rowH[r]! - it.height) / 2 });
    });
    return result;
  }
  const ids = items.map((i) => i.id);
  const rank = ranks(ids, links);
  const layerCount = Math.max(...rank.values()) + 1;
  const layers: Id[][] = Array.from({ length: layerCount }, () => []);
  for (const id of ids) layers[rank.get(id)!]!.push(id);
  const ordered = orderLayers(layers, links);
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
