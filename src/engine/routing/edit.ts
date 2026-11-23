import type { Point } from '../../domain';
import { simplify } from '../geometry';
import { STUB } from './ports';


export function segmentOrientation(a: Point, b: Point): 'h' | 'v' | 'diagonal' {
  if (Math.abs(a.y - b.y) < 0.5) return 'h';
  if (Math.abs(a.x - b.x) < 0.5) return 'v';
  return 'diagonal';
}

function toward(from: Point, to: Point, length: number): Point {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  if (d === 0) return from;
  const t = Math.min(length, d / 2) / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function interiorPoints(path: readonly Point[]): Point[] {
  return simplify(path).slice(1, -1);
}

export function dragSegment(path: readonly Point[], index: number, delta: Point): Point[] {
  const pts = simplify(path);
  if (index < 0 || index >= pts.length - 1) return interiorPoints(pts);
  const a = pts[index]!;
  const b = pts[index + 1]!;
  const o = segmentOrientation(a, b);
  if (o === 'diagonal') return interiorPoints(pts);
  const d = o === 'h' ? { x: 0, y: delta.y } : { x: delta.x, y: 0 };
  const shift = (p: Point) => ({ x: p.x + d.x, y: p.y + d.y });
  const head = pts.slice(0, index);
  const tail = pts.slice(index + 2);
  const middle: Point[] = [];
  if (index === 0) {
    const stub = toward(a, b, STUB);
    middle.push(a, stub, shift(stub));
  } else middle.push(shift(a));
  if (index + 1 === pts.length - 1) {
    const stub = toward(b, a, STUB);
    middle.push(shift(stub), stub, b);
  } else middle.push(shift(b));
  return interiorPoints([...head, ...middle, ...tail]);
}

export function insertWaypoint(waypoints: readonly Point[], segment: number, p: Point): Point[] {
  const at = Math.max(0, Math.min(waypoints.length, segment));
  return [...waypoints.slice(0, at), p, ...waypoints.slice(at)];
}

export function removeWaypoint(waypoints: readonly Point[], index: number): Point[] {
  return waypoints.filter((_, i) => i !== index);
}
