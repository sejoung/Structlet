/**
 * Structlet document model. Pure data: no React, DOM or storage.
 *
 * Nodes and containers store positions in their parent's local coordinates
 * (the parent's top-left corner is the origin). Objects without a parent use
 * world coordinates. The container hierarchy is explicit through `parentId`.
 */

export type Id = string;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** `icon`: service tile with the name below (AWS-docs style). `box`: bordered box with the icon and name inside. */
export const NODE_VARIANTS = ['icon', 'box'] as const;
export type NodeVariant = (typeof NODE_VARIANTS)[number];

export interface Node {
  readonly id: Id;
  /** Reference into the service catalog. Unknown ids render as a generic icon. */
  readonly serviceId: string;
  readonly label: string;
  readonly parentId: Id | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly locked: boolean;
  readonly variant: NodeVariant;
}

export const CONTAINER_KINDS = [
  'cloud',
  'account',
  'region',
  'availability-zone',
  'vpc',
  'subnet',
  'cluster',
  'namespace',
  'custom',
] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

export const AREA_COLORS = ['gray', 'teal', 'purple', 'green', 'blue', 'orange', 'pink', 'red'] as const;
export type AreaColor = (typeof AREA_COLORS)[number];

export interface ContainerStyle {
  readonly color: AreaColor;
  readonly dashed: boolean;
  readonly filled: boolean;
}

export interface Container {
  readonly id: Id;
  readonly kind: ContainerKind;
  readonly label: string;
  readonly parentId: Id | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly style: ContainerStyle;
  readonly locked: boolean;
}

/** An edge end attached to a node or container. */
export interface AttachedEndpoint {
  readonly kind: 'attached';
  readonly objectId: Id;
  /** `auto` picks the side facing the other end. */
  readonly side: Side | 'auto';
  /** Position along the side, 0..1. `null` lets the engine spread ports. */
  readonly offset: number | null;
}

/** An edge end not attached to anything, in world coordinates. */
export interface FreeEndpoint {
  readonly kind: 'free';
  readonly x: number;
  readonly y: number;
}

export type Endpoint = AttachedEndpoint | FreeEndpoint;

export type ArrowHeads = 'end' | 'start' | 'both' | 'none';
export type EdgeShape = 'orthogonal' | 'straight';

export interface EdgeStyle {
  readonly dashed: boolean;
  readonly arrow: ArrowHeads;
  readonly shape: EdgeShape;
}

export type RoutingMode = 'auto' | 'manual';

export interface Edge {
  readonly id: Id;
  readonly source: Endpoint;
  readonly target: Endpoint;
  readonly label: string;
  readonly style: EdgeStyle;
  /** `auto` routes are recomputed and never stored; `manual` routes pass through `waypoints`. */
  readonly routingMode: RoutingMode;
  /** World-coordinate bend points of a manual route. Empty for auto routes. */
  readonly waypoints: readonly Point[];
}

export const ANNOTATION_KINDS = ['text', 'step', 'legend'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export interface Annotation {
  readonly id: Id;
  readonly kind: AnnotationKind;
  /** World coordinates of the annotation's top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly targetId: Id | null;
}

export const FORMAT_VERSION = 1;

export interface Document {
  readonly formatVersion: number;
  readonly id: Id;
  readonly title: string;
  readonly nodes: readonly Node[];
  readonly containers: readonly Container[];
  readonly edges: readonly Edge[];
  readonly annotations: readonly Annotation[];
}

export type Collection = 'nodes' | 'containers' | 'edges' | 'annotations';
export type DiagramObject = Node | Container | Edge | Annotation;

export interface CollectionItem {
  nodes: Node;
  containers: Container;
  edges: Edge;
  annotations: Annotation;
}

export const NODE_SIZE = 64;
/** Size presets per variant. */
export const NODE_SIZES: Record<NodeVariant, Record<'s' | 'm' | 'l', { width: number; height: number }>> = {
  icon: { s: { width: 48, height: 48 }, m: { width: 64, height: 64 }, l: { width: 88, height: 88 } },
  box: { s: { width: 144, height: 48 }, m: { width: 184, height: 60 }, l: { width: 232, height: 76 } },
};

export function emptyDocument(id: Id, title: string): Document {
  return { formatVersion: FORMAT_VERSION, id, title, nodes: [], containers: [], edges: [], annotations: [] };
}

export const DEFAULT_EDGE_STYLE: EdgeStyle = { dashed: false, arrow: 'end', shape: 'orthogonal' };

export const CONTAINER_PRESETS: Record<ContainerKind, ContainerStyle> = {
  cloud: { color: 'gray', dashed: false, filled: false },
  account: { color: 'pink', dashed: false, filled: false },
  region: { color: 'teal', dashed: true, filled: false },
  'availability-zone': { color: 'blue', dashed: true, filled: false },
  vpc: { color: 'purple', dashed: false, filled: false },
  subnet: { color: 'green', dashed: false, filled: true },
  cluster: { color: 'blue', dashed: false, filled: false },
  namespace: { color: 'teal', dashed: true, filled: true },
  custom: { color: 'gray', dashed: true, filled: false },
};
