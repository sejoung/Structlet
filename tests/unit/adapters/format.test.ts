import { describe, expect, it } from 'vitest';
import { parseStructlet, serializeStructlet } from '../../../src/adapters/format/structlet-format';
import { parseFragment, serializeFragment } from '../../../src/adapters/format/clipboard';
import { LocalDocumentStore } from '../../../src/adapters/storage/local-document-store';
import { extractFragment } from '../../../src/domain';
import { newEditor, sampleDocument, sampleText } from '../fixtures';

function mutate(fn: (raw: any) => void): string {
  const raw = JSON.parse(sampleText());
  fn(raw);
  return JSON.stringify(raw);
}

describe('.structlet format', () => {
  it('round-trips the vertical slice: save, reopen, same positions and relations', () => {
    const editor = newEditor();
    const a = editor.addService('server', 'Web', { x: 132, y: 132 }, null);
    const b = editor.addService('database', 'DB', { x: 432, y: 132 }, null);
    editor.connect({ kind: 'attached', objectId: a, side: 'auto', offset: null }, { kind: 'attached', objectId: b, side: 'left', offset: 0.5 }, 'SQL');
    const doc = editor.session.document;
    const reopened = parseStructlet(serializeStructlet(doc));
    expect(reopened.ok && reopened.document).toEqual(doc);
  });

  it('round-trips nested areas, manual routes and annotations', () => {
    const editor = newEditor(sampleDocument());
    editor.setRoute('e-api-db', [{ x: 860, y: 292 }, { x: 860, y: 250 }]);
    editor.update('edges', 'e-api-queue', { routingMode: 'auto', waypoints: [] });
    const doc = editor.session.document;
    const text = serializeStructlet(doc);
    const reopened = parseStructlet(text);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document).toEqual(doc);
    expect(serializeStructlet(doc)).toBe(text);
  });

  it('does not store automatic routes', () => {
    const text = mutate((raw) => {
      raw.edges[0].waypoints = [{ x: 1, y: 2 }];
    });
    const result = parseStructlet(text);
    expect(result.ok && result.document.edges[0]!.waypoints).toEqual([]);
  });

  it('keeps structured equipment specs through save, reopen, and clipboard', () => {
    const editor = newEditor(sampleDocument());
    const specs = { instanceType: 't4g.nano', vcpus: 2, memoryGiB: 0.5, diskGiB: 20, showDetails: true };
    editor.update('nodes', 'api', { specs });
    const doc = editor.session.document;
    expect(parseStructlet(serializeStructlet(doc))).toEqual({ ok: true, document: doc });
    const fragment = extractFragment(doc, ['api']);
    expect(parseFragment(serializeFragment(fragment))?.nodes[0]?.specs).toEqual(specs);
  });

  it.each([
    ['not JSON', '{nope'],
    ['another format', mutate((r) => (r.format = 'stormlet'))],
    ['a newer version', mutate((r) => (r.formatVersion = 99))],
    ['infinite-like coordinates', mutate((r) => (r.nodes[0].x = 1e12))],
    ['a string coordinate', mutate((r) => (r.nodes[0].x = '10'))],
    ['a missing parent', mutate((r) => (r.nodes[0].parentId = 'nowhere'))],
    ['a parent cycle', mutate((r) => (r.containers[0].parentId = r.containers[4].id))],
    ['an edge to nothing', mutate((r) => (r.edges[0].target.objectId = 'ghost'))],
    ['a bad side', mutate((r) => (r.edges[0].target.side = 'middle'))],
    ['an offset outside 0..1', mutate((r) => (r.edges[0].target.offset = 3))],
    ['an unsafe id', mutate((r) => (r.nodes[0].id = '<script>'))],
    ['a negative memory capacity', mutate((r) => (r.nodes[0].specs = { memoryGiB: -1 }))],
    ['an oversized file', 'x'.repeat(5 * 1024 * 1024 + 1)],
  ])('rejects %s without throwing', (_name, text) => {
    const result = parseStructlet(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it('keeps unknown service ids as they are', () => {
    const result = parseStructlet(mutate((r) => (r.nodes[0].serviceId = 'vendor.future-thing')));
    expect(result.ok && result.document.nodes[0]!.serviceId).toBe('vendor.future-thing');
  });
});

describe('browser autosave', () => {
  it('saves and loads, and ignores a corrupt copy', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    const store = new LocalDocumentStore(storage);
    expect(store.load()).toBeNull();
    const doc = sampleDocument();
    store.save(doc);
    expect(store.load()).toEqual(doc);
    data.set('structlet:autosave:v1', '{"format":"structlet","formatVersion":1,"id":"x","nodes":[{"id":"n"}]}');
    expect(store.load()).toBeNull();
  });
});
