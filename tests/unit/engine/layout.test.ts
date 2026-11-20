import { describe, expect, it } from 'vitest';
import { applyPatch, moveEach, worldRect, type Document } from '../../../src/domain';
import { arrange, intersects, layoutSelection, orderLayers } from '../../../src/engine';
import { sampleDocument } from '../fixtures';

const items = (ids: string[]) => ids.map((id) => ({ id, width: 100, height: 60 }));

describe('arrange', () => {
  it('ranks a chain left to right and top to bottom', () => {
    const links = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const flow = arrange(items(['c', 'a', 'b']), links, 'flow');
    expect(flow.get('a')!.x).toBeLessThan(flow.get('b')!.x);
    expect(flow.get('b')!.x).toBeLessThan(flow.get('c')!.x);
    const down = arrange(items(['c', 'a', 'b']), links, 'flow-down');
    expect(down.get('a')!.y).toBeLessThan(down.get('c')!.y);
  });

  it('ignores cycles and lays out grids without overlap', () => {
    const cyc = arrange(items(['a', 'b']), [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], 'flow');
    expect(cyc.size).toBe(2);
    const grid = arrange(items(['a', 'b', 'c', 'd', 'e']), [], 'grid');
    const rects = [...grid].map(([, p]) => ({ ...p, width: 100, height: 60 }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(intersects(rects[i]!, rects[j]!)).toBe(false);
  });

  it('reorders layers to remove crossings', () => {
    const links = [{ from: 'a', to: 'y' }, { from: 'b', to: 'x' }];
    const ordered = orderLayers([['a', 'b'], ['x', 'y']], links);
    expect(ordered[1]).toEqual(['y', 'x']);
  });
});

describe('layoutSelection', () => {
  it('arranges siblings by their links and keeps locked boxes', () => {
    let doc: Document = sampleDocument();
    doc = { ...doc, nodes: doc.nodes.map((n) => (n.id === 'cache' ? { ...n, locked: true } : n)) };
    const ids = ['api', 'auth', 'db', 'cache'];
    const before = new Map(ids.map((id) => [id, worldRect(doc, doc.nodes.find((n) => n.id === id)!)]));
    const { moves, grow } = layoutSelection(doc, ids, 'flow-down');
    expect(moves.has('cache')).toBe(false);
    const after = applyPatch(doc, moveEach(doc, moves));
    const r = (id: string) => worldRect(after, after.nodes.find((n) => n.id === id)!);
    // api calls auth and db: they end up below it.
    expect(r('auth').y).toBeGreaterThan(r('api').y);
    expect(r('db').y).toBeGreaterThan(r('api').y);
    expect(r('cache')).toEqual(before.get('cache'));
    expect(grow instanceof Map).toBe(true);
  });
});
