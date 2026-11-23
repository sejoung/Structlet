import type { InfrastructureDetails } from './infrastructure';

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

export const NODE_VARIANTS = ['icon', 'box'] as const;
export type NodeVariant = (typeof NODE_VARIANTS)[number];

export const NODE_SPEC_TEXT_LIMIT = 128;

export interface NodeSpecs {
  readonly instanceType?: string;
  readonly vcpus?: number;
  readonly memoryGiB?: number;
  readonly gpu?: string;
  readonly diskGiB?: number;
  readonly showDetails?: boolean;
}

export function isSpecQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export interface Node {
  readonly id: Id;
  readonly serviceId: string;
  readonly label: string;
  readonly parentId: Id | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly locked: boolean;
  readonly variant: NodeVariant;
  readonly specs?: NodeSpecs;
  readonly infrastructure?: InfrastructureDetails;
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
  readonly infrastructure?: InfrastructureDetails;
  readonly locked: boolean;
}

export interface AttachedEndpoint {
  readonly kind: 'attached';
  readonly objectId: Id;
  readonly side: Side | 'auto';
  readonly offset: number | null;
}

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
  readonly relationship?: boolean;
  readonly routingMode: RoutingMode;
  readonly waypoints: readonly Point[];
}

export const ANNOTATION_KINDS = ['text', 'step', 'legend'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export interface Annotation {
  readonly id: Id;
  readonly kind: AnnotationKind;
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
