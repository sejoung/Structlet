import type { Id, Point } from '../domain';
import { center, polylineLength } from './geometry';
import { projectIso } from './isometric-layout';
import type { Scene, SceneEdge } from './scene';

export interface FlowLink {
  readonly id: Id;
  readonly from: Id;
  readonly to: Id | null;
  readonly kind: 'forward' | 'reverse' | 'undirected';
  readonly points: readonly Point[];
}

export interface FlowWave {
  readonly sources: readonly Id[];
  readonly links: readonly FlowLink[];
  readonly arrivals: readonly Id[];
}

type FlowGraph = ReadonlyMap<Id, readonly FlowLink[]>;

export function indexIsometricFlow(scene: Scene): FlowGraph {
  const bySource = new Map<Id, FlowLink[]>();
  const add = (edge: SceneEdge, from: Id | null, to: Id | null, kind: FlowLink['kind']) => {
    if (!from || edge.points.length < 2) return;
    const links = bySource.get(from) ?? [];
    links.push({ id: edge.id, from, to, kind, points: kind === 'reverse' ? [...edge.points].reverse() : edge.points });
    bySource.set(from, links);
  };
  for (const edge of scene.edges) {
    if (edge.relationship) continue;
    const arrow = edge.style.arrow;
    if (arrow === 'end' || arrow === 'both') add(edge, edge.sourceId, edge.targetId, 'forward');
    if (arrow === 'start' || arrow === 'both') add(edge, edge.targetId, edge.sourceId, 'reverse');
    if (arrow === 'none') {
      add(edge, edge.sourceId, edge.targetId, 'undirected');
      add(edge, edge.targetId, edge.sourceId, 'undirected');
    }
  }
  return bySource;
}

export function topIsometricFlowSource(scene: Scene, graph: FlowGraph, rotation: number): Id | null {
  const incoming = new Set<Id>();
  for (const links of graph.values()) {
    for (const link of links) {
      if (link.kind !== 'undirected' && link.to) incoming.add(link.to);
    }
  }

  let best: { id: Id; position: Point; priority: number } | null = null;
  for (const [id, links] of graph) {
    const rect = scene.rects.get(id);
    if (!rect) continue;
    const directed = links.some((link) => link.kind !== 'undirected');
    const priority = directed ? (incoming.has(id) ? 1 : 0) : 2;
    const position = projectIso(center(rect), rotation);
    if (!best || (priority - best.priority || position.y - best.position.y || position.x - best.position.x || id.localeCompare(best.id)) < 0) {
      best = { id, position, priority };
    }
  }
  return best?.id ?? null;
}

export function planIsometricFlow(graph: FlowGraph, start: Id): FlowWave[] {
  const visitedNodes = new Set<Id>([start]);
  const visitedEdges = new Set<Id>();
  const waves: FlowWave[] = [];
  let sources = [start];
  while (sources.length) {
    const links: FlowLink[] = [];
    const arrivals = new Set<Id>();
    const next: Id[] = [];
    for (const source of sources) {
      for (const link of graph.get(source) ?? []) {
        if (visitedEdges.has(link.id)) continue;
        visitedEdges.add(link.id);
        links.push(link);
        if (!link.to || link.kind === 'undirected') continue;
        arrivals.add(link.to);
        if (visitedNodes.has(link.to)) continue;
        visitedNodes.add(link.to);
        next.push(link.to);
      }
    }
    if (!links.length) break;
    waves.push({ sources, links, arrivals: [...arrivals] });
    sources = next;
  }
  return waves;
}

export function flowPoint(points: readonly Point[], progress: number): Point {
  let distance = polylineLength(points) * Math.max(0, Math.min(1, progress));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0 && distance <= length) {
      const t = distance / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    distance -= length;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}
