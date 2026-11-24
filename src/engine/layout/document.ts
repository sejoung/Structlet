import { ancestors, indexDocument, worldOrigin, type Annotation, type Document, type Endpoint, type Id, type Point, type Rect } from '../../domain';
import { containsPoint, union } from '../geometry';
import { annotationRect, BOX_NODE, CONTAINER_HEADER, worldRects } from '../scene';
import { measureText, wrapText } from '../text';
import { arrange, LAYOUT_GAP, type LayoutMode } from './arrange';
import { AREA_PADDING, footprint, liftLinks } from './place';
import { layoutRoutingQuality } from './routing-quality';

const NOTE_GAP = 24;
const ORIGIN = { x: 0, y: 0 };
const offset = (point: Point, by: Point): Point => ({ x: point.x + by.x, y: point.y + by.y });

export function layoutDocument(doc: Document, mode: LayoutMode, folded: ReadonlySet<Id> = new Set()): Document {
  const compareGroups = mode !== 'grid' && hasDenseGroupConnections(doc);
  const standard = arrangeDocument(doc, mode, false, !compareGroups, folded);
  if (!compareGroups) return standard;
  const compact = arrangeDocument(doc, mode, true, false, folded);
  const a = layoutRoutingQuality(standard);
  const b = layoutRoutingQuality(compact);
  const difference = b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  return difference < 0 ? compact : standard;
}

function hasDenseGroupConnections(doc: Document): boolean {
  if (doc.edges.length < 36 || doc.edges.length > 180 || doc.containers.length < 6) return false;
  const parents = new Map([...doc.nodes, ...doc.containers].map(({ id, parentId }) => [id, parentId]));
  const boundaryLinks = doc.edges.filter(({ source, target }) => source.kind === 'attached' && target.kind === 'attached' &&
    parents.get(source.objectId) !== parents.get(target.objectId)).length;
  return boundaryLinks >= 14;
}

function arrangeDocument(doc: Document, mode: LayoutMode, compactGroups: boolean, rankDashed: boolean, folded: ReadonlySet<Id>): Document {
  const index = indexDocument(doc);
  const before = worldRects(doc);
  const areaOrder = doc.containers.map((area) => ({ area, depth: ancestors(doc, area.id).length }))
    .sort((a, b) => b.depth - a.depth).map(({ area }) => area);
  const boxes = new Map([...doc.containers, ...doc.nodes].map((box) => [box.id, { ...box }]));
  const locked = new Set([...boxes.values()].filter((box) => box.locked).map((box) => box.id));
  const anchored = new Set([...locked, ...[...locked].flatMap((id) => ancestors(doc, id))]);
  const frozen = (id: Id) => locked.has(id) || ancestors(doc, id).some((ancestor) => locked.has(ancestor));
  const insideFold = (id: Id) => folded.size > 0 && ancestors(doc, id).some((ancestor) => folded.has(ancestor));
  const closed = (id: Id) => folded.has(id) || insideFold(id);
  const ownerOf = (point: Point) => areaOrder.find((area) => containsPoint(before.get(area.id)!, point))?.id ?? null;

  const notesByArea = new Map<Id | null, Annotation[]>();
  const retainedNoteOwners = new Map<Id, Id>();
  for (const note of doc.annotations) {
    const target = note.targetId ? boxes.get(note.targetId) : undefined;
    const owner = !target ? ownerOf(note) : 'serviceId' in target ? target.parentId : target.id;
    if (owner !== null && closed(owner)) retainedNoteOwners.set(note.id, owner);
    const group = notesByArea.get(owner) ?? [];
    group.push(note);
    notesByArea.set(owner, group);
  }

  const slot = (id: Id): Rect => {
    const box = boxes.get(id)!;
    const size = footprint(box);
    return { x: box.x - size.offsetX, y: box.y, width: size.width, height: size.height };
  };
  const notes = new Map<Id, { parent: Id | null; rect: Rect }>();
  for (const node of doc.nodes) {
    if (node.variant !== 'box' || frozen(node.id) || insideFold(node.id)) continue;
    const box = boxes.get(node.id)!;
    const inset = BOX_NODE.pad * 2 + BOX_NODE.icon + BOX_NODE.gap;
    const natural = Math.max(...node.label.split('\n').map((line) => measureText(line, BOX_NODE.fontSize)));
    box.width = Math.max(node.width, Math.min(224, Math.ceil(natural + inset + 4)), inset + 28);
    const lines = wrapText(node.label, box.width - inset, BOX_NODE.fontSize, Number.POSITIVE_INFINITY);
    box.height = Math.max(node.height, BOX_NODE.icon + 12, lines.length * BOX_NODE.lineHeight + 10);
  }

  for (const parent of [...areaOrder.map((area) => area.id), null]) {
    if (parent !== null && (frozen(parent) || closed(parent))) continue;
    const children = index.children.get(parent) ?? [];
    const movable = children.filter((id) => !anchored.has(id));
    const fixed = union(children.filter((id) => anchored.has(id)).map(slot));
    const grouping = compactGroups && parent !== null ? 'grid' : mode;
    const pos = arrange(movable.map((id) => ({ id, ...footprint(boxes.get(id)!) })), liftLinks(doc, new Set(movable), rankDashed), grouping);
    const x = parent === null ? 40 : AREA_PADDING.side;
    const top = parent === null ? 40 : AREA_PADDING.top;
    const y = fixed ? Math.max(top, fixed.y + fixed.height + LAYOUT_GAP.secondary) : top;
    for (const id of movable) {
      const box = boxes.get(id)!;
      const p = pos.get(id)!;
      box.x = Math.round(x + p.x + footprint(box).offsetX);
      box.y = Math.round(y + p.y);
    }

    const content = union(children.map(slot));
    const area = parent === null ? undefined : boxes.get(parent);
    const dx = area && content ? Math.max(0, AREA_PADDING.side - content.x) : 0;
    const dy = area && content ? Math.max(0, AREA_PADDING.top - content.y) : 0;
    if (area && (dx || dy)) {
      area.x -= dx;
      area.y -= dy;
      for (const id of children) {
        const child = boxes.get(id)!;
        child.x += dx;
        child.y += dy;
      }
    }
    const body = union(children.map(slot));
    const noteY = body ? body.y + body.height + NOTE_GAP : top;
    const rowWidth = Math.max(440, body ? body.x + body.width - x : 0);
    const noteRects = placeNotes(notesByArea.get(parent) ?? [], x, noteY, rowWidth);
    for (const [id, rect] of noteRects) notes.set(id, { parent, rect });

    if (area) {
      const bounds = union([...children.map(slot), ...noteRects.values()]);
      const titleWidth = Math.ceil(measureText(area.label, CONTAINER_HEADER.fontSize) + CONTAINER_HEADER.glyph + 42);
      area.width = Math.max(240, titleWidth, bounds ? Math.ceil(bounds.x + bounds.width + AREA_PADDING.side) : area.width);
      area.height = Math.max(160, bounds ? Math.ceil(bounds.y + bounds.height + AREA_PADDING.bottom) : area.height);
    }
  }

  const placed: Document = {
    ...doc,
    containers: doc.containers.map((area) => ({ ...area, ...boxes.get(area.id)! })),
    nodes: doc.nodes.map((node) => ({ ...node, ...boxes.get(node.id)! })),
  };
  const after = worldRects(placed);
  const delta = new Map<Id, Point>();
  const resized = new Set<Id>();
  for (const [id, next] of after) {
    const prior = before.get(id)!;
    delta.set(id, { x: next.x - prior.x, y: next.y - prior.y });
    if (next.width !== prior.width || next.height !== prior.height) resized.add(id);
  }
  const endDelta = (end: Endpoint) => end.kind === 'attached' ? delta.get(end.objectId) ?? ORIGIN : ORIGIN;
  const sizeChanged = (end: Endpoint) => end.kind === 'attached' && resized.has(end.objectId);
  const autoSide = (end: Endpoint): Endpoint =>
    end.kind === 'attached' && end.offset === null && end.side !== 'auto' ? { ...end, side: 'auto' } : end;

  return {
    ...placed,
    edges: doc.edges.map((edge) => {
      const a = endDelta(edge.source);
      const b = endDelta(edge.target);
      const changed = [a, b].some((by) => by.x !== 0 || by.y !== 0) || sizeChanged(edge.source) || sizeChanged(edge.target);
      if (!changed) return edge;
      const relativeChange = a.x !== b.x || a.y !== b.y || sizeChanged(edge.source) || sizeChanged(edge.target);
      if (edge.routingMode === 'manual' && !relativeChange) return { ...edge, waypoints: edge.waypoints.map((p) => offset(p, a)) };
      if (!relativeChange) return edge;
      return { ...edge, source: autoSide(edge.source), target: autoSide(edge.target), routingMode: 'auto', waypoints: [] };
    }),
    annotations: doc.annotations.map((note) => {
      const owner = retainedNoteOwners.get(note.id);
      if (owner !== undefined) return { ...note, ...offset(note, delta.get(owner) ?? ORIGIN) };
      const entry = notes.get(note.id);
      if (!entry) return note;
      const { x, y } = offset(entry.rect, worldOrigin(placed, entry.parent));
      return { ...note, x, y };
    }),
  };
}

function placeNotes(notes: readonly Annotation[], x: number, y: number, width: number): Map<Id, Rect> {
  const placed = new Map<Id, Rect>();
  let left = x;
  let top = y;
  let rowHeight = 0;
  for (const note of notes) {
    const { rect } = annotationRect(note);
    if (left > x && left + rect.width > x + width) {
      left = x;
      top += rowHeight + NOTE_GAP;
      rowHeight = 0;
    }
    placed.set(note.id, { ...rect, x: left, y: top });
    left += Math.ceil(rect.width) + NOTE_GAP;
    rowHeight = Math.max(rowHeight, rect.height);
  }
  return placed;
}
