import { describe, expect, it } from 'vitest';
import { mergeDocuments, validateDocument, worldRect, type Document } from '../../../src/domain';
import { sampleDocument } from '../fixtures';

type Mutable = any;
const edit = (doc: Document, fn: (d: Mutable) => void): Document => {
  const copy = JSON.parse(JSON.stringify(doc)) as Mutable;
  fn(copy);
  return copy as Document;
};
const node = (d: Document, id: string): Mutable => d.nodes.find((n) => n.id === id)!;

describe('three-way merge', () => {
  const base = sampleDocument();

  it('takes each side’s changes to different objects and fields', () => {
    const local = edit(base, (d) => {
      node(d, 'api').label = 'API v2';
      d.nodes.push({ ...base.nodes[0]!, id: 'local-new', label: 'Local' });
    });
    const remote = edit(base, (d) => {
      node(d, 'api').serviceId = 'aws.lambda';
      node(d, 'db').x += 40;
      d.title = 'Remote title';
      d.edges = d.edges.filter((e: Mutable) => e.id !== 'e-worker-mail');
    });
    const { document, conflicts } = mergeDocuments(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(node(document, 'api')).toMatchObject({ label: 'API v2', serviceId: 'aws.lambda' });
    expect(node(document, 'db').x).toBe(node(base, 'db').x + 40);
    expect(document.title).toBe('Remote title');
    expect(document.nodes.some((n) => n.id === 'local-new')).toBe(true);
    expect(document.edges.some((e) => e.id === 'e-worker-mail')).toBe(false);
    expect(validateDocument(document)).toEqual([]);
  });

  it('reports the same field changed differently and lets a side be chosen', () => {
    const local = edit(base, (d) => void (node(d, 'api').label = 'Mine'));
    const remote = edit(base, (d) => void (node(d, 'api').label = 'Theirs'));
    const first = mergeDocuments(base, local, remote);
    expect(first.conflicts.map((c) => c.key)).toEqual(['nodes:api:label']);
    expect(node(first.document, 'api').label).toBe('Mine');
    const chosen = mergeDocuments(base, local, remote, () => 'remote');
    expect(node(chosen.document, 'api').label).toBe('Theirs');
  });

  it('merges a position as one value', () => {
    const local = edit(base, (d) => void (node(d, 'api').x += 10));
    const remote = edit(base, (d) => void (node(d, 'api').y += 10));
    expect(mergeDocuments(base, local, remote).conflicts.map((c) => c.key)).toEqual(['nodes:api:position']);
  });

  it('treats deleting what the other side changed as a conflict', () => {
    const local = edit(base, (d) => void (d.nodes = d.nodes.filter((n: Mutable) => n.id !== 'cache')));
    const remote = edit(base, (d) => void (node(d, 'cache').label = 'Renamed'));
    const merged = mergeDocuments(base, local, remote);
    expect(merged.conflicts.map((c) => c.key)).toEqual(['nodes:cache']);
    expect(merged.document.nodes.some((n) => n.id === 'cache')).toBe(false);
    expect(mergeDocuments(base, local, remote, () => 'remote').document.nodes.some((n) => n.id === 'cache')).toBe(true);
  });

  it('keeps the document valid: lines to deleted boxes go, children of deleted areas move up in place', () => {
    const local = edit(base, (d) => void (node(d, 'api').label = 'API'));
    const remote = edit(base, (d) => void (d.containers = d.containers.filter((c: Mutable) => c.id !== 'private')));
    const withChild = edit(local, (d) => d.nodes.push({ ...base.nodes[0]!, id: 'child', parentId: 'private', x: 10, y: 20 }));
    const merged = mergeDocuments(base, withChild, remote).document;
    expect(validateDocument(merged)).toEqual([]);
    const child = merged.nodes.find((n) => n.id === 'child')!;
    expect(child.parentId).toBe('vpc');
    const before = worldRect(withChild, withChild.nodes.find((n) => n.id === 'child')!);
    expect(worldRect(merged, child)).toMatchObject({ x: before.x, y: before.y });
  });

  it('breaks a parent cycle made by the two sides with the local choice', () => {
    const reparent = (id: string, parentId: string) => (d: Mutable) => {
      d.containers.find((c: { id: string }) => c.id === id).parentId = parentId;
    };
    const local = edit(base, reparent('public', 'private'));
    const remote = edit(base, reparent('private', 'public'));
    const merged = mergeDocuments(base, local, remote).document;
    expect(validateDocument(merged)).toEqual([]);
    expect(merged.containers.find((c) => c.id === 'public')!.parentId).toBe('private');
  });
});
