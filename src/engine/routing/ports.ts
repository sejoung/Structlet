import type { Edge, Endpoint, Id, Point, Side } from '../../domain';
import { normal } from '../geometry';

/**
 * Where edges may attach to an object. For a service node the bottom side sits
 * below its label so lines do not cross the text.
 */
export interface PortFrame {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /** Vertical extent used for left/right ports. */
  readonly sideTop: number;
  readonly sideBottom: number;
}

export interface ResolvedEnd {
  readonly point: Point;
  /** `null` for free endpoints. */
  readonly side: Side | null;
  readonly objectId: Id | null;
}

export const PORT_GAP = 16;

function frameCenter(f: PortFrame): Point {
  return { x: (f.left + f.right) / 2, y: (f.sideTop + f.sideBottom) / 2 };
}

/** Side of `f` facing `toward`, scaled by the frame's proportions. */
export function facingSide(f: PortFrame, toward: Point): Side {
  const c = frameCenter(f);
  const hw = Math.max((f.right - f.left) / 2, 1);
  const hh = Math.max((f.bottom - f.top) / 2, 1);
  const dx = (toward.x - c.x) / hw;
  const dy = (toward.y - c.y) / hh;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

export function pointOnSide(f: PortFrame, side: Side, t: number): Point {
  switch (side) {
    case 'top':
      return { x: f.left + (f.right - f.left) * t, y: f.top };
    case 'bottom':
      return { x: f.left + (f.right - f.left) * t, y: f.bottom };
    case 'left':
      return { x: f.left, y: f.sideTop + (f.sideBottom - f.sideTop) * t };
    case 'right':
      return { x: f.right, y: f.sideTop + (f.sideBottom - f.sideTop) * t };
  }
}

/** Nearest side and fractional offset of a world point on a frame. */
export function nearestPort(f: PortFrame, p: Point): { side: Side; offset: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const tx = clamp((p.x - f.left) / Math.max(f.right - f.left, 1));
  const ty = clamp((p.y - f.sideTop) / Math.max(f.sideBottom - f.sideTop, 1));
  const options: { side: Side; offset: number; d: number }[] = [
    { side: 'top', offset: tx, d: Math.abs(p.y - f.top) },
    { side: 'bottom', offset: tx, d: Math.abs(p.y - f.bottom) },
    { side: 'left', offset: ty, d: Math.abs(p.x - f.left) },
    { side: 'right', offset: ty, d: Math.abs(p.x - f.right) },
  ];
  options.sort((a, b) => a.d - b.d);
  return { side: options[0]!.side, offset: Math.round(options[0]!.offset * 100) / 100 };
}

function referencePoint(end: Endpoint, frames: ReadonlyMap<Id, PortFrame>): Point | null {
  if (end.kind === 'free') return { x: end.x, y: end.y };
  const f = frames.get(end.objectId);
  return f ? frameCenter(f) : null;
}

export interface EndpointPair {
  readonly source: ResolvedEnd;
  readonly target: ResolvedEnd;
}

/**
 * Resolves every edge end to a world point and side. `auto` sides face the
 * other end (or the nearest manual waypoint). Ends without a fixed offset that
 * share a side are spread in the order of their other ends.
 */
export function resolveEndpoints(edges: readonly Edge[], frames: ReadonlyMap<Id, PortFrame>): Map<Id, EndpointPair> {
  type Pending = { edge: Id; which: 'source' | 'target'; objectId: Id; side: Side; toward: Point };
  const fixed = new Map<string, ResolvedEnd>();
  const groups = new Map<string, Pending[]>();
  for (const edge of edges) {
    const sRef = referencePoint(edge.source, frames);
    const tRef = referencePoint(edge.target, frames);
    if (!sRef || !tRef) continue;
    for (const which of ['source', 'target'] as const) {
      const end = edge[which];
      const key = `${edge.id}:${which}`;
      if (end.kind === 'free') {
        fixed.set(key, { point: { x: end.x, y: end.y }, side: null, objectId: null });
        continue;
      }
      const frame = frames.get(end.objectId)!;
      const wp = edge.routingMode === 'manual' ? (which === 'source' ? edge.waypoints[0] : edge.waypoints[edge.waypoints.length - 1]) : undefined;
      const toward = wp ?? (which === 'source' ? tRef : sRef);
      const side = end.side === 'auto' ? facingSide(frame, toward) : end.side;
      if (end.offset !== null) {
        fixed.set(key, { point: pointOnSide(frame, side, end.offset), side, objectId: end.objectId });
        continue;
      }
      const groupKey = `${end.objectId}:${side}`;
      const list = groups.get(groupKey) ?? [];
      list.push({ edge: edge.id, which, objectId: end.objectId, side, toward });
      groups.set(groupKey, list);
    }
  }
  for (const list of groups.values()) {
    const { side, objectId } = list[0]!;
    const frame = frames.get(objectId)!;
    const horizontal = side === 'top' || side === 'bottom';
    list.sort((a, b) => (horizontal ? a.toward.x - b.toward.x : a.toward.y - b.toward.y) || a.edge.localeCompare(b.edge));
    const length = horizontal ? frame.right - frame.left : frame.sideBottom - frame.sideTop;
    const gap = list.length > 1 ? Math.min(PORT_GAP, (length * 0.8) / (list.length - 1)) : 0;
    list.forEach((p, i) => {
      const along = length / 2 + (i - (list.length - 1) / 2) * gap;
      fixed.set(`${p.edge}:${p.which}`, { point: pointOnSide(frame, side, length > 0 ? along / length : 0.5), side, objectId });
    });
  }
  const result = new Map<Id, EndpointPair>();
  for (const edge of edges) {
    const source = fixed.get(`${edge.id}:source`);
    const target = fixed.get(`${edge.id}:target`);
    if (source && target) result.set(edge.id, { source, target });
  }
  return result;
}

export const STUB = 20;

/** Point a short distance out from a port, where a route may first turn. */
export function stubPoint(end: ResolvedEnd, length = STUB): Point {
  if (!end.side) return end.point;
  const n = normal(end.side);
  return { x: end.point.x + n.x * length, y: end.point.y + n.y * length };
}
