import {
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
import { intersects, polylineLength, union } from './geometry';
import { resolveEndpoints, type Blocker, type PortFrame } from './routing/ports';
import { routeAuto, routeManual, routeStraight } from './routing/route';
import { measureText, wrapText } from './text';

/** Render-ready description of a document in world coordinates. */

export const NODE_LABEL = { fontSize: 12, lineHeight: 15, gap: 6, maxWidth: 136 } as const;
export const CONTAINER_HEADER = { height: 28, fontSize: 12, glyph: 22 } as const;
export const EDGE_LABEL = { fontSize: 11, lineHeight: 14, padX: 5, padY: 3 } as const;
export const ANNOTATION_TEXT = { fontSize: 13, lineHeight: 18, maxWidth: 320 } as const;
export const STEP_SIZE = 24;
export const BOX_NODE = { icon: 32, pad: 12, gap: 10, fontSize: 12, lineHeight: 15 } as const;

export interface SceneContainer {
  readonly id: Id;
  readonly kind: ContainerKind;
  readonly rect: Rect;
  readonly depth: number;
  readonly label: string;
  readonly style: ContainerStyle;
  readonly glyph: Glyph | null;
  /** Area icon from an icon pack (`data:` URI), drawn instead of the glyph. */
  readonly image: string | null;
  readonly locked: boolean;
}

export interface SceneNode {
  readonly id: Id;
  readonly variant: NodeVariant;
  readonly rect: Rect;
  readonly label: readonly string[];
  readonly labelBox: Rect | null;
  readonly glyph: Glyph;
  /** Official icon from an icon pack (`data:` URI), drawn instead of the tile and glyph. */
  readonly image: string | null;
  readonly color: string;
  readonly serviceName: string;
  readonly knownService: boolean;
  readonly locked: boolean;
}

export interface SceneEdge {
  readonly id: Id;
  readonly points: readonly Point[];
  readonly label: readonly string[];
  readonly labelBox: Rect | null;
  /** Colors of the tinted areas under the label, outermost first, so its box can match what is behind it. */
  readonly labelTints: readonly string[];
  readonly style: EdgeStyle;
  readonly manual: boolean;
  readonly sourceSide: Side | null;
  readonly targetSide: Side | null;
}

export interface SceneAnnotation {
  readonly id: Id;
  readonly kind: AnnotationKind;
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

/** A legend line may start with a color swatch (`#rrggbb`), a solid line sample (`---`) or a dashed one (`- -`). */
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
  const lines = a.kind === 'legend' ? a.text.split('\n') : wrapText(a.text || ' ', ANNOTATION_TEXT.maxWidth, ANNOTATION_TEXT.fontSize, 40);
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

/** World rectangles of every node and container. */
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

export function computeScene(doc: Document, appearance: Appearance): Scene {
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
    const service = appearance.service(n.serviceId);
    const look = service ?? appearance.fallback;
    const base = { id: n.id, variant: n.variant, rect, glyph: look.glyph, image: look.image ?? null, color: look.color, serviceName: look.name, knownService: !!service, locked: n.locked };
    blockers.push({ id: n.id, rect });
    if (n.variant === 'box') {
      const textWidth = rect.width - BOX_NODE.pad - BOX_NODE.icon - BOX_NODE.gap - BOX_NODE.pad;
      const maxLines = Math.max(1, Math.floor((rect.height - 8) / BOX_NODE.lineHeight));
      const label = n.label.trim() ? wrapText(n.label, Math.max(textWidth, 24), BOX_NODE.fontSize, maxLines) : [];
      frames.set(n.id, { left: rect.x, right: rect.x + rect.width, top: rect.y, bottom: rect.y + rect.height, sideTop: rect.y, sideBottom: rect.y + rect.height });
      obstacles.push(rect);
      return { ...base, label, labelBox: null };
    }
    const label = n.label.trim() ? wrapText(n.label, NODE_LABEL.maxWidth, NODE_LABEL.fontSize, 4) : [];
    let labelBox: Rect | null = null;
    if (label.length > 0) {
      const w = textBlock(label, NODE_LABEL.fontSize);
      labelBox = { x: rect.x + rect.width / 2 - w / 2, y: rect.y + rect.height + NODE_LABEL.gap, width: w, height: label.length * NODE_LABEL.lineHeight };
    }
    const bottom = labelBox ? labelBox.y + labelBox.height + 2 : rect.y + rect.height;
    frames.set(n.id, { left: rect.x, right: rect.x + rect.width, top: rect.y, bottom, sideTop: rect.y, sideBottom: rect.y + rect.height });
    obstacles.push(rect);
    if (labelBox) {
      obstacles.push(labelBox);
      blockers.push({ id: n.id, rect: labelBox });
    }
    return { ...base, label, labelBox };
  });

  const ends = resolveEndpoints(doc.edges, frames, blockers);
  const edges: SceneEdge[] = [];
  const routed: (readonly [Point, Point])[] = [];
  const taken: Rect[] = [...obstacles];
  for (const e of doc.edges) {
    const pair = ends.get(e.id);
    if (!pair) continue;
    const manual = e.routingMode === 'manual';
    const points =
      e.style.shape === 'straight'
        ? routeStraight(pair.source, pair.target, manual ? e.waypoints : [])
        : manual
          ? routeManual(pair.source, pair.target, e.waypoints, obstacles)
          : cachedAuto(pair.source, pair.target, obstacles, routed);
    for (let i = 1; i < points.length; i++) routed.push([points[i - 1]!, points[i]!]);
    const label = e.label.trim() ? wrapText(e.label, 160, EDGE_LABEL.fontSize, 3) : [];
    let labelBox: Rect | null = null;
    if (label.length > 0) {
      const w = textBlock(label, EDGE_LABEL.fontSize) + EDGE_LABEL.padX * 2;
      const h = label.length * EDGE_LABEL.lineHeight + EDGE_LABEL.padY * 2;
      labelBox = placeLabel(points, w, h, taken);
      taken.push(labelBox);
    }
    const labelTints = labelBox ? tintsAt(containers, { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 }) : [];
    edges.push({ id: e.id, points, label, labelBox, labelTints, style: e.style, manual, sourceSide: pair.source.side, targetSide: pair.target.side });
  }

  const annotations: SceneAnnotation[] = doc.annotations.map((a) => ({ id: a.id, kind: a.kind, ...annotationRect(a) }));

  const all: Rect[] = [
    ...containers.map((c) => c.rect),
    ...nodes.flatMap((n) => (n.labelBox ? [n.rect, n.labelBox] : [n.rect])),
    ...edges.flatMap((e) => [...e.points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })), ...(e.labelBox ? [e.labelBox] : [])]),
    ...annotations.map((a) => a.rect),
  ];
  return { containers, nodes, edges, annotations, frames, rects, bounds: union(all) };
}

/** Tint colors of filled areas containing a point, outermost first (containers are sorted by depth). */
function tintsAt(containers: readonly SceneContainer[], p: Point): string[] {
  return containers
    .filter((c) => c.style.filled && p.x >= c.rect.x && p.x <= c.rect.x + c.rect.width && p.y >= c.rect.y && p.y <= c.rect.y + c.rect.height)
    .map((c) => AREA_STROKE[c.style.color] ?? AREA_STROKE.gray!);
}

/** Point at fraction `t` of a polyline's length. */
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

/** Label box along the line: the middle if free, otherwise the nearest position that does not cover boxes or other labels. */
function placeLabel(points: readonly Point[], w: number, h: number, taken: readonly Rect[]): Rect {
  const at = (p: Point): Rect => ({ x: p.x - w / 2, y: p.y - h / 2, width: w, height: h });
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const box = at(pointAt(points, t));
    if (!taken.some((r) => intersects(r, box))) return box;
  }
  return at(pointAt(points, 0.5));
}

const routeCache = new Map<string, Point[]>();

type Segment = readonly [Point, Point];

function cachedAuto(source: Parameters<typeof routeAuto>[0], target: Parameters<typeof routeAuto>[1], obstacles: readonly Rect[], routed: readonly Segment[]): Point[] {
  const minX = Math.min(source.point.x, target.point.x) - 300;
  const maxX = Math.max(source.point.x, target.point.x) + 300;
  const minY = Math.min(source.point.y, target.point.y) - 300;
  const maxY = Math.max(source.point.y, target.point.y) + 300;
  const inside = (r: Rect) => r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY;
  const near = obstacles.filter(inside);
  const crossings = routed.filter(([a, b]) => inside({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }));
  const key = JSON.stringify([source.point, source.side, target.point, target.side, near.map((r) => [r.x, r.y, r.width, r.height]), crossings]);
  const hit = routeCache.get(key);
  if (hit) return hit;
  const route = routeAuto(source, target, near, crossings);
  if (routeCache.size > 4000) routeCache.clear();
  routeCache.set(key, route);
  return route;
}
