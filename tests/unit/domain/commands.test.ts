import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addEdge,
  addNode,
  applyPatch,
  CommandError,
  CONTAINER_PRESETS,
  DEFAULT_EDGE_STYLE,
  deleteObjects,
  duplicate,
  emptyDocument,
  invertPatch,
  moveBy,
  moveInto,
  sequence,
  setBounds,
  setParent,
  worldRect,
  wrapInContainer,
  type Document,
} from '../../../src/domain';

function build(): Document {
  let doc = emptyDocument('d', 'T');
  const area = (id: string, parentId: string | null, x: number, y: number, w: number, h: number) =>
    (d: Document) => addContainer(d, { id, kind: 'custom', label: id, parentId, rect: { x, y, width: w, height: h }, width: w, height: h, style: CONTAINER_PRESETS.custom });
  const patch = sequence(
    doc,
    area('vpc', null, 100, 100, 600, 400),
    area('subnet', 'vpc', 140, 160, 250, 300),
    (d) => addNode(d, { id: 'a', serviceId: 'server', label: 'A', parentId: 'subnet', at: { x: 180, y: 200 }, width: 64, height: 64 }),
    (d) => addNode(d, { id: 'b', serviceId: 'database', label: 'B', parentId: null, at: { x: 900, y: 200 }, width: 64, height: 64 }),
    (d) => addNode(d, { id: 'c', serviceId: 'cache', label: 'C', parentId: 'vpc', at: { x: 500, y: 200 }, width: 64, height: 64 }),
    (d) => addEdge(d, { id: 'ab', source: { kind: 'attached', objectId: 'a', side: 'auto', offset: null }, target: { kind: 'attached', objectId: 'b', side: 'auto', offset: null }, label: '', style: DEFAULT_EDGE_STYLE, routingMode: 'auto', waypoints: [] }),
    (d) => addEdge(d, { id: 'ac', source: { kind: 'attached', objectId: 'a', side: 'auto', offset: null }, target: { kind: 'attached', objectId: 'c', side: 'auto', offset: null }, label: '', style: DEFAULT_EDGE_STYLE, routingMode: 'manual', waypoints: [{ x: 300, y: 400 }] }),
  );
  doc = applyPatch(doc, patch);
  return doc;
}

const rectOf = (doc: Document, id: string) => worldRect(doc, doc.nodes.find((n) => n.id === id) ?? doc.containers.find((c) => c.id === id)!);

describe('hierarchy and local coordinates', () => {
  it('stores children relative to their parent', () => {
    const doc = build();
    const a = doc.nodes.find((n) => n.id === 'a')!;
    expect({ x: a.x, y: a.y }).toEqual({ x: 40, y: 40 });
    expect(rectOf(doc, 'a')).toMatchObject({ x: 180, y: 200 });
  });

  it('moving a container moves all descendants without touching them', () => {
    const doc = build();
    const moved = applyPatch(doc, moveBy(doc, ['vpc'], 50, 30));
    expect(rectOf(moved, 'a')).toMatchObject({ x: 230, y: 230 });
    expect(rectOf(moved, 'c')).toMatchObject({ x: 550, y: 230 });
    expect(moved.nodes.find((n) => n.id === 'a')).toBe(doc.nodes.find((n) => n.id === 'a'));
    // Edge a→c lies wholly inside the moved area: its manual waypoints follow.
    expect(moved.edges.find((e) => e.id === 'ac')!.waypoints).toEqual([{ x: 350, y: 430 }]);
    // Edge a→b leaves the area: untouched.
    expect(moved.edges.find((e) => e.id === 'ab')).toBe(doc.edges.find((e) => e.id === 'ab'));
  });

  it('does not move a child twice when it is selected with its container', () => {
    const doc = build();
    const moved = applyPatch(doc, moveBy(doc, ['vpc', 'subnet', 'a'], 10, 0));
    expect(rectOf(moved, 'a').x).toBe(190);
  });

  it('skips locked boxes', () => {
    let doc = build();
    doc = { ...doc, containers: doc.containers.map((c) => (c.id === 'vpc' ? { ...c, locked: true } : c)) };
    const moved = applyPatch(doc, moveBy(doc, ['vpc'], 10, 10));
    expect(rectOf(moved, 'vpc')).toMatchObject({ x: 100, y: 100 });
  });

  it('reparenting keeps the world position', () => {
    const doc = build();
    const moved = applyPatch(doc, setParent(doc, ['a'], null));
    expect(moved.nodes.find((n) => n.id === 'a')).toMatchObject({ parentId: null, x: 180, y: 200 });
    const back = applyPatch(moved, setParent(moved, ['a'], 'subnet'));
    expect(back.nodes.find((n) => n.id === 'a')).toMatchObject({ parentId: 'subnet', x: 40, y: 40 });
  });

  it('rejects cycles', () => {
    const doc = build();
    expect(() => setParent(doc, ['vpc'], 'subnet')).toThrow(CommandError);
    expect(() => setParent(doc, ['vpc'], 'vpc')).toThrow(CommandError);
    // moveInto keeps the old parent instead of failing the whole drag.
    const moved = applyPatch(doc, moveInto(doc, ['vpc'], 5, 0, new Map([['vpc', 'subnet']])));
    expect(moved.containers.find((c) => c.id === 'vpc')).toMatchObject({ parentId: null, x: 105 });
  });

  it('a drag into another area is one invertible patch', () => {
    const doc = build();
    const patch = moveInto(doc, ['b'], -500, 0, new Map([['b', 'vpc']]));
    const moved = applyPatch(doc, patch);
    expect(moved.nodes.find((n) => n.id === 'b')).toMatchObject({ parentId: 'vpc', x: 300, y: 100 });
    expect(applyPatch(moved, invertPatch(patch))).toEqual(doc);
  });

  it('resizing a container from the top-left keeps children in place', () => {
    const doc = build();
    const resized = applyPatch(doc, setBounds(doc, 'subnet', { x: 120, y: 140, width: 270, height: 320 }));
    expect(rectOf(resized, 'a')).toMatchObject({ x: 180, y: 200 });
  });
});

describe('delete and duplicate', () => {
  it('deleting a container removes contents and attached edges; undo restores order', () => {
    const doc = build();
    const patch = deleteObjects(doc, ['subnet']);
    const after = applyPatch(doc, patch);
    expect(after.nodes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(after.containers.map((c) => c.id)).toEqual(['vpc']);
    expect(after.edges).toEqual([]);
    expect(applyPatch(after, invertPatch(patch))).toEqual(doc);
  });

  it('duplicates a subtree with internal edges and fresh ids', () => {
    const doc = build();
    let n = 0;
    const { patch, created } = duplicate(doc, ['vpc'], (c) => `${c}-copy-${++n}`, { x: 0, y: 500 });
    const after = applyPatch(doc, patch);
    expect(created).toHaveLength(1);
    expect(after.containers).toHaveLength(4);
    expect(after.nodes).toHaveLength(5);
    const copyEdge = after.edges.find((e) => e.id.startsWith('edges-copy'))!;
    expect(copyEdge.waypoints).toEqual([{ x: 300, y: 900 }]);
    const copiedNode = after.nodes.find((x) => x.id.startsWith('nodes-copy') && x.label === 'A')!;
    expect(rectOf(after, copiedNode.id)).toMatchObject({ x: 180, y: 700 });
  });

  it('wraps boxes in a new area under their common parent', () => {
    const doc = build();
    const after = applyPatch(doc, wrapInContainer(doc, ['a'], { id: 'g', kind: 'custom', label: 'G', width: 0, height: 0, style: CONTAINER_PRESETS.custom }, 20));
    expect(after.containers.find((c) => c.id === 'g')!.parentId).toBe('subnet');
    expect(after.nodes.find((x) => x.id === 'a')!.parentId).toBe('g');
    expect(rectOf(after, 'a')).toMatchObject({ x: 180, y: 200 });
  });
});
