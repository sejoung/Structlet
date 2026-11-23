import { ancestors, type Annotation, type Document, type Id, type Rect } from '../../domain';
import { containsRect, intersects, union } from '../geometry';
import { layoutNodeLabels } from '../node-labels';
import { annotationRect, CONTAINER_HEADER, worldRects } from '../scene';

const GAP = 24;

export function placeImportedAnnotations(doc: Document, ids: readonly Id[]): Document {
  if (!ids.length) return doc;
  const pending = new Set(ids);
  const rects = worldRects(doc);
  const visibleBounds = new Map(rects);
  const occupied: Rect[] = [];
  for (const node of doc.nodes) {
    const rect = rects.get(node.id)!;
    const { labelBox, specCaption } = layoutNodeLabels(node, rect);
    const bounds = union([rect, ...(labelBox ? [labelBox] : []), ...(specCaption ? [specCaption.box] : [])])!;
    visibleBounds.set(node.id, bounds);
    occupied.push(bounds);
  }
  const areas = doc.containers.map(({ id }) => ({ id, rect: rects.get(id)! }));
  const placed = new Map<Id, Annotation>();
  for (const note of doc.annotations) {
    const target = note.targetId ? rects.get(note.targetId) : undefined;
    if (pending.has(note.id) && (note.kind !== 'step' || !target)) continue;
    const fixed = pending.has(note.id) && target ? { ...note, x: Math.round(target.x - 14), y: Math.round(target.y - 14) } : note;
    occupied.push(annotationRect(fixed).rect);
    placed.set(note.id, fixed);
  }

  const bounds = union([...areas.map(({ rect }) => rect), ...occupied]);
  const x = Math.floor(bounds?.x ?? 40);
  let bottom = bounds ? bounds.y + bounds.height + GAP : 40;
  for (const note of doc.annotations) {
    if (placed.has(note.id)) continue;
    const measured = annotationRect(note).rect;
    const target = note.targetId ? visibleBounds.get(note.targetId) : undefined;
    const owners = new Set(note.targetId ? ancestors(doc, note.targetId) : []);
    const beside = target ? nearby(target, measured).find((candidate) =>
      occupied.every((slot) => !intersects(slot, candidate)) && areas.every(({ id, rect }) =>
        !intersects(rect, candidate) || (owners.has(id) && containsRect(rect, candidate) && candidate.y >= rect.y + CONTAINER_HEADER.height)),
    ) : undefined;
    const rect = beside ?? { ...measured, x, y: Math.ceil(bottom) };
    occupied.push(rect);
    bottom = Math.max(bottom, rect.y + rect.height + GAP);
    placed.set(note.id, { ...note, x: rect.x, y: rect.y });
  }
  return { ...doc, annotations: doc.annotations.map(({ id }) => placed.get(id)!) };
}

function nearby(target: Rect, note: Rect): Rect[] {
  return [
    { x: Math.ceil(target.x + target.width + GAP), y: Math.ceil(target.y) },
    { x: Math.ceil(target.x), y: Math.ceil(target.y + target.height + GAP) },
    { x: Math.floor(target.x - note.width - GAP), y: Math.ceil(target.y) },
    { x: Math.ceil(target.x), y: Math.floor(target.y - note.height - GAP) },
  ].map(({ x, y }) => ({ ...note, x, y }));
}
