import type { Id, Point, Rect } from '../domain';
import { containsPoint, containsRect, distanceToSegment, inflate } from './geometry';
import type { Scene } from './scene';

export function containerAt(scene: Scene, p: Point, exclude: ReadonlySet<Id> = new Set()): Id | null {
  let best: { id: Id; depth: number } | null = null;
  for (const c of scene.containers) {
    if (exclude.has(c.id) || !containsPoint(c.rect, p)) continue;
    if (!best || c.depth >= best.depth) best = { id: c.id, depth: c.depth };
  }
  return best?.id ?? null;
}

export function boxAt(scene: Scene, p: Point, exclude: ReadonlySet<Id> = new Set(), slop = 0): Id | null {
  for (let i = scene.nodes.length - 1; i >= 0; i--) {
    const node = scene.nodes[i]!;
    if (!exclude.has(node.id) && containsPoint(inflate(node.rect, slop), p)) return node.id;
  }
  return containerAt(scene, p, exclude);
}

export function edgeAt(scene: Scene, p: Point, tolerance: number): { id: Id; segment: number } | null {
  for (let i = scene.edges.length - 1; i >= 0; i--) {
    const e = scene.edges[i]!;
    for (let s = 1; s < e.points.length; s++) {
      if (distanceToSegment(p, e.points[s - 1]!, e.points[s]!) <= tolerance) return { id: e.id, segment: s - 1 };
    }
  }
  return null;
}

export function idsInRect(scene: Scene, r: Rect): Id[] {
  const ids: Id[] = [];
  for (const c of scene.containers) if (containsRect(r, c.rect)) ids.push(c.id);
  for (const n of scene.nodes) if (containsRect(r, n.rect)) ids.push(n.id);
  for (const a of scene.annotations) if (containsRect(r, a.rect)) ids.push(a.id);
  for (const e of scene.edges) if (e.points.every((p) => containsPoint(r, p))) ids.push(e.id);
  return ids;
}
