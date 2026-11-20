import { describe, expect, it } from 'vitest';
import { validateDocument, type Document } from '../../../src/domain';
import { sampleDocument } from '../fixtures';

const codes = (doc: Document) => validateDocument(doc).map((i) => i.code);

describe('validateDocument', () => {
  it('accepts the sample', () => {
    expect(validateDocument(sampleDocument())).toEqual([]);
  });

  it('rejects parent cycles', () => {
    const doc = sampleDocument();
    const cyclic = { ...doc, containers: doc.containers.map((c) => (c.id === 'cloud' ? { ...c, parentId: 'vpc' } : c)) };
    expect(codes(cyclic)).toContain('parent-cycle');
  });

  it('rejects dangling references and duplicate ids', () => {
    const doc = sampleDocument();
    const broken: Document = {
      ...doc,
      nodes: [...doc.nodes, { ...doc.nodes[0]! }, { ...doc.nodes[1]!, id: 'x', parentId: 'missing' }],
      edges: [...doc.edges, { ...doc.edges[0]!, id: 'e-x', target: { kind: 'attached', objectId: 'ghost', side: 'auto', offset: null } }],
    };
    expect(codes(broken)).toEqual(expect.arrayContaining(['duplicate-id', 'unknown-parent', 'unknown-endpoint']));
  });

  it('rejects non-finite geometry', () => {
    const doc = sampleDocument();
    const bad = { ...doc, nodes: doc.nodes.map((n, i) => (i === 0 ? { ...n, x: Number.NaN } : n)) };
    expect(codes(bad)).toContain('not-finite');
  });
});
