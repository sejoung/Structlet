import { indexDocument, type Document, type Id, type Rect } from '../domain';
import type { Appearance } from './appearance';
import { projectDiagramContent } from './diagram-content';
import { computeDiagramView, type DiagramView } from './diagram-view';
import { polylineLength } from './geometry';
import { LAYOUT_MODES, type LayoutMode } from './layout/arrange';
import type { Scene } from './scene';
import { fitView } from './viewport';

export function summaryGroups(doc: Document) {
  const { children, containers } = indexDocument(doc);
  const groupsUnder = (id: Id | null) => (children.get(id) ?? []).filter((child) => containers.has(child) && children.get(child)?.length);
  const top = groupsUnder(null);
  const middle = top.flatMap((id) => {
    const first = groupsUnder(id);
    if (first.length === 0) return [id];
    let level = first;
    while (level.length === 1) level = groupsUnder(level[0]!);
    return level.length ? level : first;
  });
  return { top, middle, hasMiddle: middle.some((id) => containers.get(id)?.parentId !== null) };
}

interface Recommendation {
  readonly folded: readonly Id[];
  readonly layout: LayoutMode | null;
}

export function recommendDiagramSummary(
  doc: Document,
  appearance: Appearance,
  view: DiagramView,
  size: { width: number; height: number },
  bounds: (scene: Scene) => Rect | null = (scene) => scene.bounds,
): Recommendation {
  const expanded: Recommendation = { folded: [], layout: view.content && view.content !== 'all' ? view.layout : null };
  const { top, middle, hasMiddle } = summaryGroups(projectDiagramContent(doc, view.content ?? 'all'));
  if (!top.length || size.width <= 96 || size.height <= 96) return expanded;

  const baseline = computeDiagramView(doc, appearance, { ...view, folded: new Set(), layout: expanded.layout });
  const zoomToFit = (scene: Scene) => fitView(bounds(scene), size).zoom;
  const baselineZoom = zoomToFit(baseline);
  const readable = baselineZoom >= 0.68;
  const compact = readable && baseline.nodes.length <= 12 && baseline.edges.length <= 12;
  const dense = baseline.nodes.length >= 30 || baseline.edges.length >= 40;
  const levels = hasMiddle ? [middle] : [];
  if (!compact && (dense || !readable || !hasMiddle)) levels.push(top);

  let best = expanded;
  let bestScore = readability(baseline, baselineZoom);
  for (const folded of levels) {
    const foldSet = new Set(folded);
    for (const layout of LAYOUT_MODES) {
      const scene = computeDiagramView(doc, appearance, { ...view, folded: foldSet, layout });
      const minimumLinks = folded === top ? Math.ceil(baseline.edges.length / 5) : Math.min(baseline.edges.length, 1);
      if (scene.nodes.length < 2 || scene.edges.length < minimumLinks) break;
      const zoom = zoomToFit(scene);
      if (compact && zoom < baselineZoom * 1.35) continue;
      const score = readability(scene, zoom);
      if (score > bestScore) {
        best = { folded, layout };
        bestScore = score;
      }
    }
  }
  return best;
}

function readability(scene: Scene, zoom: number): number {
  const routeLength = scene.edges.reduce((sum, edge) => sum + polylineLength(edge.points), 0);
  const averageRoute = routeLength / Math.max(1, scene.edges.length);
  const objects = scene.nodes.length + scene.edges.length;
  return zoom / (1 + averageRoute / 2000) / (1 + objects / 140);
}
