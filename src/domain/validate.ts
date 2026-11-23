import { InfrastructureError, readInfrastructure } from './infrastructure';
import { findParentCycles } from './hierarchy';
import { indexDocument } from './lookup';
import { FORMAT_VERSION, isSpecQuantity, NODE_SPEC_TEXT_LIMIT, type Document, type Endpoint, type Id } from './model';

export interface ValidationIssue {
  readonly code:
    | 'duplicate-id'
    | 'unknown-parent'
    | 'parent-cycle'
    | 'unknown-endpoint'
    | 'unknown-target'
    | 'not-finite'
    | 'bad-size'
    | 'bad-specs'
    | 'bad-infrastructure'
    | 'bad-offset'
    | 'too-many-objects'
    | 'unsupported-version';
  readonly id?: Id;
  readonly message: string;
}

export const LIMITS = {
  objects: 5000,
  waypoints: 200,
  textLength: 2000,
  coordinate: 1_000_000,
  size: 100_000,
} as const;

function finite(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= LIMITS.coordinate;
}

export function validateDocument(doc: Document): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (doc.formatVersion !== FORMAT_VERSION) {
    issues.push({ code: 'unsupported-version', message: `Unsupported format version ${doc.formatVersion}` });
  }
  const total = doc.nodes.length + doc.containers.length + doc.edges.length + doc.annotations.length;
  if (total > LIMITS.objects) {
    issues.push({ code: 'too-many-objects', message: `${total} objects exceed the limit of ${LIMITS.objects}` });
    return issues;
  }
  const seen = new Set<Id>();
  for (const list of [doc.nodes, doc.containers, doc.edges, doc.annotations]) {
    for (const o of list) {
      if (seen.has(o.id)) issues.push({ code: 'duplicate-id', id: o.id, message: `Duplicate id ${o.id}` });
      seen.add(o.id);
    }
  }
  const index = indexDocument(doc);
  for (const box of [...doc.nodes, ...doc.containers]) {
    if (box.parentId !== null && !index.containers.has(box.parentId)) {
      issues.push({ code: 'unknown-parent', id: box.id, message: `${box.id} refers to missing container ${box.parentId}` });
    }
    if (![box.x, box.y, box.width, box.height].every(finite)) {
      issues.push({ code: 'not-finite', id: box.id, message: `${box.id} has an invalid position or size` });
    } else if (box.width <= 0 || box.height <= 0 || box.width > LIMITS.size || box.height > LIMITS.size) {
      issues.push({ code: 'bad-size', id: box.id, message: `${box.id} has an invalid size` });
    }
  }
  for (const id of findParentCycles(doc)) {
    issues.push({ code: 'parent-cycle', id, message: `${id} is part of a container cycle` });
  }
  for (const { id, infrastructure } of [...doc.nodes, ...doc.containers]) {
    if (infrastructure !== undefined) {
      try {
        readInfrastructure(infrastructure, `${id}.infrastructure`);
      } catch (error) {
        if (!(error instanceof InfrastructureError)) throw error;
        issues.push({ code: 'bad-infrastructure', id, message: error.message });
      }
    }
  }
  for (const { id, specs } of doc.nodes) {
    if (!specs) continue;
    const textValid = [specs.instanceType, specs.gpu].every((v) => v === undefined || (typeof v === 'string' && v.length <= NODE_SPEC_TEXT_LIMIT));
    const numbersValid = [specs.vcpus, specs.memoryGiB, specs.diskGiB].every((v) => v === undefined || isSpecQuantity(v));
    if (!textValid || !numbersValid || (specs.showDetails !== undefined && typeof specs.showDetails !== 'boolean')) {
      issues.push({ code: 'bad-specs', id, message: `${id} has invalid equipment specifications` });
    }
  }
  const checkEnd = (edgeId: Id, end: Endpoint) => {
    if (end.kind === 'free') {
      if (!finite(end.x) || !finite(end.y)) issues.push({ code: 'not-finite', id: edgeId, message: `${edgeId} has an invalid free endpoint` });
      return;
    }
    if (!index.nodes.has(end.objectId) && !index.containers.has(end.objectId)) {
      issues.push({ code: 'unknown-endpoint', id: edgeId, message: `${edgeId} connects to missing object ${end.objectId}` });
    }
    if (end.offset !== null && !(end.offset >= 0 && end.offset <= 1)) {
      issues.push({ code: 'bad-offset', id: edgeId, message: `${edgeId} has an endpoint offset outside 0..1` });
    }
  };
  for (const e of doc.edges) {
    checkEnd(e.id, e.source);
    checkEnd(e.id, e.target);
    if (!e.waypoints.every((p) => finite(p.x) && finite(p.y))) {
      issues.push({ code: 'not-finite', id: e.id, message: `${e.id} has an invalid waypoint` });
    }
  }
  for (const a of doc.annotations) {
    if (!finite(a.x) || !finite(a.y)) issues.push({ code: 'not-finite', id: a.id, message: `${a.id} has an invalid position` });
    if (a.targetId !== null && !seen.has(a.targetId)) {
      issues.push({ code: 'unknown-target', id: a.id, message: `${a.id} refers to missing object ${a.targetId}` });
    }
  }
  return issues;
}
