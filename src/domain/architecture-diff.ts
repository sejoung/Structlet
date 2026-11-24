import { diffDocuments } from './diff';
import type { Document, Endpoint } from './model';
import type { Change } from './patch';

const layoutFields = new Set(['x', 'y', 'width', 'height', 'routingMode', 'waypoints']);

function equal(a: unknown, b: unknown): boolean {
  const sortKeys = (_key: string, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
  };
  return a === b || JSON.stringify(a, sortKeys) === JSON.stringify(b, sortKeys);
}

function endpointIdentity(endpoint: Endpoint) {
  return endpoint.kind === 'attached' ? endpoint.objectId : null;
}

export function architectureDiff(before: Document, after: Document) {
  return diffDocuments(before, after).changes.flatMap((change) => {
    if (change.collection === 'title' || !change.before || !change.after) {
      return [{ change, layoutOnly: false }];
    }
    const previous = { ...change.before } as Record<string, unknown>;
    const current = { ...change.after } as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
      .filter((key) => !equal(previous[key], current[key]));
    const layoutOnly = fields.every((key) => layoutFields.has(key)
      || (change.collection === 'edges' && (key === 'source' || key === 'target')
        && endpointIdentity(previous[key] as Endpoint) === endpointIdentity(current[key] as Endpoint)));
    return fields.length ? [{ change, layoutOnly }] : [];
  });
}

export function comparisonStatus(change: Change): 'added' | 'removed' | 'modified' {
  if (change.before === null) return 'added';
  if (change.after === null) return 'removed';
  return 'modified';
}
