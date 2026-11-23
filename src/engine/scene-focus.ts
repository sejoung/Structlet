import { descendants, type Document, type Id, type Rect } from '../domain';
import { containsRect, inflate, intersects, union } from './geometry';
import { isoBlockHeight, projectIsoRect, type IsometricLayout } from './isometric-layout';
import type { Scene } from './scene';

export function groupBounds(doc: Document, scene: Scene, id: Id, isometric?: IsometricLayout): Rect | null {
  const group = scene.rects.get(id);
  if (!group) return null;
  const ids = new Set([id, ...descendants(doc, id)]);
  const nodes = scene.nodes.filter((node) => ids.has(node.id));
  const areas = scene.containers.filter((area) => ids.has(area.id));
  const notes = scene.annotations.filter((note) => containsRect(group, note.rect));
  if (!isometric) return union([group, ...areas.map((area) => area.rect), ...notes.map((note) => note.rect),
    ...nodes.flatMap((node) => [node.rect, ...(node.labelBox ? [node.labelBox] : []), ...(node.specCaption ? [node.specCaption.box] : [])])]);

  const project = (rect: Rect, raise = 0) => {
    const floor = union(projectIsoRect(rect, isometric.rotation).map((point) => ({ ...point, width: 0, height: 0 })))!;
    return { ...floor, y: floor.y - raise, height: floor.height + raise };
  };
  const base = union([project(group), ...areas.map((area) => project(area.rect)), ...nodes.map((node) => project(node.rect, isoBlockHeight(node)))])!;
  for (const note of notes) ids.add(note.id);
  for (const edge of scene.edges) if (edge.sourceId && edge.targetId && ids.has(edge.sourceId) && ids.has(edge.targetId)) ids.add(edge.id);
  const nearby = inflate(base, 72);
  return union([base, ...isometric.labels.filter((label) => ids.has(label.id) && intersects(label.box, nearby)).map((label) => label.box)]);
}
