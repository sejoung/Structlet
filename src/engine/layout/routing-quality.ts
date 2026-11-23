import { ancestors, type Document, type Id, type Point, type Rect } from '../../domain';
import type { Appearance } from '../appearance';
import { containsPoint, polylineLength } from '../geometry';
import { crossCount } from '../routing/astar';
import { routeClears } from '../routing/route';
import { computeScene } from '../scene';

const geometryOnly: Appearance = {
  service: () => undefined,
  fallback: { name: '', glyph: [], color: '' },
  containerGlyph: (kind) => kind === 'custom' ? null : [],
};

export function layoutRoutingQuality(doc: Document): readonly [number, number, number] {
  const scene = computeScene(doc, geometryOnly);
  const parents = new Map<Id, Id[]>([...doc.nodes, ...doc.containers].map(({ id }) => [id, ancestors(doc, id)]));
  const objects = scene.nodes.map((node) => ({ id: node.id, rects: [node.rect, ...(node.labelBox ? [node.labelBox] : []), ...(node.specCaption ? [node.specCaption.box] : [])] }));
  const notes = scene.annotations.filter((note) => note.kind !== 'step').map((note) => note.rect);
  const segments: (readonly [Point, Point])[] = [];
  let blocked = 0;
  let crossedAreas = 0;
  let cost = 0;
  for (const edge of scene.edges) {
    if (edge.manual || edge.style.shape !== 'orthogonal' || edge.points.length < 2) continue;
    const used = new Set<Id>([edge.sourceId, edge.targetId].flatMap((id) => id ? [id, ...(parents.get(id) ?? [])] : []));
    const start = edge.points[0]!;
    const end = edge.points[edge.points.length - 1]!;
    const untouched = (rect: Rect) => containsPoint(rect, start) || containsPoint(rect, end) || routeClears(edge.points, [rect]);
    if (!routeClears(edge.points, notes) || objects.some(({ id, rects }) => !used.has(id) && !rects.every(untouched))) blocked++;
    for (const area of scene.containers) if (!used.has(area.id) && !untouched(area.rect)) crossedAreas++;
    cost += polylineLength(edge.points) + Math.max(0, edge.points.length - 2) * 24;
    const next = edge.points.slice(1).map((point, i) => [edge.points[i]!, point] as const);
    for (const [a, b] of next) cost += crossCount(a, b, segments) * 60;
    segments.push(...next);
  }
  return [blocked, crossedAreas, cost];
}
