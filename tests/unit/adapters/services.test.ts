import { describe, expect, it } from 'vitest';
import { runChecks } from '../../../src/adapters/analysis/checks';
import { buildLegend } from '../../../src/adapters/catalog/legend';
import { LocalFileAccess, type FileAccessHost, type FileHandleLike } from '../../../src/adapters/files/file-access';
import { sampleDocument } from '../fixtures';

describe('architecture checks', () => {
  it('flags data in a public subnet and clients talking to data directly', () => {
    const doc = sampleDocument();
    expect(runChecks(doc).filter((f) => f.severity === 'warning')).toEqual([]);
    const risky = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === 'cache' ? { ...n, parentId: 'public' } : n)),
      edges: [...doc.edges, { ...doc.edges[0]!, id: 'e-bad', target: { kind: 'attached' as const, objectId: 'db', side: 'auto' as const, offset: null } }],
    };
    const codes = runChecks(risky).map((f) => f.code);
    expect(codes).toContain('data-in-public-subnet');
    expect(codes).toContain('client-to-data');
    expect(runChecks({ ...doc, nodes: doc.nodes.map((n, i) => (i === 0 ? { ...n, serviceId: 'x.y' } : n)) }).map((f) => f.code)).toContain('unknown-service');
  });
});

describe('legend', () => {
  it('lists the roles and line styles in use', () => {
    const text = buildLegend(sampleDocument(), 'ko');
    expect(text.split('\n')[0]).toBe('범례');
    expect(text).toContain('#ed7100 컴퓨팅');
    expect(text).toContain('--- 동기 호출');
    expect(text).toContain('- - 비동기 메시지');
  });
});

describe('file access', () => {
  function host() {
    const written: string[] = [];
    const handle: FileHandleLike = {
      name: 'shop.structlet',
      getFile: async () => ({ text: async () => '{"x":1}' }),
      createWritable: async () => ({ write: async (d: string) => void written.push(d), close: async () => undefined }),
    };
    const h: FileAccessHost = { showOpenFilePicker: async () => [handle], showSaveFilePicker: async () => handle, navigator: {} };
    return { h, written };
  }
  const fallback = { pick: async () => ({ name: 'f', text: 'fallback' }), download: () => undefined };

  it('saves back to the opened file', async () => {
    const { h, written } = host();
    const files = new LocalFileAccess(h, [], fallback);
    expect(files.supported).toBe(true);
    expect((await files.open('.structlet'))!.text).toBe('{"x":1}');
    expect(files.fileName).toBe('shop.structlet');
    expect(await files.save('A', 'x', 'm')).toBe('saved');
    expect(written).toEqual(['A']);
    files.forget();
    expect(await files.save('B', 'x', 'm')).toBe('saved');
  });

  it('falls back to download without the API or in automated browsers', async () => {
    const downloads: string[] = [];
    const files = new LocalFileAccess({ ...host().h, navigator: { webdriver: true } }, [], { ...fallback, download: (t: string) => void downloads.push(t) });
    expect(files.supported).toBe(false);
    expect(await files.save('A', 'x', 'm')).toBe('downloaded');
    expect(downloads).toEqual(['A']);
    expect((await files.open('.x'))!.text).toBe('fallback');
  });
});
