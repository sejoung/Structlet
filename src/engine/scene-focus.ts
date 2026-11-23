import { descendants, type Document, type Id, type Point, type Rect } from '../domain';
import { containsRect, inflate, intersects, union } from './geometry';
import { isoBlockHeight, projectIso, projectIsoRect, type IsometricLayout } from './isometric-layout';
import type { Scene } from './scene';

function pointBounds(points: readonly Point[]): Rect | null {
  return union(points.map((point) => ({ ...point, width: 0, height: 0 })));
}

function projectedBounds(rect: Rect, rotation: number, raise = 0): Rect {
  const floor = pointBounds(projectIsoRect(rect, rotation))!;
  return { ...floor, y: floor.y - raise, height: floor.height + raise };
}

export function objectBounds(scene: Scene, ids: readonly Id[], isometric?: IsometricLayout): Rect | null {
  const selected = new Set(ids);
  const nodes = scene.nodes.filter((node) => selected.has(node.id));
  const edges = scene.edges.filter((edge) => selected.has(edge.id));
  const areas = scene.containers.filter((area) => selected.has(area.id));
  const bounds = isometric ? union([
    ...areas.map(({ rect }) => projectedBounds(rect, isometric.rotation)),
    ...nodes.map((node) => projectedBounds(node.rect, isometric.rotation, isoBlockHeight(node))),
    ...edges.flatMap((edge) => pointBounds(edge.points.map((point) => projectIso(point, isometric.rotation))) ?? []),
    ...isometric.labels.filter((label) => selected.has(label.id)).map(({ box }) => box),
  ]) : union([
    ...areas.map(({ rect }) => rect),
    ...nodes.flatMap((node) => [node.rect, ...(node.labelBox ? [node.labelBox] : []), ...(node.specCaption ? [node.specCaption.box] : [])]),
    ...edges.flatMap((edge) => [pointBounds(edge.points), edge.labelBox].filter((box): box is Rect => !!box)),
    ...scene.annotations.filter((note) => selected.has(note.id)).map(({ rect }) => rect),
  ]);
  return bounds ? { ...bounds, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) } : null;
}

export function groupBounds(doc: Document, scene: Scene, id: Id, isometric?: IsometricLayout): Rect | null {
  const group = scene.rects.get(id);
  if (!group) return null;
  const ids = new Set([id, ...descendants(doc, id)]);
  const nodes = scene.nodes.filter((node) => ids.has(node.id));
  const areas = scene.containers.filter((area) => ids.has(area.id));
  const notes = scene.annotations.filter((note) => containsRect(group, note.rect));
  if (!isometric) return union([group, ...areas.map((area) => area.rect), ...notes.map((note) => note.rect),
    ...nodes.flatMap((node) => [node.rect, ...(node.labelBox ? [node.labelBox] : []), ...(node.specCaption ? [node.specCaption.box] : [])])]);

  const project = (rect: Rect, raise = 0) => projectedBounds(rect, isometric.rotation, raise);
  const base = union([project(group), ...areas.map((area) => project(area.rect)), ...nodes.map((node) => project(node.rect, isoBlockHeight(node)))])!;
  for (const note of notes) ids.add(note.id);
  for (const edge of scene.edges) if (edge.sourceId && edge.targetId && ids.has(edge.sourceId) && ids.has(edge.targetId)) ids.add(edge.id);
  const nearby = inflate(base, 72);
  return union([base, ...isometric.labels.filter((label) => ids.has(label.id) && intersects(label.box, nearby)).map((label) => label.box)]);
}
