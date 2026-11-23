import type { Id, Point } from '../domain';
import { polylineLength } from './geometry';
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

function linksFromScene(scene: Scene): Map<Id, FlowLink[]> {
  const bySource = new Map<Id, FlowLink[]>();
  const add = (edge: SceneEdge, from: Id | null, to: Id | null, kind: FlowLink['kind']) => {
    if (!from || edge.points.length < 2) return;
    const links = bySource.get(from) ?? [];
    links.push({ id: edge.id, from, to, kind, points: kind === 'reverse' ? [...edge.points].reverse() : edge.points });
    bySource.set(from, links);
  };
  for (const edge of scene.edges) {
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

export function planIsometricFlow(scene: Scene, start: Id): FlowWave[] {
  const graph = linksFromScene(scene);
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
