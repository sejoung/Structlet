import type { Point, Rect } from '../../domain';
import { inflate, intersects, isHorizontalSide, normal, segmentHitsRect, simplify, union } from '../geometry';
import { orthogonalSearch } from './astar';
import { stubPoint, type ResolvedEnd } from './ports';

export const OBSTACLE_MARGIN = 12;
export const SEARCH_PADDING = 240;
export const MAX_OBSTACLES = 60;

function axisOf(end: ResolvedEnd): 'h' | 'v' | null {
  return end.side ? (isHorizontalSide(end.side) ? 'h' : 'v') : null;
}

function clear(points: readonly Point[], obstacles: readonly Rect[]): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const o of obstacles) if (segmentHitsRect(points[i - 1]!, points[i]!, o)) return false;
  }
  return true;
}

/** Goes back on itself (a 180° turn), which looks like a spike. */
function hasReversal(points: readonly Point[]): boolean {
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (dot < 0) return true;
  }
  return false;
}

/** The plain elbow or Z shape between the two stub points (ports excluded). */
function defaultShape(source: ResolvedEnd, target: ResolvedEnd): Point[] {
  const s = stubPoint(source);
  const e = stubPoint(target);
  const sa = axisOf(source) ?? (Math.abs(e.x - s.x) >= Math.abs(e.y - s.y) ? 'h' : 'v');
  const ea = axisOf(target) ?? sa;
  let middle: Point[];
  if (sa === 'h' && ea === 'h') {
    const mx = (s.x + e.x) / 2;
    middle = [s, { x: mx, y: s.y }, { x: mx, y: e.y }, e];
  } else if (sa === 'v' && ea === 'v') {
    const my = (s.y + e.y) / 2;
    middle = [s, { x: s.x, y: my }, { x: e.x, y: my }, e];
  } else if (sa === 'h') {
    middle = [s, { x: e.x, y: s.y }, e];
  } else {
    middle = [s, { x: s.x, y: e.y }, e];
  }
  return middle;
}

/**
 * Automatic orthogonal route. Keeps the default shape when it is clear of
 * obstacles; otherwise searches around them. Falls back to the default shape
 * when the area is too crowded or no path exists.
 */
export function routeAuto(source: ResolvedEnd, target: ResolvedEnd, obstacleRects: readonly Rect[]): Point[] {
  const obstacles = obstacleRects.map((r) => inflate(r, OBSTACLE_MARGIN));
  const middle = defaultShape(source, target);
  const shape = simplify([source.point, ...middle, target.point]);
  if (clear(middle, obstacles) && !hasReversal(shape)) return shape;
  const s = stubPoint(source);
  const e = stubPoint(target);
  const area = inflate(union([
    { x: s.x, y: s.y, width: 0, height: 0 },
    { x: e.x, y: e.y, width: 0, height: 0 },
  ])!, SEARCH_PADDING);
  const nearby = obstacles.filter((o) => intersects(o, area));
  if (nearby.length > MAX_OBSTACLES) return shape;
  const found = orthogonalSearch({
    start: s,
    startDir: source.side ? normal(source.side) : null,
    end: e,
    endDir: target.side ? { x: -normal(target.side).x, y: -normal(target.side).y } : null,
    obstacles: nearby,
    area,
  });
  if (!found) return shape;
  return simplify([source.point, ...found, target.point]);
}

/**
 * Manual orthogonal route through user waypoints. Consecutive points that are
 * not aligned get one elbow, leaving each point at a right angle to how the
 * route arrived there, and entering the target stub across its side.
 */
export function routeManual(source: ResolvedEnd, target: ResolvedEnd, waypoints: readonly Point[]): Point[] {
  const s = stubPoint(source);
  const e = stubPoint(target);
  const fixed = [s, ...waypoints, e];
  const out: Point[] = [source.point, s];
  let arrival: 'h' | 'v' = axisOf(source) ?? 'h';
  const endAxis = axisOf(target);
  for (let i = 1; i < fixed.length; i++) {
    const a = fixed[i - 1]!;
    const b = fixed[i]!;
    const aligned = Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
    if (aligned) {
      if (Math.abs(a.x - b.x) >= 0.5) arrival = 'h';
      else if (Math.abs(a.y - b.y) >= 0.5) arrival = 'v';
      out.push(b);
      continue;
    }
    let leave: 'h' | 'v' = arrival === 'h' ? 'v' : 'h';
    // Into the target stub, travel across the target side last.
    if (i === fixed.length - 1 && endAxis) leave = endAxis === 'h' ? 'h' : 'v';
    if (i === 1 && source.side) leave = arrival === 'h' ? 'v' : 'h';
    const elbow = leave === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    out.push(elbow, b);
    arrival = leave === 'h' ? 'v' : 'h';
  }
  out.push(target.point);
  return simplify(out);
}

export function routeStraight(source: ResolvedEnd, target: ResolvedEnd, waypoints: readonly Point[]): Point[] {
  return simplify([source.point, ...waypoints, target.point]);
}
