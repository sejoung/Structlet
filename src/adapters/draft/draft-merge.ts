import {
  CONTAINER_PRESETS,
  DEFAULT_EDGE_STYLE,
  deleteObjects,
  applyPatch,
  findParentCycles,
  NODE_SIZES,
  validateDocument,
  worldOrigin,
  worldRect,
  type Annotation,
  type Container,
  type Document,
  type Edge,
  type Id,
  type Node,
} from '../../domain';
import { placeImportedAnnotations, placeNew, type LayoutMode } from '../../engine';
import type { Draft } from './draft-format';

export type MergeResult = { ok: true; document: Document; created: Id[] } | { ok: false; errors: string[] };

type M<T> = { -readonly [K in keyof T]: T[K] };

export function mergeDraft(base: Document, draft: Draft): MergeResult {
  const errors: string[] = [];
  let doc = draft.remove.length ? applyPatch(base, deleteObjects(base, draft.remove)) : base;
  const nodes = new Map<Id, M<Node>>(doc.nodes.map((n) => [n.id, { ...n }]));
  const containers = new Map<Id, M<Container>>(doc.containers.map((c) => [c.id, { ...c }]));
  const edges = new Map<Id, M<Edge>>(doc.edges.map((e) => [e.id, { ...e }]));
  const annotations = new Map<Id, M<Annotation>>(doc.annotations.map((a) => [a.id, { ...a }]));
  const place = new Set<Id>();
  const keepWorld = new Map<Id, { x: number; y: number }>();
  const created: Id[] = [];
  const modes = new Map<Id | null, LayoutMode>();
  if (draft.layout) modes.set(null, draft.layout);

  const reparent = (box: M<Node> | M<Container>, parent: string | null | undefined, hasXY: boolean) => {
    if (parent === undefined || parent === box.parentId) return;
    if (!hasXY || box.locked) keepWorld.set(box.id, { x: worldRect(doc, box).x, y: worldRect(doc, box).y });
    box.parentId = parent;
  };

  for (const d of draft.containers) {
    if (nodes.has(d.id)) {
      errors.push(`${d.id} is a service node, not an area`);
      continue;
    }
    if (d.layout) modes.set(d.id, d.layout);
    const old = containers.get(d.id);
    const hasXY = d.x !== undefined && d.y !== undefined;
    if (old) {
      if (d.kind && d.kind !== old.kind) {
        old.kind = d.kind;
        old.style = CONTAINER_PRESETS[d.kind];
      }
      if (d.label !== undefined) old.label = d.label;
      reparent(old, d.parent, hasXY);
      if (hasXY && !old.locked) Object.assign(old, { x: d.x, y: d.y });
      if (d.width !== undefined && !old.locked) old.width = d.width;
      if (d.height !== undefined && !old.locked) old.height = d.height;
      if (d.infrastructure !== undefined) old.infrastructure = d.infrastructure ?? undefined;
      old.style = { color: d.color ?? old.style.color, dashed: d.dashed ?? old.style.dashed, filled: d.filled ?? old.style.filled };
      if (d.locked !== undefined) old.locked = d.locked;
      continue;
    }
    const kind = d.kind ?? 'custom';
    const preset = CONTAINER_PRESETS[kind];
    containers.set(d.id, {
      id: d.id,
      kind,
      label: d.label ?? '',
      parentId: d.parent ?? null,
      x: d.x ?? 0,
      y: d.y ?? 0,
      width: d.width ?? 240,
      height: d.height ?? 160,
      ...(d.infrastructure ? { infrastructure: d.infrastructure } : {}),
      style: { color: d.color ?? preset.color, dashed: d.dashed ?? preset.dashed, filled: d.filled ?? preset.filled },
      locked: d.locked ?? false,
    });
    if (!hasXY) place.add(d.id);
    created.push(d.id);
  }

  for (const d of draft.nodes) {
    if (containers.has(d.id)) {
      errors.push(`${d.id} is an area, not a service node`);
      continue;
    }
    const old = nodes.get(d.id);
    const hasXY = d.x !== undefined && d.y !== undefined;
    if (old) {
      if (d.service !== undefined) old.serviceId = d.service;
      if (d.label !== undefined) old.label = d.label;
      if (d.infrastructure !== undefined) old.infrastructure = d.infrastructure ?? undefined;
      if (d.specs === null) old.specs = undefined;
      else if (d.specs !== undefined) {
        const changedType = old.specs?.instanceType !== undefined && d.specs.instanceType !== undefined && d.specs.instanceType !== old.specs.instanceType;
        const retained = changedType ? { diskGiB: old.specs?.diskGiB, showDetails: old.specs?.showDetails } : old.specs;
        old.specs = { ...retained, ...d.specs };
      }
      if (d.variant && d.variant !== old.variant) Object.assign(old, { variant: d.variant }, NODE_SIZES[d.variant].m);
      if (d.size && !old.locked) Object.assign(old, NODE_SIZES[old.variant][d.size]);
      reparent(old, d.parent, hasXY);
      if (hasXY && !old.locked) Object.assign(old, { x: d.x, y: d.y });
      if (d.locked !== undefined) old.locked = d.locked;
      continue;
    }
    const variant = d.variant ?? 'icon';
    nodes.set(d.id, {
      id: d.id,
      serviceId: d.service ?? 'generic',
      label: d.label ?? d.id,
      parentId: d.parent ?? null,
      x: d.x ?? 0,
      y: d.y ?? 0,
      ...NODE_SIZES[variant][d.size ?? 'm'],
      locked: d.locked ?? false,
      variant,
      ...(d.infrastructure ? { infrastructure: d.infrastructure } : {}),
      ...(d.specs ? { specs: d.specs } : {}),
    });
    if (!hasXY) place.add(d.id);
    created.push(d.id);
  }

  for (const d of draft.edges) {
    const existing = d.id ? edges.get(d.id) : [...edges.values()].find((e) =>
      e.source.kind === 'attached' && e.target.kind === 'attached' && e.source.objectId === d.from && e.target.objectId === d.to
        && (e.relationship === true) === (d.relationship === true));
    const style = (e?: Edge) => ({ dashed: d.dashed ?? e?.style.dashed ?? false, arrow: d.arrow ?? e?.style.arrow ?? 'end', shape: d.shape ?? e?.style.shape ?? DEFAULT_EDGE_STYLE.shape });
    if (existing) {
      const ends = existing.source.kind === 'attached' && existing.target.kind === 'attached' && existing.source.objectId === d.from && existing.target.objectId === d.to;
      if (!ends) {
        existing.source = { kind: 'attached', objectId: d.from, side: 'auto', offset: null };
        existing.target = { kind: 'attached', objectId: d.to, side: 'auto', offset: null };
        existing.routingMode = 'auto';
        existing.waypoints = [];
      }
      if (d.label !== undefined) existing.label = d.label;
      if (d.relationship !== undefined) existing.relationship = d.relationship;
      existing.style = style(existing);
      continue;
    }
    const stem = d.id ?? `e-${d.from}-${d.to}`;
    let edgeId = stem.slice(0, 128);
    for (let n = 2; edges.has(edgeId) || nodes.has(edgeId) || containers.has(edgeId); n++) {
      const suffix = `-${n}`;
      edgeId = stem.slice(0, 128 - suffix.length) + suffix;
    }
    edges.set(edgeId, {
      id: edgeId,
      source: { kind: 'attached', objectId: d.from, side: 'auto', offset: null },
      target: { kind: 'attached', objectId: d.to, side: 'auto', offset: null },
      label: d.label ?? '',
      style: style(),
      ...(d.relationship === undefined ? {} : { relationship: d.relationship }),
      routingMode: 'auto',
      waypoints: [],
    });
    created.push(edgeId);
  }

  const unplacedNotes: Id[] = [];
  for (const d of draft.annotations) {
    const old = annotations.get(d.id);
    if (old) {
      if (d.text !== undefined) old.text = d.text;
      if (d.kind) old.kind = d.kind;
      if (d.target !== undefined) old.targetId = d.target;
      if (d.x !== undefined && d.y !== undefined) Object.assign(old, { x: d.x, y: d.y });
      continue;
    }
    annotations.set(d.id, { id: d.id, kind: d.kind ?? 'text', text: d.text ?? '', x: d.x ?? 0, y: d.y ?? 0, targetId: d.target ?? null });
    if (d.x === undefined || d.y === undefined) unplacedNotes.push(d.id);
    created.push(d.id);
  }

  doc = {
    ...doc,
    title: draft.title ?? doc.title,
    nodes: [...nodes.values()],
    containers: [...containers.values()],
    edges: [...edges.values()],
    annotations: [...annotations.values()],
  };
  if (errors.length) return { ok: false, errors };
  const issues = validateDocument(doc);
  if (findParentCycles(doc).length === 0 && issues.length === 0) {
    for (const [id, world] of keepWorld) {
      const box = nodes.get(id) ?? containers.get(id)!;
      if (box.parentId !== null && place.has(box.parentId)) place.add(id);
      else {
        const o = worldOrigin(doc, box.parentId);
        box.x = world.x - o.x;
        box.y = world.y - o.y;
      }
    }
    doc = { ...doc, nodes: [...nodes.values()], containers: [...containers.values()] };
    doc = placeNew(doc, place, modes);
    doc = placeImportedAnnotations(doc, unplacedNotes);
  }
  const final = validateDocument(doc);
  if (final.length) return { ok: false, errors: final.map((i) => i.message) };
  return { ok: true, document: doc, created };
}
