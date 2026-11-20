import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectSource, importInto } from '../../../src/adapters/draft/import';
import { emptyDocument, validateDocument, worldRect, type Document } from '../../../src/domain';
import { containsRect, intersects, worldRects } from '../../../src/engine';
import { sampleDocument } from '../fixtures';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

const draft = {
  format: 'structlet-draft',
  formatVersion: 1,
  title: 'Draft',
  layout: 'flow',
  containers: [
    { id: 'vpc', kind: 'vpc', label: 'VPC' },
    { id: 'pub', kind: 'subnet', label: 'Public', parent: 'vpc', layout: 'flow-down' },
    { id: 'priv', kind: 'subnet', label: 'Private', parent: 'vpc', layout: 'flow-down' },
  ],
  nodes: [
    { id: 'user', service: 'user', label: 'User' },
    { id: 'lb', service: 'load-balancer', label: 'LB', parent: 'pub' },
    { id: 'app', service: 'server', label: 'App', parent: 'priv' },
    { id: 'db', service: 'database', label: 'DB', parent: 'priv' },
  ],
  edges: [
    { from: 'user', to: 'lb', label: 'HTTPS' },
    { from: 'lb', to: 'app' },
    { from: 'app', to: 'db', label: 'SQL' },
  ],
};

function noOverlaps(doc: Document) {
  const rects = worldRects(doc);
  const byParent = new Map<string | null, string[]>();
  for (const b of [...doc.nodes, ...doc.containers]) byParent.set(b.parentId, [...(byParent.get(b.parentId) ?? []), b.id]);
  for (const ids of byParent.values())
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(intersects(rects.get(ids[i]!)!, rects.get(ids[j]!)!), `${ids[i]} × ${ids[j]}`).toBe(false);
  for (const b of [...doc.nodes, ...doc.containers]) if (b.parentId) expect(containsRect(rects.get(b.parentId)!, rects.get(b.id)!), `${b.id} in ${b.parentId}`).toBe(true);
}

describe('draft import', () => {
  it('lays out a draft without coordinates into nested areas', async () => {
    const result = await importInto(emptyDocument('d', 'x'), JSON.stringify(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = result.document;
    expect(validateDocument(doc)).toEqual([]);
    expect(doc.nodes).toHaveLength(4);
    expect(doc.edges.map((e) => e.id)).toEqual(['e-user-lb', 'e-lb-app', 'e-app-db']);
    noOverlaps(doc);
    const r = (id: string) => worldRect(doc, doc.nodes.find((n) => n.id === id)!);
    expect(r('user').x).toBeLessThan(r('lb').x);
    expect(r('app').y).toBeLessThan(r('db').y);
  });

  it('partially modifies a document: keeps ids, positions and locks, places only new objects', async () => {
    const base = sampleDocument();
    const locked = { ...base, nodes: base.nodes.map((n) => (n.id === 'db' ? { ...n, locked: true } : n)) };
    const patch = {
      nodes: [
        { id: 'api', label: 'Orders API v2' },
        { id: 'db', x: 0, y: 0 },
        { id: 'cdn', service: 'cdn', label: 'CDN' },
        { id: 'audit', service: 'logs', label: 'Audit log', parent: 'private' },
      ],
      edges: [
        { from: 'user', to: 'cdn' },
        { from: 'api', to: 'audit', dashed: true },
        { from: 'api', to: 'db', label: 'SQL (TLS)' },
      ],
      remove: ['mail'],
    };
    const result = await importInto(locked, JSON.stringify(patch));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = result.document;
    for (const n of locked.nodes) {
      if (n.id === 'mail') continue;
      const after = doc.nodes.find((x) => x.id === n.id)!;
      expect({ x: after.x, y: after.y, parentId: after.parentId, locked: after.locked }, n.id).toEqual({ x: n.x, y: n.y, parentId: n.parentId, locked: n.locked });
    }
    expect(doc.nodes.find((n) => n.id === 'api')!.label).toBe('Orders API v2');
    expect(doc.nodes.some((n) => n.id === 'mail')).toBe(false);
    expect(doc.edges.find((e) => e.id === 'e-api-db')!.label).toBe('SQL (TLS)');
    expect(doc.edges.filter((e) => e.target.kind === 'attached' && e.target.objectId === 'db')).toHaveLength(1);
    // The new CDN sits to the right of the user it is linked from, without overlapping.
    const rects = worldRects(doc);
    expect(rects.get('cdn')!.x).toBeGreaterThan(rects.get('user')!.x);
    for (const [id, r] of rects) if (id !== 'cdn' && doc.nodes.some((n) => n.id === id)) expect(intersects(r, rects.get('cdn')!), id).toBe(false);
    expect(containsRect(rects.get('private')!, rects.get('audit')!)).toBe(true);
    expect(validateDocument(doc)).toEqual([]);
  });

  it.each([
    ['an unknown reference', { edges: [{ from: 'api', to: 'ghost' }] }, 'ghost'],
    ['a parent cycle', { containers: [{ id: 'cloud', parent: 'vpc' }] }, 'cycle'],
    ['a kind clash', { containers: [{ id: 'api' }] }, 'service node'],
    ['a bad value', { nodes: [{ id: 'x', x: 'left' }] }, 'finite number'],
  ])('rejects %s and returns no document', async (_n, input, message) => {
    const result = await importInto(sampleDocument(), JSON.stringify(input));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain(message);
  });

  it('imports docker-compose with networks, ports and volumes', async () => {
    const text = fixture('docker-compose.yml');
    expect(detectSource(text)).toBe('compose');
    const result = await importInto(emptyDocument('d', 'x'), text);
    expect(result.ok, !result.ok ? result.errors.join() : '').toBe(true);
    if (!result.ok) return;
    const ids = result.document.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['svc-web', 'svc-api', 'svc-db', 'client-web', 'vol-pgdata']));
    expect(result.document.nodes.find((n) => n.id === 'svc-db')!.serviceId).toBe('database');
    const edge = (a: string, b: string) => result.document.edges.some((e) => e.source.kind === 'attached' && e.target.kind === 'attached' && e.source.objectId === a && e.target.objectId === b);
    expect(edge('svc-api', 'svc-cache')).toBe(true);
    expect(edge('svc-worker', 'svc-queue')).toBe(true);
    expect(result.document.containers.map((c) => c.id)).toEqual(expect.arrayContaining(['net-front', 'net-back']));
    noOverlaps(result.document);
  });

  it('imports terraform state with VPC and subnet nesting', async () => {
    const text = fixture('terraform-state.json');
    expect(detectSource(text)).toBe('terraform');
    const result = await importInto(emptyDocument('d', 'x'), text);
    expect(result.ok, !result.ok ? result.errors.join() : '').toBe(true);
    if (!result.ok) return;
    const doc = result.document;
    const parent = (id: string) => [...doc.nodes, ...doc.containers].find((b) => b.id === id)!.parentId;
    expect(parent('tf-aws_subnet.private')).toBe('tf-aws_vpc.main');
    expect(parent('tf-aws_instance.app')).toBe('tf-aws_subnet.private');
    expect(parent('tf-aws_lb.web')).toBe('tf-aws_subnet.public');
    expect(doc.nodes.some((n) => n.id.includes('iam_role'))).toBe(false);
    const linked = (a: string, b: string) => doc.edges.some((e) => e.source.kind === 'attached' && e.target.kind === 'attached' && e.source.objectId === a && e.target.objectId === b);
    expect(linked('tf-aws_lambda_function.worker', 'tf-aws_sqs_queue.orders')).toBe(true);
    expect(linked('tf-aws_sqs_queue.orders', 'tf-aws_lambda_function.worker')).toBe(true);
    expect(doc.edges.some((e) => e.source.kind === 'attached' && e.source.objectId === 'tf-aws_instance.app')).toBe(true);
    noOverlaps(doc);
  });
});

describe('documented example', () => {
  it('samples/draft-example.json imports cleanly', async () => {
    const text = readFileSync(fileURLToPath(new URL('../../../samples/draft-example.json', import.meta.url)), 'utf8');
    const result = await importInto(emptyDocument('d', 'x'), text);
    expect(result.ok, !result.ok ? result.errors.join() : '').toBe(true);
    if (!result.ok) return;
    expect(result.document.title).toBe('Checkout · draft');
    noOverlaps(result.document);
    const step = result.document.annotations.find((a) => a.id === 's1')!;
    const alb = worldRects(result.document).get('alb')!;
    expect(Math.abs(step.x - alb.x)).toBeLessThan(20);
  });
});
