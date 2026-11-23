import { describe, expect, it } from 'vitest';
import { worldRect } from '../../../src/domain';
import { newEditor, sampleDocument } from '../fixtures';

describe('editing session', () => {
  it('builds the vertical slice: two nodes and a connection', () => {
    const editor = newEditor();
    const a = editor.addService('server', 'Web', { x: 100, y: 100 }, null);
    const b = editor.addService('database', 'DB', { x: 400, y: 100 }, null);
    const e = editor.connect({ kind: 'attached', objectId: a, side: 'auto', offset: null }, { kind: 'attached', objectId: b, side: 'auto', offset: null });
    const doc = editor.session.document;
    expect(doc.nodes.map((n) => n.label)).toEqual(['Web', 'DB']);
    expect(doc.edges[0]).toMatchObject({ id: e, source: { objectId: a }, target: { objectId: b } });
    expect(editor.session.selected).toEqual([e]);
  });

  it('moving an area with children and edges is one undo step', () => {
    const editor = newEditor(sampleDocument());
    const before = editor.session.document;
    editor.previewMove(['vpc'], { x: 30, y: 0 });
    editor.previewMove(['vpc'], { x: 60, y: 40 });
    expect(editor.session.committedDocument).toBe(before);
    editor.move(['vpc'], { x: 60, y: 40 });
    const after = editor.session.document;
    const api = (d: typeof after) => worldRect(d, d.nodes.find((n) => n.id === 'api')!);
    expect(api(after).x - api(before).x).toBe(60);
    expect(editor.undo()).toBe(true);
    expect(editor.session.document).toEqual(before);
    expect(editor.redo()).toBe(true);
    expect(editor.session.document).toEqual(after);
  });

  it('coalesces typing into one undo step and a new edit clears redo', () => {
    const editor = newEditor(sampleDocument());
    const session = editor.session;
    let t = 0;
    (session as unknown as { now: () => number }).now = () => (t += 100);
    editor.rename('api', 'O');
    editor.rename('api', 'Or');
    editor.rename('api', 'Order');
    expect(session.document.nodes.find((n) => n.id === 'api')!.label).toBe('Order');
    editor.undo();
    expect(session.document.nodes.find((n) => n.id === 'api')!.label).toBe('주문 API\nECS Fargate');
    editor.redo();
    editor.undo();
    editor.rename('db', 'X');
    expect(session.getSnapshot().canRedo).toBe(false);
  });

  it('restores the selection on undo and ignores invalid commands', () => {
    const editor = newEditor(sampleDocument());
    editor.session.select(['api', 'db']);
    editor.delete(['api', 'db']);
    expect(editor.session.selected).toEqual([]);
    editor.undo();
    expect(editor.session.selected).toEqual(['api', 'db']);
    const result = editor.setParent(['cloud'], 'vpc');
    expect(result.ok).toBe(false);
    expect(editor.session.document.containers.find((c) => c.id === 'cloud')!.parentId).toBeNull();
  });

  it('stores manual routes and resets them to automatic', () => {
    const editor = newEditor(sampleDocument());
    editor.setRoute('e-api-db', [{ x: 900.4, y: 250 }, { x: 900, y: 300 }]);
    expect(editor.session.document.edges.find((e) => e.id === 'e-api-db')).toMatchObject({ routingMode: 'manual', waypoints: [{ x: 900, y: 250 }, { x: 900, y: 300 }] });
    editor.resetRoute('e-api-db');
    expect(editor.session.document.edges.find((e) => e.id === 'e-api-db')).toMatchObject({ routingMode: 'auto', waypoints: [] });
  });
});
