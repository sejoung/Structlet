import { describe, expect, it } from 'vitest';
import { DriveClient } from '../../../../src/adapters/drive/client';
import { memoryCreations } from '../../../../src/adapters/drive/creations';
import { serializeStructlet } from '../../../../src/adapters/format/structlet-format';
import { freeName, isNameFor } from '../../../../src/adapters/format/file-names';
import { RemoteError } from '../../../../src/domain';
import { sampleDocument } from '../../fixtures';

interface Stored { name: string; version: number; content: string; parents: string[]; mimeType: string }

function fakeDrive() {
  const files = new Map<string, Stored>();
  const calls: string[] = [];
  let ids = 0;
  const faults = { status: 0, reason: '', loseNextCreate: false };
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const parts = (init: RequestInit): [Record<string, unknown>, string] => {
    const type = String((init.headers as Record<string, string>)['Content-Type']);
    const boundary = /boundary=(.+)$/.exec(type)![1]!;
    const [meta, content] = String(init.body).split(`--${boundary}`).slice(1, 3).map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
    return [JSON.parse(meta!), content!];
  };
  const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url.pathname}${url.search}`);
    if (faults.status) {
      const s = faults.status;
      faults.status = 0;
      return json({ error: { errors: [{ reason: faults.reason }] } }, s);
    }
    if (url.pathname.endsWith('/about')) return json({ user: { permissionId: 'p1', emailAddress: 'me@example.com' } });
    const id = decodeURIComponent(url.pathname.split('/files/')[1] ?? '');
    if (id === 'generateIds') return json({ ids: [`gen-${++ids}`] });
    const parent = /^'(.+)' in parents/.exec(url.searchParams.get('q') ?? '')?.[1];
    if (parent) return json({ files: [...files].filter(([, f]) => f.parents.includes(parent)).map(([fid, f]) => ({ id: fid, name: f.name })) });
    const meta = (fid: string) => ({ id: fid, name: files.get(fid)!.name, version: String(files.get(fid)!.version), mimeType: files.get(fid)!.mimeType, size: String(files.get(fid)!.content.length), parents: files.get(fid)!.parents });
    if (method === 'POST') {
      const [m, content] = parts(init);
      files.set(String(m.id), { name: String(m.name), version: 1, content, parents: m.parents as string[], mimeType: String(m.mimeType) });
      if (faults.loseNextCreate) {
        faults.loseNextCreate = false;
        throw new TypeError('Failed to fetch');
      }
      return json(meta(String(m.id)));
    }
    const f = files.get(id);
    if (!f) return json({}, 404);
    if (method === 'PATCH') {
      const ifMatch = (init.headers as Record<string, string>)['If-Match'];
      if (ifMatch && ifMatch !== `"v${f.version}"`) return json({}, 412);
      if (url.searchParams.get('uploadType') === 'multipart') {
        const [m, content] = parts(init);
        f.content = content;
        if (m.name) f.name = String(m.name);
      } else f.content = String(init.body);
      f.version++;
      return json(meta(id));
    }
    if (url.searchParams.get('alt') === 'media') return new Response(f.content);
    return json(meta(id), 200, { ETag: `"v${f.version}"` });
  };
  return { files, calls, faults, fetcher: fetcher as typeof fetch };
}

const client = (drive: ReturnType<typeof fakeDrive>, token: string | null = 'tok', refused: string[] = []) => new DriveClient(() => token, drive.fetcher, (t) => refused.push(t), memoryCreations());

describe('Drive client', () => {
  it('creates under a reserved id, opens, and saves with a version check', async () => {
    const drive = fakeDrive();
    const c = client(drive);
    const doc = sampleDocument();
    const file = await c.create('folder-1', doc);
    expect(file).toMatchObject({ id: 'gen-1', name: '온라인 상점 · 시스템 구성도.structlet', version: '1' });
    expect(drive.files.get('gen-1')!.mimeType).toBe('application/vnd.structlet+json');
    const opened = await c.open(file.id);
    expect(opened.document).toEqual(doc);
    const saved = await c.save(file, { ...doc, title: '새 이름' });
    expect(saved).toMatchObject({ version: '2', name: '새 이름.structlet' });
    await expect(c.save(file, doc)).rejects.toMatchObject({ reason: 'conflict' });
  });

  it('numbers a name already taken in the folder, and keeps the number later', async () => {
    const drive = fakeDrive();
    const c = client(drive);
    const doc = sampleDocument();
    await c.create('f', doc);
    const second = await c.create('f', doc);
    expect(second.name).toBe('온라인 상점 · 시스템 구성도 (2).structlet');
    const again = await c.save(second, { ...doc, nodes: doc.nodes.slice(1) });
    expect(again.name).toBe(second.name);
    expect(freeName('a.structlet', new Set(['a.structlet', 'a (2).structlet']))).toBe('a (3).structlet');
    expect(isNameFor('a (4).structlet', 'a.structlet')).toBe(true);
  });

  it('finds the file of a creation whose answer was lost instead of making a second one', async () => {
    const drive = fakeDrive();
    const c = client(drive);
    drive.faults.loseNextCreate = true;
    const file = await c.create('f', sampleDocument());
    expect(file.id).toBe('gen-1');
    expect(drive.files.size).toBe(1);
  });

  it('maps refusals to sync failures and reports refused tokens', async () => {
    const drive = fakeDrive();
    const refused: string[] = [];
    const c = client(drive, 'tok', refused);
    const file = await c.create('f', sampleDocument());
    const failure = async (status: number, reason = '') => {
      drive.faults.status = status;
      drive.faults.reason = reason;
      return c.version(file.id).catch((e: RemoteError) => e.reason);
    };
    expect(await failure(401)).toBe('auth');
    expect(refused).toEqual(['tok']);
    expect(await failure(403, 'userRateLimitExceeded')).toBe('network');
    expect(await failure(403, 'storageQuotaExceeded')).toBe('full');
    expect(await failure(403, 'forbidden')).toBe('permission');
    expect(await failure(404)).toBe('missing');
    drive.files.get(file.id)!.content = '{"format":"other"}';
    await expect(c.open(file.id)).rejects.toMatchObject({ reason: 'unreadable' });
    await expect(client(drive, null).open(file.id)).rejects.toMatchObject({ reason: 'auth' });
  });

  it('asks for the account once per token', async () => {
    const drive = fakeDrive();
    const c = client(drive);
    expect(await c.account()).toEqual({ id: 'p1', email: 'me@example.com' });
    await c.account();
    expect(drive.calls.filter((x) => x.includes('/about'))).toHaveLength(1);
  });

  it('sends exactly the structlet file format', async () => {
    const drive = fakeDrive();
    const doc = sampleDocument();
    await client(drive).create('f', doc);
    expect(drive.files.get('gen-1')!.content).toBe(serializeStructlet(doc));
  });
});
