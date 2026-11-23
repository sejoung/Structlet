import type { ContainerStyle, Id, Point, Rect } from '../domain';
import { containsPoint, inflate, intersects, polylineMidpoint, union } from './geometry';
import { LEGEND_MARKER_WIDTH, legendMarker, type LegendMarker, type Scene, type SceneNode } from './scene';
import { measureText, wrapText } from './text';

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
export const ISOMETRIC_PLANE = `matrix(${COS} ${SIN} ${-COS} ${SIN} 0 0)`;
export type IsometricLabels = 'full' | 'compact';
export type IsometricRotation = 0 | 1 | 2 | 3;

export interface IsometricOptions {
  readonly labels?: IsometricLabels;
  readonly rotation?: IsometricRotation;
}

export function rotateIsoPoint(point: Point, rotation: IsometricRotation): Point {
  const { x, y } = point;
  switch (rotation) {
    case 1: return { x: -y, y: x };
    case 2: return { x: -x, y: -y };
    case 3: return { x: y, y: -x };
    default: return point;
  }
}

export function iso({ x, y }: Point): Point {
  return { x: (x - y) * COS, y: (x + y) * SIN };
}

export function projectIso(point: Point, rotation: IsometricRotation): Point {
  return iso(rotateIsoPoint(point, rotation));
}

function corners({ x, y, width, height }: Rect): Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function pointBounds(points: readonly Point[]): Rect | null {
  return union(points.map((point) => ({ ...point, width: 0, height: 0 })));
}

export function rotateIsoRect(rect: Rect, rotation: IsometricRotation): Rect {
  return pointBounds(corners(rect).map((point) => rotateIsoPoint(point, rotation)))!;
}

export const isoBlockHeight = (node: SceneNode) => node.variant === 'box' ? 12 : 18;

type LabelKind = 'area' | 'node' | 'edge' | 'text' | 'legend' | 'step';

export const ISOMETRIC_TEXT = {
  area: { size: 19, weight: 650, maxWidth: 300 },
  node: { size: 17, weight: 600, maxWidth: 245 },
  edge: { size: 15, weight: 500, maxWidth: 210 },
  text: { size: 16, weight: 400, maxWidth: 360 },
  legend: { size: 15, weight: 400, maxWidth: 330 },
  step: { size: 16, weight: 700, maxWidth: 76 },
} as const;

const LABEL_PAD = { x: 8, y: 6 };

interface LabelInput {
  readonly kind: LabelKind;
  readonly id: Id;
  readonly text: string;
  readonly anchor: Point;
  readonly preferred: Point;
  readonly color?: ContainerStyle['color'];
}

export interface IsometricLabel {
  readonly id: Id;
  readonly kind: LabelKind;
  readonly box: Rect;
  readonly leader: Point | null;
  readonly lines: readonly { text: string; marker: LegendMarker }[];
  readonly size: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly color?: ContainerStyle['color'];
}

export interface IsometricLayout {
  readonly rotation: IsometricRotation;
  readonly labels: readonly IsometricLabel[];
  readonly bounds: Rect;
}

function measureLabel(input: LabelInput) {
  const { size, weight, maxWidth } = ISOMETRIC_TEXT[input.kind];
  const measure = (text: string) => measureText(text, size) * (weight >= 600 ? 1.2 : 1.12);
  const lines = input.text.split('\n').flatMap((line) => {
    const { marker, text } = input.kind === 'legend' ? legendMarker(line) : { marker: null, text: line };
    const available = (maxWidth - (marker ? LEGEND_MARKER_WIDTH : 0)) / (weight >= 600 ? 1.2 : 1.12);
    return wrapText(text, available, size, Number.POSITIVE_INFINITY)
      .map((text, i) => ({ text, marker: i === 0 ? marker : null }));
  });
  const lineHeight = Math.ceil(size * 1.42);
  const width = Math.ceil(Math.max(12, ...lines.map((line) => measure(line.text) + (line.marker ? LEGEND_MARKER_WIDTH : 0)))) + LABEL_PAD.x * 2;
  return { lines, lineHeight, size, weight, width, height: lineHeight * lines.length + LABEL_PAD.y * 2 };
}

function locateLabel(input: LabelInput, width: number, height: number, occupied: readonly Rect[], fallback: Point): Rect {
  const { preferred } = input;
  const at = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y), width, height });
  const clear = (box: Rect) => !occupied.some((other) => intersects(other, inflate(box, 4)));
  const preferredBox = at(preferred.x - width / 2, preferred.y);
  if (clear(preferredBox)) return preferredBox;
  for (const gap of [8, 26, 52, 92, 144]) {
    const { x, y } = preferredBox;
    const candidates = [
      at(x, y - height - gap), at(x - width / 2 - gap, y), at(x + width / 2 + gap, y),
      at(x, y + gap), at(x - width / 3, y + height + gap), at(x + width / 3, y + height + gap),
    ];
    const best = candidates.find(clear);
    if (best) return best;
  }
  let box = at(fallback.x, fallback.y);
  for (;;) {
    const blockers = occupied.filter((other) => intersects(other, inflate(box, 4)));
    if (!blockers.length) return box;
    box = at(box.x, Math.max(...blockers.map((other) => other.y + other.height)) + 12);
  }
}

export function computeIsometricLayout(scene: Scene, options: IsometricOptions = {}): IsometricLayout {
  const rotation = options.rotation ?? 0;
  const project = (point: Point) => projectIso(point, rotation);
  const projectedRects = scene.containers.map((area) => pointBounds(corners(area.rect).map(project))!);
  const blocks = scene.nodes.map((node) => {
    const floor = pointBounds(corners(node.rect).map(project))!;
    const h = isoBlockHeight(node);
    return { ...floor, y: floor.y - h, height: floor.height + h };
  });
  const paths = scene.edges.map((edge) => pointBounds(edge.points.map(project))).filter((rect) => rect !== null);
  const annotations = options.labels === 'compact' ? scene.annotations.filter((note) => note.kind === 'step') : scene.annotations;
  const ground = union([...projectedRects, ...blocks, ...paths])
    ?? pointBounds(annotations.map((note) => project(note.rect)))
    ?? { x: 0, y: 0, width: 200, height: 120 };
  const inputs: LabelInput[] = [];

  for (const area of scene.containers) {
    const rect = rotateIsoRect(area.rect, rotation);
    const anchor = iso(rect);
    inputs.push({ kind: 'area', id: area.id, text: area.label, color: area.style.color, anchor, preferred: { x: anchor.x, y: anchor.y - 46 } });
  }
  for (const node of scene.nodes) {
    const rect = rotateIsoRect(node.rect, rotation);
    const anchor = iso({ x: rect.x + rect.width, y: rect.y + rect.height });
    inputs.push({ kind: 'node', id: node.id, text: node.fullLabel ?? node.label.join('\n'), anchor, preferred: { x: anchor.x, y: anchor.y + 8 } });
  }
  for (const note of annotations) {
    const anchor = project(note.rect);
    inputs.push({ kind: note.kind, id: note.id, text: note.fullText ?? note.lines.join('\n'), anchor, preferred: { x: anchor.x + (note.kind === 'step' ? 0 : 120), y: anchor.y + 5 } });
  }
  if (options.labels !== 'compact') {
    for (const edge of scene.edges) {
      if (!edge.labelBox) continue;
      const anchor = project(edge.labelAnchor ?? polylineMidpoint(edge.points).point);
      inputs.push({ kind: 'edge', id: edge.id, text: edge.fullLabel ?? edge.label.join('\n'), anchor, preferred: { x: anchor.x, y: anchor.y - 31 } });
    }
  }

  const occupied = [...blocks];
  const fallback = { x: ground.x + ground.width + 24, y: ground.y };
  const labels = inputs.filter((input) => input.text.trim()).map((input): IsometricLabel => {
    const { width, height, ...text } = measureLabel(input);
    const box = locateLabel(input, width, height, occupied, fallback);
    occupied.push(box);
    const nearby = inflate(box, input.kind === 'area' ? 8 : 10);
    return { id: input.id, kind: input.kind, color: input.color, box, ...text, leader: containsPoint(nearby, input.anchor) ? null : input.anchor };
  });
  const leaders = pointBounds(labels.flatMap((label) => label.leader ? [label.leader] : []));
  const bounds = union([ground, ...labels.map((label) => label.box), ...(leaders ? [leaders] : [])])!;
  return { rotation, labels, bounds: { ...bounds, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) } };
}

export const isometricLabelPadding = LABEL_PAD;
