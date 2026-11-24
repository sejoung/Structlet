import { describe, expect, it } from 'vitest';
import { architectureDiff, comparisonStatus } from '../../../src/domain/architecture-diff';
import { DEFAULT_EDGE_STYLE, emptyDocument, type Document, type Edge, type Node } from '../../../src/domain/model';

const api: Node = {
  id: 'api', serviceId: 'server', label: 'API', parentId: null,
  x: 0, y: 0, width: 64, height: 64, locked: false, variant: 'icon',
};

const edge: Edge = {
  id: 'edge', label: '', style: DEFAULT_EDGE_STYLE,
  source: { kind: 'attached', objectId: api.id, side: 'auto', offset: null },
  target: { kind: 'free', x: 200, y: 100 }, routingMode: 'auto', waypoints: [],
};

const before: Document = { ...emptyDocument('diagram', 'Architecture'), nodes: [api], edges: [edge] };

function summary(after: Document) {
  return architectureDiff(before, after).map(({ change, layoutOnly }) => ({
    id: change.collection === 'title' ? 'title' : change.id,
    status: comparisonStatus(change),
    layoutOnly,
  }));
}

describe('architectureDiff', () => {
  it('distinguishes positioning, resizing, endpoint placement and routing from structure', () => {
    const after: Document = {
      ...before,
      nodes: [{ ...api, x: 10, width: 80 }],
      edges: [{
        ...edge,
        source: { kind: 'attached', objectId: api.id, side: 'right', offset: 0.5 },
        target: { kind: 'free', x: 210, y: 100 },
        routingMode: 'manual', waypoints: [{ x: 100, y: 100 }],
      }],
    };
    expect(summary(after)).toEqual([
      { id: 'api', status: 'modified', layoutOnly: true },
      { id: 'edge', status: 'modified', layoutOnly: true },
    ]);
  });

  it('keeps reparenting and reconnecting visible when geometry also changes', () => {
    const after: Document = {
      ...before,
      nodes: [{ ...api, x: 10, parentId: 'private' }, { ...api, id: 'cache', serviceId: 'cache', label: 'Redis' }],
      edges: [{ ...edge, target: { kind: 'attached', objectId: 'cache', side: 'auto', offset: null } }],
    };
    expect(summary(after)).toEqual([
      { id: 'api', status: 'modified', layoutOnly: false },
      { id: 'cache', status: 'added', layoutOnly: false },
      { id: 'edge', status: 'modified', layoutOnly: false },
    ]);
  });

  it('preserves title changes and deleted objects', () => {
    expect(summary({ ...before, title: 'New title', edges: [] })).toEqual([
      { id: 'title', status: 'modified', layoutOnly: false },
      { id: 'edge', status: 'removed', layoutOnly: false },
    ]);
  });

  it('ignores differences in object property order', () => {
    expect(summary({ ...before, edges: [{ ...edge, style: { shape: 'orthogonal', arrow: 'end', dashed: false } }] })).toEqual([]);
  });
});
