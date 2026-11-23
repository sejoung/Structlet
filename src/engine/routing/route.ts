import type { Point, Rect } from '../../domain';
import { inflate, intersects, isHorizontalSide, normal, polylineLength, segmentHitsRect, simplify, union } from '../geometry';
import { BEND_COST, CROSS_COST, crossCount, orthogonalSearch } from './astar';
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

export function routeAuto(source: ResolvedEnd, target: ResolvedEnd, obstacleRects: readonly Rect[], crossings: readonly (readonly [Point, Point])[] = []): Point[] {
  const obstacles = obstacleRects.map((r) => inflate(r, OBSTACLE_MARGIN));
  const middle = defaultShape(source, target);
  const shape = simplify([source.point, ...middle, target.point]);
  const s = stubPoint(source);
  const e = stubPoint(target);
  const penalty = (path: readonly Point[]) => path.slice(1).reduce((cost, p, i) =>
    cost + crossCount(path[i]!, p, crossings) * CROSS_COST, 0);
  const score = (path: readonly Point[]) => polylineLength(path) + Math.max(0, path.length - 2) * BEND_COST + penalty(path);
  let direct: Point[] | undefined;
  let directCost = Number.POSITIVE_INFINITY;
  for (const route of [middle, [s, { x: e.x, y: s.y }, e], [s, { x: s.x, y: e.y }, e]]) {
    const candidate = simplify([source.point, ...route, target.point]);
    if (hasReversal(candidate) || !clear(route, obstacles)) continue;
    const cost = score(candidate);
    if (cost < directCost) {
      direct = candidate;
      directCost = cost;
    }
  }
  if (direct && penalty(direct) < CROSS_COST * 2) return direct;
  const area = inflate(union([
    { x: s.x, y: s.y, width: 0, height: 0 },
    { x: e.x, y: e.y, width: 0, height: 0 },
  ])!, SEARCH_PADDING);
  const nearby = obstacles.filter((o) => intersects(o, area));
  const found = nearby.length <= MAX_OBSTACLES ? orthogonalSearch({
    start: s,
    startDir: source.side ? normal(source.side) : null,
    end: e,
    endDir: target.side ? { x: -normal(target.side).x, y: -normal(target.side).y } : null,
    obstacles: nearby,
    area,
    crossings: crossings.filter(([a, b]) => intersects(area, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x) + 0.01, height: Math.abs(a.y - b.y) + 0.01 })),
  }) : null;
  if (!found) {
    if (direct) return direct;
    const crowd = union(nearby);
    if (!crowd) return shape;
    const lanes = inflate(crowd, 8);
    const bends = [
      ...[lanes.x, lanes.x + lanes.width, s.x, e.x].map((x) => [s, { x, y: s.y }, { x, y: e.y }, e]),
      ...[lanes.y, lanes.y + lanes.height, s.y, e.y].map((y) => [s, { x: s.x, y }, { x: e.x, y }, e]),
    ];
    let best = shape;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const route of bends) {
      const candidate = simplify([source.point, ...route, target.point]);
      if (hasReversal(candidate) || !clear(route, obstacles)) continue;
      const cost = score(candidate);
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
    }
    return best;
  }
  const searched = simplify([source.point, ...found, target.point]);
  return direct && directCost <= score(searched) ? direct : searched;
}

export function routeManual(source: ResolvedEnd, target: ResolvedEnd, waypoints: readonly Point[], obstacleRects: readonly Rect[] = []): Point[] {
  const obstacles = obstacleRects.map((r) => inflate(r, OBSTACLE_MARGIN));
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
      const around = obstacles.length && i > 1 && i < fixed.length - 1 && !clear([a, b], obstacles) ? searchLeg(a, b, obstacles) : null;
      if (around) {
        out.push(...around.slice(1));
        const last = around[around.length - 2]!;
        arrival = Math.abs(last.y - b.y) < 0.5 ? 'h' : 'v';
        continue;
      }
      if (Math.abs(a.x - b.x) >= 0.5) arrival = 'h';
      else if (Math.abs(a.y - b.y) >= 0.5) arrival = 'v';
      out.push(b);
      continue;
    }
    let leave: 'h' | 'v' = arrival === 'h' ? 'v' : 'h';
    if (i === fixed.length - 1 && endAxis) leave = endAxis === 'h' ? 'h' : 'v';
    if (i === 1 && source.side) leave = arrival === 'h' ? 'v' : 'h';
    const elbow = leave === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    const detour = obstacles.length && !clear([a, elbow, b], obstacles) ? searchLeg(a, b, obstacles) : null;
    if (detour) {
      out.push(...detour.slice(1));
      const last = detour[detour.length - 2]!;
      arrival = Math.abs(last.y - b.y) < 0.5 ? 'h' : 'v';
      continue;
    }
    out.push(elbow, b);
    arrival = leave === 'h' ? 'v' : 'h';
  }
  out.push(target.point);
  return simplify(out);
}

function searchLeg(a: Point, b: Point, obstacles: readonly Rect[]): Point[] | null {
  const area = inflate(union([{ x: a.x, y: a.y, width: 0, height: 0 }, { x: b.x, y: b.y, width: 0, height: 0 }])!, SEARCH_PADDING / 2);
  const nearby = obstacles.filter((o) => intersects(o, area));
  if (nearby.length > MAX_OBSTACLES) return null;
  return orthogonalSearch({ start: a, startDir: null, end: b, endDir: null, obstacles: nearby, area });
}

export function routeStraight(source: ResolvedEnd, target: ResolvedEnd, waypoints: readonly Point[]): Point[] {
  return simplify([source.point, ...waypoints, target.point]);
}
