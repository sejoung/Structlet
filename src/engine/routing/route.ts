import type { Point, Rect } from '../../domain';
import { center, distanceToSegment, inflate, intersects, isHorizontalSide, normal, polylineLength, segmentHitsRect, simplify, union } from '../geometry';
import { BEND_COST, CROSS_COST, crossCount, orthogonalSearch } from './astar';
import { STUB, stubPoint, type ResolvedEnd } from './ports';

export const OBSTACLE_MARGIN = 12;
export const SEARCH_PADDING = 240;
export const MAX_OBSTACLES = 60;

function axisOf(end: ResolvedEnd): 'h' | 'v' | null {
  return end.side ? (isHorizontalSide(end.side) ? 'h' : 'v') : null;
}

export function routeClears(points: readonly Point[], obstacles: readonly Rect[]): boolean {
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

function followsPort(end: ResolvedEnd, next: Point): boolean {
  if (!end.side) return true;
  const direction = normal(end.side);
  const dx = next.x - end.point.x;
  const dy = next.y - end.point.y;
  return dx * direction.x + dy * direction.y > 0 && dx * direction.y === dy * direction.x;
}

function defaultShape(source: ResolvedEnd, target: ResolvedEnd, s = stubPoint(source), e = stubPoint(target)): Point[] {
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
  return searchAuto(source, target, obstacleRects, crossings, OBSTACLE_MARGIN, STUB) ??
    (obstacleRects.length <= 120 ? searchAuto(source, target, obstacleRects, crossings, 4, 10) : null) ??
    (obstacleRects.length <= 180 ? searchAuto(source, target, obstacleRects, [], 1, 5, 140) : null) ??
    simplify([source.point, ...defaultShape(source, target), target.point]);
}

export function routeInTightSpace(source: ResolvedEnd, target: ResolvedEnd, obstacles: readonly Rect[]): Point[] | null {
  return searchAuto(source, target, obstacles, [], 1, 5, 140);
}

function searchAuto(source: ResolvedEnd, target: ResolvedEnd, obstacleRects: readonly Rect[], crossings: readonly (readonly [Point, Point])[], margin: number, stub: number, limit = MAX_OBSTACLES): Point[] | null {
  const obstacles = obstacleRects.map((r) => inflate(r, margin));
  const s = stubPoint(source, stub);
  const e = stubPoint(target, stub);
  const middle = defaultShape(source, target, s, e);
  const penalty = (path: readonly Point[]) => path.slice(1).reduce((cost, p, i) =>
    cost + crossCount(path[i]!, p, crossings) * CROSS_COST, 0);
  const score = (path: readonly Point[]) => polylineLength(path) + Math.max(0, path.length - 2) * BEND_COST + penalty(path);
  let direct: Point[] | undefined;
  let directCost = Number.POSITIVE_INFINITY;
  const valid = (candidate: Point[], route: Point[]) => candidate.length >= 2 &&
    followsPort(source, candidate[1]!) && followsPort(target, candidate[candidate.length - 2]!) &&
    !hasReversal(candidate) && routeClears(route, obstacles);
  for (const route of [middle, [s, { x: e.x, y: s.y }, e], [s, { x: s.x, y: e.y }, e]]) {
    const candidate = simplify([source.point, ...route, target.point]);
    if (!valid(candidate, route)) continue;
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
  const localCrossings = crossings.filter(([a, b]) => intersects(area, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x) + 0.01, height: Math.abs(a.y - b.y) + 0.01 }));
  const search = (obstacles: readonly Rect[]) => orthogonalSearch({
    start: s,
    startDir: source.side ? normal(source.side) : null,
    end: e,
    endDir: target.side ? { x: -normal(target.side).x, y: -normal(target.side).y } : null,
    obstacles,
    area,
    crossings: localCrossings,
  });
  let found = nearby.length <= limit ? search(nearby) : null;
  if (!direct && nearby.length > limit && nearby.length <= 90) {
    const important = [...nearby].sort((a, b) => distanceToSegment(center(a), s, e) - distanceToSegment(center(b), s, e));
    const local = important.slice(0, MAX_OBSTACLES);
    const candidate = search(local);
    if (candidate && routeClears(candidate, nearby)) found = candidate;
    else if (candidate) {
      const blocking = important.slice(MAX_OBSTACLES).filter((rect) => !routeClears(candidate, [rect]));
      const second = search([...blocking, ...local].slice(0, MAX_OBSTACLES));
      if (second && routeClears(second, nearby)) found = second;
    }
  }
  if (!found) {
    if (direct) return direct;
    const crowd = union(nearby);
    if (!crowd) return null;
    const lanes = inflate(crowd, 8);
    const bends = [
      ...[lanes.x, lanes.x + lanes.width, s.x, e.x].map((x) => [s, { x, y: s.y }, { x, y: e.y }, e]),
      ...[lanes.y, lanes.y + lanes.height, s.y, e.y].map((y) => [s, { x: s.x, y }, { x: e.x, y }, e]),
    ];
    let best: Point[] | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const route of bends) {
      const candidate = simplify([source.point, ...route, target.point]);
      if (!valid(candidate, route)) continue;
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
      const around = obstacles.length && i > 1 && i < fixed.length - 1 && !routeClears([a, b], obstacles) ? searchLeg(a, b, obstacles) : null;
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
    const detour = obstacles.length && !routeClears([a, elbow, b], obstacles) ? searchLeg(a, b, obstacles) : null;
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
