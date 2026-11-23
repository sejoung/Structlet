import {
  ANNOTATION_KINDS,
  AREA_COLORS,
  CONTAINER_KINDS,
  CONTAINER_PRESETS,
  FORMAT_VERSION,
  LIMITS,
  InfrastructureError,
  readInfrastructure,
  NODE_VARIANTS,
  SIDES,
  validateDocument,
  type Annotation,
  type Container,
  type Document,
  type Edge,
  type Endpoint,
  type Node,
  type Point,
} from '../../domain';
import { arr, bool, FormatError, id, num, obj, oneOf, str, nullableId, type Json } from './reader';
import { readNodeSpecs } from './node-specs';


export const FILE_EXTENSION = '.structlet';
export const MIME_TYPE = 'application/vnd.structlet+json';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type ParseResult = { ok: true; document: Document } | { ok: false; errors: string[] };

function point(v: unknown, path: string): Point {
  const o = obj(v, path);
  return { x: num(o, 'x', path), y: num(o, 'y', path) };
}

function endpoint(v: unknown, path: string): Endpoint {
  const o = obj(v, path);
  const kind = oneOf(o, 'kind', path, ['attached', 'free'] as const, 'attached');
  if (kind === 'free') return { kind, x: num(o, 'x', path), y: num(o, 'y', path) };
  const offset = o.offset === undefined || o.offset === null ? null : num(o, 'offset', path);
  return { kind, objectId: id(o, 'objectId', path), side: oneOf(o, 'side', path, ['auto', ...SIDES] as const, 'auto'), offset };
}

function node(v: unknown, path: string): Node {
  const o = obj(v, path);
  return {
    id: id(o, 'id', path),
    serviceId: str(o, 'serviceId', path, { optional: 'generic', max: 128 }),
    label: str(o, 'label', path, { optional: '' }),
    parentId: nullableId(o, 'parentId', path),
    x: num(o, 'x', path),
    y: num(o, 'y', path),
    width: num(o, 'width', path),
    height: num(o, 'height', path),
    locked: bool(o, 'locked', path, false),
    variant: oneOf(o, 'variant', path, NODE_VARIANTS, 'icon'),
    ...(o.infrastructure === undefined ? {} : { infrastructure: readInfrastructure(o.infrastructure, `${path}.infrastructure`) }),
    ...(o.specs === undefined ? {} : { specs: readNodeSpecs(o.specs, `${path}.specs`) }),
  };
}

function container(v: unknown, path: string): Container {
  const o = obj(v, path);
  const kind = oneOf(o, 'kind', path, CONTAINER_KINDS, 'custom');
  const preset = CONTAINER_PRESETS[kind];
  const style: Json = o.style === undefined ? {} : obj(o.style, `${path}.style`);
  return {
    id: id(o, 'id', path),
    kind,
    label: str(o, 'label', path, { optional: '' }),
    parentId: nullableId(o, 'parentId', path),
    x: num(o, 'x', path),
    y: num(o, 'y', path),
    width: num(o, 'width', path),
    height: num(o, 'height', path),
    style: {
      color: oneOf(style, 'color', `${path}.style`, AREA_COLORS, preset.color),
      dashed: bool(style, 'dashed', `${path}.style`, preset.dashed),
      filled: bool(style, 'filled', `${path}.style`, preset.filled),
    },
    locked: bool(o, 'locked', path, false),
  };
}

function edge(v: unknown, path: string): Edge {
  const o = obj(v, path);
  const style: Json = o.style === undefined ? {} : obj(o.style, `${path}.style`);
  const routingMode = oneOf(o, 'routingMode', path, ['auto', 'manual'] as const, 'auto');
  const waypoints = arr(o.waypoints, `${path}.waypoints`, LIMITS.waypoints).map((p, i) => point(p, `${path}.waypoints[${i}]`));
  return {
    id: id(o, 'id', path),
    source: endpoint(o.source, `${path}.source`),
    target: endpoint(o.target, `${path}.target`),
    label: str(o, 'label', path, { optional: '' }),
    style: {
      dashed: bool(style, 'dashed', `${path}.style`, false),
      arrow: oneOf(style, 'arrow', `${path}.style`, ['end', 'start', 'both', 'none'] as const, 'end'),
      shape: oneOf(style, 'shape', `${path}.style`, ['orthogonal', 'straight'] as const, 'orthogonal'),
    },
    ...(o.relationship === undefined ? {} : { relationship: bool(o, 'relationship', path, false) }),
    routingMode,
    waypoints: routingMode === 'manual' ? waypoints : [],
  };
}

function annotation(v: unknown, path: string): Annotation {
  const o = obj(v, path);
  return {
    id: id(o, 'id', path),
    kind: oneOf(o, 'kind', path, ANNOTATION_KINDS),
    x: num(o, 'x', path),
    y: num(o, 'y', path),
    text: str(o, 'text', path, { optional: '' }),
    targetId: nullableId(o, 'targetId', path),
  };
}

export function parseStructlet(text: string): ParseResult {
  if (text.length > MAX_FILE_BYTES) return { ok: false, errors: [`File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Not valid JSON'] };
  }
  try {
    const root = obj(raw, '');
    if (root.format !== 'structlet') throw new FormatError('format', 'not a Structlet file');
    const version = num(root, 'formatVersion', '');
    if (version > FORMAT_VERSION) throw new FormatError('formatVersion', `file version ${version} is newer than this app supports (${FORMAT_VERSION})`);
    if (version !== FORMAT_VERSION) throw new FormatError('formatVersion', `unsupported version ${version}`);
    const max = LIMITS.objects;
    const document: Document = {
      formatVersion: version,
      id: id(root, 'id', ''),
      title: str(root, 'title', '', { optional: 'Untitled', max: 200 }),
      nodes: arr(root.nodes, 'nodes', max).map((v, i) => node(v, `nodes[${i}]`)),
      containers: arr(root.containers, 'containers', max).map((v, i) => container(v, `containers[${i}]`)),
      edges: arr(root.edges, 'edges', max).map((v, i) => edge(v, `edges[${i}]`)),
      annotations: arr(root.annotations, 'annotations', max).map((v, i) => annotation(v, `annotations[${i}]`)),
    };
    const issues = validateDocument(document);
    if (issues.length > 0) return { ok: false, errors: issues.map((i) => i.message) };
    return { ok: true, document };
  } catch (error) {
    if (error instanceof FormatError || error instanceof InfrastructureError) return { ok: false, errors: [error.message] };
    throw error;
  }
}

function endpointJson(e: Endpoint): Json {
  return e.kind === 'free' ? { kind: 'free', x: e.x, y: e.y } : { kind: 'attached', objectId: e.objectId, side: e.side, offset: e.offset };
}

export function serializeStructlet(doc: Document): string {
  const file = {
    format: 'structlet',
    formatVersion: FORMAT_VERSION,
    id: doc.id,
    title: doc.title,
    containers: doc.containers.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.label,
      parentId: c.parentId,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      style: { color: c.style.color, dashed: c.style.dashed, filled: c.style.filled },
      locked: c.locked,
    })),
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      serviceId: n.serviceId,
      label: n.label,
      parentId: n.parentId,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      locked: n.locked,
      variant: n.variant,
      infrastructure: n.infrastructure,
      specs: n.specs && {
        instanceType: n.specs.instanceType,
        vcpus: n.specs.vcpus,
        memoryGiB: n.specs.memoryGiB,
        gpu: n.specs.gpu,
        diskGiB: n.specs.diskGiB,
        showDetails: n.specs.showDetails,
      },
    })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      source: endpointJson(e.source),
      target: endpointJson(e.target),
      label: e.label,
      style: { dashed: e.style.dashed, arrow: e.style.arrow, shape: e.style.shape },
      relationship: e.relationship,
      routingMode: e.routingMode,
      waypoints: e.routingMode === 'manual' ? e.waypoints.map((p) => ({ x: p.x, y: p.y })) : [],
    })),
    annotations: doc.annotations.map((a) => ({ id: a.id, kind: a.kind, x: a.x, y: a.y, text: a.text, targetId: a.targetId })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function fileNameFor(title: string, extension: string): string {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'diagram';
  return `${base}${extension}`;
}
