import {
  ancestors,
  indexDocument,
  type Annotation,
  type AnnotationKind,
  type Container,
  type ContainerKind,
  type ContainerStyle,
  type Document,
  type EdgeStyle,
  type Id,
  type Point,
  type Rect,
  type NodeVariant,
  type Side,
} from '../domain';
import { AREA_STROKE, type Appearance, type Glyph } from './appearance';
import { containsPoint, containsRect, inflate, intersects, polylineLength, union } from './geometry';
import { layoutNodeLabels, type NodeLabels } from './node-labels';
import { alternatePorts, resolveEndpoints, type Blocker, type PortFrame } from './routing/ports';
import { OBSTACLE_MARGIN, routeAuto, routeClears, routeInTightSpace, routeManual, routeStraight } from './routing/route';
import { measureText, wrapText } from './text';


export { BOX_NODE, NODE_LABEL } from './node-labels';
export const CONTAINER_HEADER = { height: 28, fontSize: 12, glyph: 22 } as const;
export const EDGE_LABEL = { fontSize: 11, lineHeight: 14, padX: 5, padY: 3 } as const;
export const ANNOTATION_TEXT = { fontSize: 13, lineHeight: 18, maxWidth: 320 } as const;
export const STEP_SIZE = 24;

export interface SceneContainer {
  readonly id: Id;
  readonly kind: ContainerKind;
  readonly rect: Rect;
  readonly depth: number;
  readonly label: string;
  readonly style: ContainerStyle;
  readonly glyph: Glyph | null;
  readonly image: string | null;
  readonly locked: boolean;
}

export interface SceneNode extends NodeLabels {
  readonly id: Id;
  readonly variant: NodeVariant;
  readonly summary?: boolean;
  readonly rect: Rect;
  readonly fullLabel?: string;
  readonly glyph: Glyph;
  readonly image: string | null;
  readonly color: string;
  readonly serviceName: string;
  readonly knownService: boolean;
  readonly locked: boolean;
}

export interface SceneEdge {
  readonly id: Id;
  readonly points: readonly Point[];
  readonly sourceId: Id | null;
  readonly targetId: Id | null;
  readonly label: readonly string[];
  readonly fullLabel?: string;
  readonly labelBox: Rect | null;
  readonly labelAnchor: Point | null;
  readonly labelTints: readonly string[];
  readonly style: EdgeStyle;
  readonly manual: boolean;
  readonly sourceSide: Side | null;
  readonly targetSide: Side | null;
}

export interface SceneAnnotation {
  readonly id: Id;
  readonly kind: AnnotationKind;
  readonly fullText?: string;
  readonly rect: Rect;
  readonly lines: readonly string[];
}

export interface Scene {
  readonly containers: readonly SceneContainer[];
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  readonly annotations: readonly SceneAnnotation[];
  readonly frames: ReadonlyMap<Id, PortFrame>;
  readonly rects: ReadonlyMap<Id, Rect>;
  readonly bounds: Rect | null;
}

function textBlock(lines: readonly string[], fontSize: number): number {
  return Math.max(0, ...lines.map((l) => measureText(l, fontSize)));
}

export type LegendMarker = { kind: 'swatch'; color: string } | { kind: 'line'; dashed: boolean } | null;

export function legendMarker(line: string): { marker: LegendMarker; text: string } {
  const swatch = /^(#[0-9a-fA-F]{6})\s+(.*)$/.exec(line);
  if (swatch) return { marker: { kind: 'swatch', color: swatch[1]! }, text: swatch[2]! };
  if (line.startsWith('--- ')) return { marker: { kind: 'line', dashed: false }, text: line.slice(4) };
  if (line.startsWith('- - ')) return { marker: { kind: 'line', dashed: true }, text: line.slice(4) };
  return { marker: null, text: line };
}

export const LEGEND_MARKER_WIDTH = 30;

export function annotationRect(a: Annotation): { rect: Rect; lines: string[] } {
  if (a.kind === 'step') return { rect: { x: a.x, y: a.y, width: STEP_SIZE, height: STEP_SIZE }, lines: [a.text] };
  const lines = a.kind === 'legend' ? a.text.split('\n') : wrapText(a.text || ' ', ANNOTATION_TEXT.maxWidth, ANNOTATION_TEXT.fontSize, Number.POSITIVE_INFINITY);
  const pad = a.kind === 'legend' ? 12 : 0;
  const widths = lines.map((l) => {
    if (a.kind !== 'legend') return measureText(l, ANNOTATION_TEXT.fontSize);
    const { marker, text } = legendMarker(l);
    return measureText(text, ANNOTATION_TEXT.fontSize) + (marker ? LEGEND_MARKER_WIDTH : 0);
  });
  const width = Math.max(24, ...widths) + pad * 2;
  const height = lines.length * ANNOTATION_TEXT.lineHeight + pad * 2;
  return { rect: { x: a.x, y: a.y, width, height }, lines };
}

export function worldRects(doc: Document): Map<Id, Rect> {
  const index = indexDocument(doc);
  const origins = new Map<Id, Point>();
  const rects = new Map<Id, Rect>();
  const originOf = (parentId: Id | null, guard: number): Point => {
    if (parentId === null || guard > 64) return { x: 0, y: 0 };
    const hit = origins.get(parentId);
    if (hit) return hit;
    const c = index.containers.get(parentId);
    if (!c) return { x: 0, y: 0 };
    const o = originOf(c.parentId, guard + 1);
    const p = { x: o.x + c.x, y: o.y + c.y };
    origins.set(parentId, p);
    return p;
  };
  for (const box of [...doc.containers, ...doc.nodes]) {
    const o = originOf(box.parentId, 0);
    rects.set(box.id, { x: o.x + box.x, y: o.y + box.y, width: box.width, height: box.height });
  }
  return rects;
}

function containerDepth(doc: Document, c: Container): number {
  const index = indexDocument(doc);
  let d = 0;
  let p = c.parentId;
  while (p !== null && d < 64) {
    d++;
    p = index.containers.get(p)?.parentId ?? null;
  }
  return d;
}

export function computeScene(doc: Document, appearance: Appearance, summaries?: ReadonlyMap<Id, Container>): Scene {
  const rects = worldRects(doc);
  const frames = new Map<Id, PortFrame>();
  const containers: SceneContainer[] = doc.containers
    .map((c, order) => ({ c, order, depth: containerDepth(doc, c) }))
    .sort((a, b) => a.depth - b.depth || a.order - b.order)
    .map(({ c, depth }) => {
      const rect = rects.get(c.id)!;
      frames.set(c.id, { left: rect.x, right: rect.x + rect.width, top: rect.y, bottom: rect.y + rect.height, sideTop: rect.y, sideBottom: rect.y + rect.height });
      return { id: c.id, kind: c.kind, rect, depth, label: c.label, style: c.style, glyph: appearance.containerGlyph(c.kind), image: appearance.containerImage?.(c.kind) ?? null, locked: c.locked };
    });

  const obstacles: Rect[] = [];
  const blockers: Blocker[] = [];
  const nodes: SceneNode[] = doc.nodes.map((n) => {
    const rect = rects.get(n.id)!;
    const group = summaries?.get(n.id);
    const service = group ? {
      name: group.label,
      glyph: appearance.containerGlyph(group.kind) ?? appearance.fallback.glyph,
      color: AREA_STROKE[group.style.color]!,
      image: appearance.containerImage?.(group.kind) ?? undefined,
    } : appearance.service(n.serviceId);
    const look = service ?? appearance.fallback;
    const base = { id: n.id, fullLabel: n.label, summary: !!group, variant: n.variant, rect, glyph: look.glyph, image: look.image ?? null, color: look.color, serviceName: look.name, knownService: !!service, locked: n.locked };
    const labels = layoutNodeLabels(n, rect);
    const lowerLabel = labels.specCaption?.box ?? labels.labelBox;
    const bottom = lowerLabel ? lowerLabel.y + lowerLabel.height + 2 : rect.y + rect.height;
    frames.set(n.id, { left: rect.x, right: rect.x + rect.width, top: rect.y, bottom, sideTop: rect.y, sideBottom: rect.y + rect.height });
    for (const box of [rect, labels.labelBox, labels.specCaption?.box]) {
      if (!box) continue;
      obstacles.push(box);
      blockers.push({ id: n.id, rect: box });
    }
    return { ...base, ...labels };
  });

  const annotations: SceneAnnotation[] = doc.annotations.map((a) => ({ id: a.id, kind: a.kind, fullText: a.text, ...annotationRect(a) }));
  for (const note of annotations) {
    if (note.kind === 'step') continue;
    obstacles.push(note.rect);
    blockers.push({ id: note.id, rect: note.rect });
  }
  const edges: SceneEdge[] = [];
  const routed: (readonly [Point, Point])[] = [];
  const taken: Rect[] = [...obstacles, ...annotations.filter((note) => note.kind === 'step').map((note) => note.rect)];
  const titles = containers.filter((area) => area.label).map((area) => {
    const extra = area.glyph || area.image ? CONTAINER_HEADER.glyph + 8 : 10;
    const width = extra + measureText(area.label, CONTAINER_HEADER.fontSize);
    return { id: area.id, rect: { x: area.rect.x, y: area.rect.y, width, height: CONTAINER_HEADER.height } };
  });
  taken.push(...titles.map(({ rect }) => rect));
  const ends = resolveEndpoints(doc.edges, frames, [...blockers, ...titles]);
  const parents = new Map<Id, readonly Id[]>();
  const parentsOf = (id: Id) => {
    const cached = parents.get(id);
    if (cached) return cached;
    const chain = ancestors(doc, id);
    parents.set(id, chain);
    return chain;
  };
  const paths = new Map<Id, Point[]>();
  const order = doc.edges.flatMap((edge) => {
    const pair = ends.get(edge.id);
    if (!pair) return [];
    const { source, target } = pair;
    const distance = Math.abs(source.point.x - target.point.x) + Math.abs(source.point.y - target.point.y);
    const fixed = edge.routingMode === 'manual' || edge.style.shape === 'straight';
    return [{ edge, pair, distance, fixed }];
  }).sort((a, b) => Number(b.fixed) - Number(a.fixed) || a.distance - b.distance);
  for (const { edge, pair } of order) {
    const { source, target } = pair;
    let points: Point[];
    if (edge.style.shape === 'straight') points = routeStraight(source, target, edge.routingMode === 'manual' ? edge.waypoints : []);
    else if (edge.routingMode === 'manual') points = routeManual(source, target, edge.waypoints, obstacles);
    else {
      const related = new Set([source.objectId, target.objectId]);
      for (const id of [source.objectId, target.objectId]) if (id) for (const parent of parentsOf(id)) related.add(parent);
      const offLimits = new Set<Id>();
      const areas: Rect[] = [];
      for (const { id, rect } of containers) {
        if (related.has(id) || parentsOf(id).some((parent) => offLimits.has(parent))) continue;
        if (containsPoint(inflate(rect, OBSTACLE_MARGIN), source.point) || containsPoint(inflate(rect, OBSTACLE_MARGIN), target.point)) continue;
        offLimits.add(id);
        areas.push(rect);
      }
      const headers = titles.filter(({ id, rect }) => id !== source.objectId && id !== target.objectId &&
        !containsPoint(inflate(rect, OBSTACLE_MARGIN), source.point) && !containsPoint(inflate(rect, OBSTACLE_MARGIN), target.point)).map(({ rect }) => rect);
      const hard = [...obstacles, ...headers];
      points = cachedAuto(source, target, hard, areas, routed);
      if (hard.length <= 180 && !routeClears(points, hard)) {
        const sources = alternatePorts(edge.source, source.objectId ? frames.get(source.objectId) : undefined, source);
        const targets = alternatePorts(edge.target, target.objectId ? frames.get(target.objectId) : undefined, target);
        const choices = [source, ...sources].flatMap((from) => [target, ...targets]
          .filter((to) => from !== source || to !== target).map((to) => ({ source: from, target: to,
            cost: Math.abs(from.point.x - to.point.x) + Math.abs(from.point.y - to.point.y) + Number(from !== source && to !== target) * 40 })))
          .sort((a, b) => a.cost - b.cost);
        for (const choice of choices.slice(0, 6)) {
          const alternative = routeInTightSpace(choice.source, choice.target, hard);
          if (!alternative || !routeClears(alternative, hard)) continue;
          points = alternative;
          ends.set(edge.id, choice);
          break;
        }
      }
    }
    paths.set(edge.id, points);
    for (let i = 1; i < points.length; i++) routed.push([points[i - 1]!, points[i]!]);
  }

  for (const e of doc.edges) {
    const pair = ends.get(e.id);
    const points = paths.get(e.id);
    if (!pair || !points) continue;
    const manual = e.routingMode === 'manual';
    const label = e.label.trim() ? wrapText(e.label, 160, EDGE_LABEL.fontSize, 3) : [];
    let labelBox: Rect | null = null;
    let labelAnchor: Point | null = null;
    if (label.length > 0) {
      const w = textBlock(label, EDGE_LABEL.fontSize) + EDGE_LABEL.padX * 2;
      const h = label.length * EDGE_LABEL.lineHeight + EDGE_LABEL.padY * 2;
      const source = e.source;
      const target = e.target;
      const targetAreas = target.kind === 'attached' ? new Set(ancestors(doc, target.objectId)) : undefined;
      const common = source.kind === 'attached' && targetAreas
        ? ancestors(doc, source.objectId).find((id) => targetAreas.has(id))
        : undefined;
      ({ box: labelBox, anchor: labelAnchor } = placeLabel(points, w, h, taken, common ? rects.get(common) : undefined));
      taken.push(labelBox);
    }
    const labelTints = labelBox ? tintsAt(containers, { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 }) : [];
    edges.push({ id: e.id, points, sourceId: pair.source.objectId, targetId: pair.target.objectId, label, fullLabel: e.label, labelBox, labelAnchor, labelTints, style: e.style, manual, sourceSide: pair.source.side, targetSide: pair.target.side });
  }

  const all: Rect[] = [
    ...containers.map((c) => c.rect),
    ...nodes.flatMap((n) => [n.rect, ...(n.labelBox ? [n.labelBox] : []), ...(n.specCaption ? [n.specCaption.box] : [])]),
    ...edges.flatMap((e) => [...e.points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })), ...(e.labelBox ? [e.labelBox] : [])]),
    ...annotations.map((a) => a.rect),
  ];
  return { containers, nodes, edges, annotations, frames, rects, bounds: union(all) };
}

function tintsAt(containers: readonly SceneContainer[], p: Point): string[] {
  return containers
    .filter((c) => c.style.filled && p.x >= c.rect.x && p.x <= c.rect.x + c.rect.width && p.y >= c.rect.y && p.y <= c.rect.y + c.rect.height)
    .map((c) => AREA_STROKE[c.style.color] ?? AREA_STROKE.gray!);
}

function pointAt(points: readonly Point[], t: number): Point {
  const goal = polylineLength(points) * t;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + len >= goal && len > 0) {
      const k = (goal - walked) / len;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    walked += len;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function placeLabel(points: readonly Point[], w: number, h: number, taken: readonly Rect[], within?: Rect): { box: Rect; anchor: Point | null } {
  const at = (p: Point): Rect => ({ x: p.x - w / 2, y: p.y - h / 2, width: w, height: h });
  const anchors = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9].map((t) => pointAt(points, t));
  const candidates = anchors.map((point) => ({ box: at(point), anchor: null as Point | null }));
  for (const gap of [6, 18, 36, 64]) for (const point of anchors) {
    const x = w / 2 + gap;
    const y = h / 2 + gap;
    for (const center of [{ x: point.x, y: point.y - y }, { x: point.x, y: point.y + y }, { x: point.x - x, y: point.y }, { x: point.x + x, y: point.y }]) {
      candidates.push({ box: at(center), anchor: point });
    }
  }
  let clear: (typeof candidates)[number] | undefined;
  let best = candidates[0]!;
  let bestOverlap = Number.POSITIVE_INFINITY;
  for (const item of candidates) {
    const box = inflate(item.box, 2);
    const overlap = taken.reduce((sum, rect) => sum + (intersects(rect, box)
      ? (Math.min(rect.x + rect.width, box.x + box.width) - Math.max(rect.x, box.x)) *
        (Math.min(rect.y + rect.height, box.y + box.height) - Math.max(rect.y, box.y))
      : 0), 0);
    if (!overlap) {
      if (!within || containsRect(within, box)) return item;
      clear ??= item;
    }
    if (overlap < bestOverlap) {
      best = item;
      bestOverlap = overlap;
    }
  }
  return clear ?? best;
}

const routeCache = new Map<string, Point[]>();

type Segment = readonly [Point, Point];

function cachedAuto(source: Parameters<typeof routeAuto>[0], target: Parameters<typeof routeAuto>[1], obstacles: readonly Rect[], areas: readonly Rect[], routed: readonly Segment[]): Point[] {
  const minX = Math.min(source.point.x, target.point.x) - 300;
  const maxX = Math.max(source.point.x, target.point.x) + 300;
  const minY = Math.min(source.point.y, target.point.y) - 300;
  const maxY = Math.max(source.point.y, target.point.y) + 300;
  const inside = (r: Rect) => r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY;
  const near = obstacles.filter(inside);
  const nearbyAreas = areas.filter(inside);
  const crossings = routed.filter(([a, b]) => inside({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }));
  const coords = (rects: readonly Rect[]) => rects.map((r) => [r.x, r.y, r.width, r.height]);
  const key = JSON.stringify([source.point, source.side, target.point, target.side, coords(near), coords(nearbyAreas), crossings]);
  const hit = routeCache.get(key);
  if (hit) return hit;
  const preferredObstacles = [...nearbyAreas, ...near.filter((rect) => !nearbyAreas.some((area) => containsRect(area, rect)))];
  const preferred = routeAuto(source, target, preferredObstacles, crossings);
  const route = nearbyAreas.length && !routeClears(preferred, preferredObstacles) ? routeAuto(source, target, near, crossings) : preferred;
  if (routeCache.size > 4000) routeCache.clear();
  routeCache.set(key, route);
  return route;
}
