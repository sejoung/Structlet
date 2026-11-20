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
  type Side,
} from '../domain';
import type { Appearance, Glyph } from './appearance';
import { polylineMidpoint, union } from './geometry';
import { resolveEndpoints, type PortFrame } from './routing/ports';
import { routeAuto, routeManual, routeStraight } from './routing/route';
import { measureText, wrapText } from './text';

/** Render-ready description of a document in world coordinates. */

export const NODE_LABEL = { fontSize: 12, lineHeight: 15, gap: 6, maxWidth: 136 } as const;
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
  readonly locked: boolean;
}

export interface SceneNode {
  readonly id: Id;
  readonly rect: Rect;
  readonly label: readonly string[];
  readonly labelBox: Rect | null;
  readonly glyph: Glyph;
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

export function annotationRect(a: Annotation): { rect: Rect; lines: string[] } {
  if (a.kind === 'step') return { rect: { x: a.x, y: a.y, width: STEP_SIZE, height: STEP_SIZE }, lines: [a.text] };
  const lines = wrapText(a.text || ' ', ANNOTATION_TEXT.maxWidth, ANNOTATION_TEXT.fontSize, 40);
  const pad = a.kind === 'legend' ? 12 : 0;
  const width = Math.max(24, textBlock(lines, ANNOTATION_TEXT.fontSize)) + pad * 2;
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
      return { id: c.id, kind: c.kind, rect, depth, label: c.label, style: c.style, glyph: appearance.containerGlyph(c.kind), locked: c.locked };
    });

  const obstacles: Rect[] = [];
  const nodes: SceneNode[] = doc.nodes.map((n) => {
    const rect = rects.get(n.id)!;
    const service = appearance.service(n.serviceId);
    const look = service ?? appearance.fallback;
    const label = n.label.trim() ? wrapText(n.label, NODE_LABEL.maxWidth, NODE_LABEL.fontSize, 4) : [];
    let labelBox: Rect | null = null;
    if (label.length > 0) {
      const w = textBlock(label, NODE_LABEL.fontSize);
      labelBox = { x: rect.x + rect.width / 2 - w / 2, y: rect.y + rect.height + NODE_LABEL.gap, width: w, height: label.length * NODE_LABEL.lineHeight };
    }
    const bottom = labelBox ? labelBox.y + labelBox.height + 2 : rect.y + rect.height;
    frames.set(n.id, { left: rect.x, right: rect.x + rect.width, top: rect.y, bottom, sideTop: rect.y, sideBottom: rect.y + rect.height });
    obstacles.push(rect);
    if (labelBox) obstacles.push(labelBox);
    return { id: n.id, rect, label, labelBox, glyph: look.glyph, color: look.color, serviceName: look.name, knownService: !!service, locked: n.locked };
  });

  const ends = resolveEndpoints(doc.edges, frames);
  const edges: SceneEdge[] = [];
  for (const e of doc.edges) {
    const pair = ends.get(e.id);
    if (!pair) continue;
    const manual = e.routingMode === 'manual';
    const points =
      e.style.shape === 'straight'
        ? routeStraight(pair.source, pair.target, manual ? e.waypoints : [])
        : manual
          ? routeManual(pair.source, pair.target, e.waypoints)
          : cachedAuto(pair.source, pair.target, obstacles);
    const label = e.label.trim() ? wrapText(e.label, 160, EDGE_LABEL.fontSize, 3) : [];
    let labelBox: Rect | null = null;
    if (label.length > 0) {
      const mid = polylineMidpoint(points).point;
      const w = textBlock(label, EDGE_LABEL.fontSize) + EDGE_LABEL.padX * 2;
      const h = label.length * EDGE_LABEL.lineHeight + EDGE_LABEL.padY * 2;
      labelBox = { x: mid.x - w / 2, y: mid.y - h / 2, width: w, height: h };
    }
    edges.push({ id: e.id, points, label, labelBox, style: e.style, manual, sourceSide: pair.source.side, targetSide: pair.target.side });
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

const routeCache = new Map<string, Point[]>();

function cachedAuto(source: Parameters<typeof routeAuto>[0], target: Parameters<typeof routeAuto>[1], obstacles: readonly Rect[]): Point[] {
  const minX = Math.min(source.point.x, target.point.x) - 300;
  const maxX = Math.max(source.point.x, target.point.x) + 300;
  const minY = Math.min(source.point.y, target.point.y) - 300;
  const maxY = Math.max(source.point.y, target.point.y) + 300;
  const near = obstacles.filter((o) => o.x < maxX && o.x + o.width > minX && o.y < maxY && o.y + o.height > minY);
  const key = JSON.stringify([source.point, source.side, target.point, target.side, near.map((r) => [r.x, r.y, r.width, r.height])]);
  const hit = routeCache.get(key);
  if (hit) return hit;
  const route = routeAuto(source, target, near);
  if (routeCache.size > 4000) routeCache.clear();
  routeCache.set(key, route);
  return route;
}
