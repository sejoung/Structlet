import { ancestors, getBox, indexDocument, worldRect, type Document, type Id, type Point } from '../../domain';
import { union } from '../geometry';
import { arrange, LAYOUT_GAP, type LayoutMode } from './arrange';
import { AREA_PADDING, footprint, liftLinks } from './place';

/** Lay out siblings from the leaves up so every parent is sized before it is placed. */
export function layoutDocument(doc: Document, mode: LayoutMode): Document {
  const index = indexDocument(doc);
  const boxes = new Map([...doc.containers, ...doc.nodes].map((box) => [box.id, { ...box }]));
  const locked = new Set([...boxes.values()].filter((box) => box.locked).map((box) => box.id));
  const anchored = new Set([...locked, ...[...locked].flatMap((id) => ancestors(doc, id))]);
  const insideLocked = (id: Id) => locked.has(id) || ancestors(doc, id).some((ancestor) => locked.has(ancestor));
  const slot = (id: Id) => {
    const box = boxes.get(id)!;
    const size = footprint(box);
    return { x: box.x - size.offsetX, y: box.y, width: size.width, height: size.height };
  };
  const parents: (Id | null)[] = [...doc.containers]
    .sort((a, b) => ancestors(doc, b.id).length - ancestors(doc, a.id).length)
    .map((area) => area.id);
  parents.push(null);

  for (const parent of parents) {
    if (parent !== null && insideLocked(parent)) continue;
    const children = index.children.get(parent) ?? [];
    const movable = children.filter((id) => !anchored.has(id));
    const fixed = union(children.filter((id) => anchored.has(id)).map(slot));
    const pos = arrange(movable.map((id) => ({ id, ...footprint(boxes.get(id)!) })), liftLinks(doc, new Set(movable)), mode);
    const x = parent === null ? 40 : AREA_PADDING.side;
    const y = fixed ? Math.max(parent === null ? 40 : AREA_PADDING.top, fixed.y + fixed.height + LAYOUT_GAP.secondary)
      : parent === null ? 40 : AREA_PADDING.top;
    for (const id of movable) {
      const box = boxes.get(id)!;
      const p = pos.get(id)!;
      box.x = Math.round(x + p.x + footprint(box).offsetX);
      box.y = Math.round(y + p.y);
    }
    const area = parent === null ? null : boxes.get(parent);
    const content = union(children.map(slot));
    if (area && content) {
      area.width = Math.ceil(Math.max(240, content.x + content.width + AREA_PADDING.side));
      area.height = Math.ceil(Math.max(160, content.y + content.height + AREA_PADDING.bottom));
    }
  }

  const placed: Document = {
    ...doc,
    containers: doc.containers.map((area) => ({ ...area, ...boxes.get(area.id)! })),
    nodes: doc.nodes.map((node) => ({ ...node, ...boxes.get(node.id)! })),
  };
  const delta = new Map<Id, Point>();
  const resized = new Set<Id>();
  for (const id of boxes.keys()) {
    const before = worldRect(doc, getBox(doc, id)!);
    const after = worldRect(placed, getBox(placed, id)!);
    delta.set(id, { x: after.x - before.x, y: after.y - before.y });
    if (after.width !== before.width || after.height !== before.height) resized.add(id);
  }
  const stationary = { x: 0, y: 0 };
  const offset = (point: Point, by: Point): Point => ({ x: point.x + by.x, y: point.y + by.y });
  const endDelta = (end: Document['edges'][number]['source']) => end.kind === 'attached' ? delta.get(end.objectId) ?? stationary : stationary;
  return {
    ...placed,
    edges: doc.edges.map((edge) => {
      if (edge.routingMode !== 'manual') return edge;
      const a = endDelta(edge.source);
      const b = endDelta(edge.target);
      const resizedEndpoint = [edge.source, edge.target].some((end) => end.kind === 'attached' && resized.has(end.objectId));
      if (resizedEndpoint || a.x !== b.x || a.y !== b.y) return { ...edge, routingMode: 'auto', waypoints: [] };
      return a.x || a.y ? { ...edge, waypoints: edge.waypoints.map((p) => offset(p, a)) } : edge;
    }),
    annotations: doc.annotations.map((note) => note.targetId ? { ...note, ...offset(note, delta.get(note.targetId) ?? stationary) } : note),
  };
}
