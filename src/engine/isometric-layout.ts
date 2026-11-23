import type { ContainerStyle, Id, Point, Rect } from '../domain';
import { center, containsPoint, inflate, intersects, polylineMidpoint, union } from './geometry';
import { LEGEND_MARKER_WIDTH, legendMarker, type LegendMarker, type Scene, type SceneNode } from './scene';
import { measureText, wrapText } from './text';

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
export const ISOMETRIC_PLANE = `matrix(${COS} ${SIN} ${-COS} ${SIN} 0 0)`;
export type IsometricLabels = 'full' | 'compact';

export interface IsometricOptions {
  readonly labels?: IsometricLabels;
  readonly rotation?: number;
  readonly labelOffsets?: ReadonlyMap<Id, Point> | null;
}

export function normalizeIsoAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function adjacentIsoPreset(angle: number, direction: -1 | 1): number {
  const quarter = angle / 90;
  return ((direction === -1 ? Math.ceil(quarter) : Math.floor(quarter)) + direction) * 90;
}

export function rotateIsoPoint(point: Point, rotation: number): Point {
  const { x, y } = point;
  switch (rotation) {
    case 0: return point;
    case 90: return { x: -y, y: x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: y, y: -x };
    default: {
      const angle = rotation * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return { x: x * cos - y * sin, y: x * sin + y * cos };
    }
  }
}

export function iso({ x, y }: Point): Point {
  return { x: (x - y) * COS, y: (x + y) * SIN };
}

export function projectIso(point: Point, rotation: number): Point {
  return iso(rotateIsoPoint(point, rotation));
}

export function projectIsoRect({ x, y, width, height }: Rect, rotation: number): [Point, Point, Point, Point] {
  return [projectIso({ x, y }, rotation), projectIso({ x: x + width, y }, rotation),
    projectIso({ x: x + width, y: y + height }, rotation), projectIso({ x, y: y + height }, rotation)];
}

function pointBounds(points: readonly Point[]): Rect | null {
  return union(points.map((point) => ({ ...point, width: 0, height: 0 })));
}

function labelAnchorOnRect(rect: Rect, rotation: number, side: -1 | 1): Point {
  const anchor = projectIso(center(rect), rotation);
  const direction = rotateIsoPoint({ x: 1, y: 1 }, normalizeIsoAngle(-rotation));
  const reach = Math.min(rect.width / 2 / Math.abs(direction.x), rect.height / 2 / Math.abs(direction.y));
  return { x: anchor.x, y: anchor.y + side * reach };
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
  readonly details?: readonly string[];
}

export interface IsometricLabel {
  readonly id: Id;
  readonly kind: LabelKind;
  readonly box: Rect;
  readonly leader: Point | null;
  readonly lines: readonly { text: string; marker: LegendMarker; detailSize?: number }[];
  readonly size: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly color?: ContainerStyle['color'];
}

export interface IsometricLayout {
  readonly rotation: number;
  readonly labels: readonly IsometricLabel[];
  readonly labelOffsets: ReadonlyMap<Id, Point>;
  readonly bounds: Rect;
}

function measureLabel(input: LabelInput) {
  const { size, weight, maxWidth } = ISOMETRIC_TEXT[input.kind];
  const scale = weight >= 600 ? 1.2 : 1.12;
  const lines: IsometricLabel['lines'][number][] = (input.text.trim() ? input.text.split('\n') : []).flatMap((line) => {
    const { marker, text } = input.kind === 'legend' ? legendMarker(line) : { marker: null, text: line };
    const available = (maxWidth - (marker ? LEGEND_MARKER_WIDTH : 0)) / scale;
    return wrapText(text, available, size, Number.POSITIVE_INFINITY)
      .map((text, i) => ({ text, marker: i === 0 ? marker : null }));
  });
  const detailSize = size - 3;
  for (const detail of input.details ?? []) {
    for (const text of wrapText(detail, maxWidth / 1.12, detailSize, Number.POSITIVE_INFINITY)) {
      lines.push({ text, marker: null, detailSize });
    }
  }
  const lineHeight = Math.ceil(size * 1.42);
  const width = Math.ceil(Math.max(12, ...lines.map((line) => measureText(line.text, line.detailSize ?? size) * (line.detailSize ? 1.12 : scale) + (line.marker ? LEGEND_MARKER_WIDTH : 0)))) + LABEL_PAD.x * 2;
  return { lines, lineHeight, size, weight, width, height: lineHeight * lines.length + LABEL_PAD.y * 2 };
}

function clearLabel(box: Rect, occupied: readonly Rect[]): boolean {
  const padded = inflate(box, 4);
  return !occupied.some((other) => intersects(other, padded));
}

function locateLabel(input: LabelInput, width: number, height: number, occupied: readonly Rect[], fallback: Point): Rect {
  const { preferred } = input;
  const at = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y), width, height });
  const preferredBox = at(preferred.x - width / 2, preferred.y);
  if (clearLabel(preferredBox, occupied)) return preferredBox;
  for (const gap of [8, 26, 52, 92, 144]) {
    const { x, y } = preferredBox;
    const candidates = [
      at(x, y - height - gap), at(x - width / 2 - gap, y), at(x + width / 2 + gap, y),
      at(x, y + gap), at(x - width / 3, y + height + gap), at(x + width / 3, y + height + gap),
    ];
    const best = candidates.find((box) => clearLabel(box, occupied));
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
  const rotation = normalizeIsoAngle(options.rotation ?? 0);
  const project = (point: Point) => projectIso(point, rotation);
  const projectedRects = scene.containers.map((area) => pointBounds(projectIsoRect(area.rect, rotation))!);
  const blocks = scene.nodes.map((node) => {
    const floor = pointBounds(projectIsoRect(node.rect, rotation))!;
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
    const anchor = labelAnchorOnRect(area.rect, rotation, -1);
    inputs.push({ kind: 'area', id: area.id, text: area.label, color: area.style.color, anchor, preferred: { x: anchor.x, y: anchor.y - 46 } });
  }
  for (const node of scene.nodes) {
    const anchor = labelAnchorOnRect(node.rect, rotation, 1);
    const details = options.labels === 'compact' ? undefined : node.specDetails;
    inputs.push({ kind: 'node', id: node.id, text: node.fullLabel ?? node.label.join('\n'), details, anchor, preferred: { x: anchor.x, y: anchor.y + 8 } });
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
  const labelOffsets = new Map<Id, Point>();
  const measured = inputs.filter((input) => input.text.trim() || input.details?.length).map((input) => ({ input, ...measureLabel(input) }));
  const retained = new Map<Id, Rect>();
  if (options.labelOffsets) {
    for (const { input, width, height } of measured) {
      const offset = options.labelOffsets.get(input.id);
      if (!offset) continue;
      const x = Math.round(input.anchor.x + offset.x);
      const y = Math.round(input.anchor.y + offset.y);
      const box = { x, y, width, height };
      if (!clearLabel(box, occupied)) continue;
      retained.set(input.id, box);
      labelOffsets.set(input.id, offset);
      occupied.push(box);
    }
  }
  const labels = measured.map(({ input, width, height, ...text }): IsometricLabel => {
    let box = retained.get(input.id);
    if (!box) {
      box = locateLabel(input, width, height, occupied, fallback);
      occupied.push(box);
      labelOffsets.set(input.id, { x: box.x - input.anchor.x, y: box.y - input.anchor.y });
    }
    const nearby = inflate(box, input.kind === 'area' ? 8 : 10);
    return { id: input.id, kind: input.kind, color: input.color, box, ...text, leader: containsPoint(nearby, input.anchor) ? null : input.anchor };
  });
  const leaders = pointBounds(labels.flatMap((label) => label.leader ? [label.leader] : []));
  const bounds = union([ground, ...labels.map((label) => label.box), ...(leaders ? [leaders] : [])])!;
  return { rotation, labels, labelOffsets, bounds: { ...bounds, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) } };
}

export const isometricLabelPadding = LABEL_PAD;
