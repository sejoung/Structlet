import { describe, expect, it } from 'vitest';
import { parseFragment, serializeFragment } from '../../../src/adapters/format/clipboard';
import { applyPatch, diffDocuments, extractFragment, invertPatch, pasteFragment, validateDocument, worldRect } from '../../../src/domain';
import { sampleDocument } from '../fixtures';

describe('fragments (clipboard)', () => {
  it('copies an area with its contents and internal edges, and pastes it with fresh ids', () => {
    const doc = sampleDocument();
    const fragment = extractFragment(doc, ['private']);
    expect(fragment.containers.map((c) => c.id)).toEqual(['private']);
    expect(fragment.nodes.map((n) => n.id).sort()).toEqual(['api', 'auth', 'cache', 'db']);
    expect(fragment.edges.map((e) => e.id).sort()).toEqual(['e-api-auth', 'e-api-db', 'e-auth-cache']);
    expect(fragment.containers[0]).toMatchObject({ parentId: null, x: 680, y: 200 });

    const text = serializeFragment(fragment);
    const back = parseFragment(text)!;
    expect(back).toEqual(fragment);

    let n = 0;
    const { patch, created } = pasteFragment(doc, back, (c) => `${c}-${++n}`, { x: 40, y: 600 }, 'region');
    const after = applyPatch(doc, patch);
    expect(validateDocument(after)).toEqual([]);
    expect(created).toHaveLength(1);
    const pasted = after.containers.find((c) => c.id === created[0])!;
    expect(pasted.parentId).toBe('region');
    expect(worldRect(after, pasted)).toMatchObject({ x: 720, y: 800 });
    expect(after.edges.length).toBe(doc.edges.length + 3);
  });

  it('ignores clipboard text that is not a fragment', () => {
    expect(parseFragment('hello')).toBeNull();
    expect(parseFragment('{"format":"structlet","formatVersion":1,"id":"x","nodes":[{"id":"a"}]}')).toBeNull();
  });
});

describe('diffDocuments', () => {
  it('turns one document into another and back', () => {
    const a = sampleDocument();
    const b = { ...a, title: 'B', nodes: [...a.nodes.slice(1), { ...a.nodes[0]!, label: 'changed' }], edges: a.edges.slice(2) };
    const patch = diffDocuments(a, b);
    const applied = applyPatch(a, patch);
    expect(applied.title).toBe('B');
    expect(applied.edges).toEqual(b.edges);
    expect(new Set(applied.nodes.map((n) => JSON.stringify(n)))).toEqual(new Set(b.nodes.map((n) => JSON.stringify(n))));
    expect(applyPatch(applied, invertPatch(patch))).toEqual(a);
  });
});
