import type { Edge, Endpoint, Id, Point, Side } from '../../domain';
import { intersects, normal } from '../geometry';

export interface PortFrame {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly sideTop: number;
  readonly sideBottom: number;
}

export interface ResolvedEnd {
  readonly point: Point;
  readonly side: Side | null;
  readonly objectId: Id | null;
}

export const PORT_GAP = 16;

function frameCenter(f: PortFrame): Point {
  return { x: (f.left + f.right) / 2, y: (f.sideTop + f.sideBottom) / 2 };
}

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

export interface Blocker {
  readonly id: Id;
  readonly rect: { x: number; y: number; width: number; height: number };
}

export const CROWD_DEPTH = 32;

function frontStrip(f: PortFrame, side: Side) {
  const d = CROWD_DEPTH;
  if (side === 'top') return { x: f.left, y: f.top - d, width: f.right - f.left, height: d };
  if (side === 'bottom') return { x: f.left, y: f.bottom, width: f.right - f.left, height: d };
  if (side === 'left') return { x: f.left - d, y: f.sideTop, width: d, height: f.sideBottom - f.sideTop };
  return { x: f.right, y: f.sideTop, width: d, height: f.sideBottom - f.sideTop };
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export function autoSide(f: PortFrame, toward: Point, self: Id, other: Id | null, blockers: readonly Blocker[]): Side {
  const primary = facingSide(f, toward);
  if (blockers.length === 0) return primary;
  const c = frameCenter(f);
  const horizontal = primary === 'left' || primary === 'right';
  const turn: Side = horizontal ? (toward.y < c.y ? 'top' : 'bottom') : toward.x < c.x ? 'left' : 'right';
  const candidates: Side[] = [primary, turn, OPPOSITE[turn], OPPOSITE[primary]];
  const free = (side: Side) => {
    const strip = frontStrip(f, side);
    return !blockers.some((b) => b.id !== self && b.id !== other && intersects(b.rect, strip));
  };
  return candidates.find(free) ?? primary;
}

export function resolveEndpoints(edges: readonly Edge[], frames: ReadonlyMap<Id, PortFrame>, blockers: readonly Blocker[] = []): Map<Id, EndpointPair> {
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
      const otherEnd = which === 'source' ? edge.target : edge.source;
      const other = otherEnd.kind === 'attached' ? otherEnd.objectId : null;
      const side = end.side === 'auto' ? autoSide(frame, toward, end.objectId, other, blockers) : end.side;
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

export function stubPoint(end: ResolvedEnd, length = STUB): Point {
  if (!end.side) return end.point;
  const n = normal(end.side);
  return { x: end.point.x + n.x * length, y: end.point.y + n.y * length };
}
