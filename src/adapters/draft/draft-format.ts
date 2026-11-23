import { ANNOTATION_KINDS, AREA_COLORS, CONTAINER_KINDS, InfrastructureError, readInfrastructure, LIMITS, NODE_VARIANTS, type AnnotationKind, type AreaColor, type ArrowHeads, type ContainerKind, type EdgeShape, type InfrastructureDetails, type NodeSpecs, type NodeVariant } from '../../domain';
import { LAYOUT_MODES, type LayoutMode } from '../../engine';
import { arr, bool, FormatError, id, num, obj, oneOf, str, type Json } from '../format/reader';
import { readNodeSpecs } from '../format/node-specs';


export interface DraftContainer {
  id: string;
  kind?: ContainerKind;
  label?: string;
  parent?: string | null;
  layout?: LayoutMode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: AreaColor;
  dashed?: boolean;
  filled?: boolean;
  locked?: boolean;
}

export interface DraftNode {
  id: string;
  service?: string;
  label?: string;
  parent?: string | null;
  x?: number;
  y?: number;
  variant?: NodeVariant;
  size?: 's' | 'm' | 'l';
  locked?: boolean;
  specs?: NodeSpecs | null;
  infrastructure?: InfrastructureDetails | null;
}

export interface DraftEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  arrow?: ArrowHeads;
  shape?: EdgeShape;
  relationship?: boolean;
}

export interface DraftAnnotation {
  id: string;
  kind?: AnnotationKind;
  text?: string;
  x?: number;
  y?: number;
  target?: string | null;
}

export interface Draft {
  title?: string;
  layout?: LayoutMode;
  containers: DraftContainer[];
  nodes: DraftNode[];
  edges: DraftEdge[];
  annotations: DraftAnnotation[];
  remove: string[];
}

export type DraftResult = { ok: true; draft: Draft } | { ok: false; errors: string[] };

const opt = <T>(o: Json, key: string, read: () => T): T | undefined => (o[key] === undefined ? undefined : read());
const optParent = (o: Json, key: string, path: string): string | null | undefined => (o[key] === undefined ? undefined : o[key] === null ? null : id(o, key, path));

export function readDraft(raw: unknown): Draft {
  const root = obj(raw, '');
  if (root.format !== undefined && root.format !== 'structlet-draft') throw new FormatError('format', 'expected "structlet-draft"');
  if (root.formatVersion !== undefined && root.formatVersion !== 1) throw new FormatError('formatVersion', 'unsupported draft version');
  const max = LIMITS.objects;
  return {
    title: opt(root, 'title', () => str(root, 'title', '', { max: 200 })),
    layout: opt(root, 'layout', () => oneOf(root, 'layout', '', LAYOUT_MODES)),
    containers: arr(root.containers, 'containers', max).map((v, i) => {
      const p = `containers[${i}]`;
      const o = obj(v, p);
      return {
        id: id(o, 'id', p),
        kind: opt(o, 'kind', () => oneOf(o, 'kind', p, CONTAINER_KINDS)),
        label: opt(o, 'label', () => str(o, 'label', p)),
        parent: optParent(o, 'parent', p),
        layout: opt(o, 'layout', () => oneOf(o, 'layout', p, LAYOUT_MODES)),
        x: opt(o, 'x', () => num(o, 'x', p)),
        y: opt(o, 'y', () => num(o, 'y', p)),
        width: opt(o, 'width', () => num(o, 'width', p)),
        height: opt(o, 'height', () => num(o, 'height', p)),
        color: opt(o, 'color', () => oneOf(o, 'color', p, AREA_COLORS)),
        dashed: opt(o, 'dashed', () => bool(o, 'dashed', p, false)),
        filled: opt(o, 'filled', () => bool(o, 'filled', p, false)),
        locked: opt(o, 'locked', () => bool(o, 'locked', p, false)),
      };
    }),
    nodes: arr(root.nodes, 'nodes', max).map((v, i) => {
      const p = `nodes[${i}]`;
      const o = obj(v, p);
      return {
        id: id(o, 'id', p),
        service: opt(o, 'service', () => str(o, 'service', p, { max: 128 })),
        label: opt(o, 'label', () => str(o, 'label', p)),
        parent: optParent(o, 'parent', p),
        x: opt(o, 'x', () => num(o, 'x', p)),
        y: opt(o, 'y', () => num(o, 'y', p)),
        variant: opt(o, 'variant', () => oneOf(o, 'variant', p, NODE_VARIANTS)),
        infrastructure: opt(o, 'infrastructure', () => o.infrastructure === null ? null : readInfrastructure(o.infrastructure, `${p}.infrastructure`)),
        specs: opt(o, 'specs', () => o.specs === null ? null : readNodeSpecs(o.specs, `${p}.specs`)),
        size: opt(o, 'size', () => oneOf(o, 'size', p, ['s', 'm', 'l'] as const)),
        locked: opt(o, 'locked', () => bool(o, 'locked', p, false)),
      };
    }),
    edges: arr(root.edges, 'edges', max).map((v, i) => {
      const p = `edges[${i}]`;
      const o = obj(v, p);
      return {
        id: opt(o, 'id', () => id(o, 'id', p)),
        from: id(o, 'from', p),
        to: id(o, 'to', p),
        label: opt(o, 'label', () => str(o, 'label', p)),
        dashed: opt(o, 'dashed', () => bool(o, 'dashed', p, false)),
        arrow: opt(o, 'arrow', () => oneOf(o, 'arrow', p, ['end', 'start', 'both', 'none'] as const)),
        relationship: opt(o, 'relationship', () => bool(o, 'relationship', p, false)),
        shape: opt(o, 'shape', () => oneOf(o, 'shape', p, ['orthogonal', 'straight'] as const)),
      };
    }),
    annotations: arr(root.annotations, 'annotations', max).map((v, i) => {
      const p = `annotations[${i}]`;
      const o = obj(v, p);
      return {
        id: id(o, 'id', p),
        kind: opt(o, 'kind', () => oneOf(o, 'kind', p, ANNOTATION_KINDS)),
        text: opt(o, 'text', () => str(o, 'text', p)),
        x: opt(o, 'x', () => num(o, 'x', p)),
        y: opt(o, 'y', () => num(o, 'y', p)),
        target: optParent(o, 'target', p),
      };
    }),
    remove: arr(root.remove, 'remove', max).map((v, i) => {
      if (typeof v !== 'string') throw new FormatError(`remove[${i}]`, 'expected an id');
      return id({ v }, 'v', `remove[${i}]`);
    }),
  };
}

export function parseDraft(text: string): DraftResult {
  if (text.length > 5 * 1024 * 1024) return { ok: false, errors: ['Draft is larger than 5 MB'] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Not valid JSON'] };
  }
  try {
    return { ok: true, draft: readDraft(raw) };
  } catch (error) {
    if (error instanceof FormatError || error instanceof InfrastructureError) return { ok: false, errors: [error.message] };
    throw error;
  }
}
