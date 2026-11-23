import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveSync, EditorSession, Editor, MAX_SYNC_WAIT, SYNC_DELAY } from '../../../src/application';
import { RemoteError, type Document, type RemoteDocuments, type RemoteFailure, type RemoteFile, type RemoteLink, type RemoteLinks } from '../../../src/domain';
import { counterIds, sampleDocument } from '../fixtures';

class FakeRemote implements RemoteDocuments {
  files = new Map<string, { document: Document; version: number; name: string }>();
  fail: RemoteFailure | null = null;
  accountId = 'me';
  saves = 0;
  private next = 0;
  private check() {
    if (this.fail) {
      const reason = this.fail;
      this.fail = null;
      throw new RemoteError(reason);
    }
  }
  private meta(id: string): RemoteFile {
    const f = this.files.get(id)!;
    return { id, name: f.name, version: String(f.version) };
  }
  async open(id: string) {
    this.check();
    const f = this.files.get(id);
    if (!f) throw new RemoteError('missing');
    return { file: this.meta(id), document: f.document };
  }
  async version(id: string) {
    this.check();
    return String(this.files.get(id)!.version);
  }
  async save(file: RemoteFile, document: Document) {
    this.check();
    const f = this.files.get(file.id)!;
    if (String(f.version) !== file.version) throw new RemoteError('conflict');
    f.document = document;
    f.version++;
    this.saves++;
    return this.meta(file.id);
  }
  async create(_folder: string, document: Document) {
    this.check();
    const id = `f${++this.next}`;
    this.files.set(id, { document, version: 1, name: `${document.title}.structlet` });
    return this.meta(id);
  }
  async account() {
    return { id: this.accountId, email: `${this.accountId}@example.com` };
  }
  edit(id: string, fn: (d: Document) => Document) {
    const f = this.files.get(id)!;
    f.document = fn(f.document);
    f.version++;
  }
}

class MemoryLinks implements RemoteLinks {
  link: RemoteLink | null = null;
  read = () => this.link;
  write = (l: RemoteLink | null) => void (this.link = l);
}

function setup() {
  const session = new EditorSession(sampleDocument());
  const editor = new Editor(session, counterIds());
  const remote = new FakeRemote();
  const links = new MemoryLinks();
  const sync = new DriveSync(session, remote, links);
  return { session, editor, remote, links, sync };
}
const label = (d: Document, id: string) => d.nodes.find((n) => n.id === id)!.label;
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DriveSync', () => {
  it('creates a file, then saves edits after a quiet moment', async () => {
    const { editor, remote, sync, links } = setup();
    const file = await sync.create('folder');
    expect(sync.current.status).toBe('synced');
    expect(links.link?.account?.id).toBe('me');
    editor.rename('api', 'Orders API');
    expect(sync.current.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY - 10);
    expect(remote.saves).toBe(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(sync.current.status).toBe('synced');
    expect(label(remote.files.get(file.id)!.document, 'api')).toBe('Orders API');
  });

  it('still saves at least every MAX_SYNC_WAIT while editing continues', async () => {
    const { editor, remote, sync } = setup();
    await sync.create('folder');
    for (let t = 0; t < MAX_SYNC_WAIT + 1000; t += 1000) {
      editor.update('nodes', 'api', { label: `v${t}` });
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(remote.saves).toBeGreaterThan(0);
  });

  it('flushes a pending edit and waits for the queued save requested during upload', async () => {
    const { editor, remote, sync } = setup();
    const file = await sync.create('folder');
    const realSave = remote.save.bind(remote);
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const save = vi.spyOn(remote, 'save')
      .mockImplementationOnce(async (...args) => { await first; return realSave(...args); })
      .mockImplementationOnce(async (...args) => { await second; return realSave(...args); });
    editor.rename('api', 'First edit');
    const background = sync.flushPending();
    expect(save).toHaveBeenCalledTimes(1);
    editor.rename('api', 'Latest edit');
    let completed = false;
    const manual = sync.saveNow().then(() => { completed = true; });
    releaseFirst();
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(completed).toBe(false);
    releaseSecond();
    await Promise.all([background, manual]);
    expect(sync.current.status).toBe('synced');
    expect(label(remote.files.get(file.id)!.document, 'api')).toBe('Latest edit');
  });

  it('retries account verification before uploading after a failed reconnect', async () => {
    const { editor, remote, sync } = setup();
    await sync.create('folder');
    sync.pause();
    editor.rename('api', 'Edited offline');
    vi.spyOn(remote, 'account').mockRejectedValueOnce(new RemoteError('network'));
    await sync.resume();
    expect(sync.current).toMatchObject({ status: 'failed', reason: 'network' });
    remote.accountId = 'other';
    await sync.flushPending();
    expect(sync.current).toMatchObject({ status: 'failed', reason: 'account' });
    expect(remote.saves).toBe(0);
    remote.accountId = 'me';
    await sync.resume();
    expect(sync.current.status).toBe('synced');
    expect(remote.saves).toBe(1);
  });

  it('merges another device’s changes without adding them to undo', async () => {
    const { editor, session, remote, sync } = setup();
    const file = await sync.create('folder');
    remote.edit(file.id, (d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === 'db' ? { ...n, label: 'Remote DB' } : n)) }));
    editor.rename('api', 'Local API');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(sync.current.status).toBe('synced');
    expect(label(session.committedDocument, 'db')).toBe('Remote DB');
    const saved = remote.files.get(file.id)!.document;
    expect([label(saved, 'api'), label(saved, 'db')]).toEqual(['Local API', 'Remote DB']);
    session.breakCoalescing();
    session.undo();
    expect(label(session.committedDocument, 'db')).toBe('Remote DB');
  });

  it('waits for the user on a real conflict and applies the chosen side', async () => {
    const { editor, session, remote, sync } = setup();
    const file = await sync.create('folder');
    remote.edit(file.id, (d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === 'api' ? { ...n, label: 'Theirs' } : n)) }));
    editor.rename('api', 'Mine');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(sync.current.status).toBe('conflict');
    if (sync.current.status !== 'conflict') return;
    expect(sync.current.conflicts.map((c) => c.key)).toEqual(['nodes:api:label']);
    editor.rename('db', 'Local DB');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(sync.current.status).toBe('conflict');
    await sync.resolve({ 'nodes:api:label': 'remote' });
    await flush();
    expect(sync.current.status).toBe('synced');
    expect(label(session.committedDocument, 'api')).toBe('Theirs');
    expect(label(remote.files.get(file.id)!.document, 'db')).toBe('Local DB');
  });

  it('retries network failures and pauses when access ends', async () => {
    const { editor, remote, sync } = setup();
    await sync.create('folder');
    remote.fail = 'network';
    editor.rename('api', 'A');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(sync.current).toMatchObject({ status: 'failed', reason: 'network' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sync.current.status).toBe('synced');

    remote.fail = 'auth';
    editor.rename('api', 'B');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(sync.current.status).toBe('paused');
    editor.rename('api', 'C');
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(remote.saves).toBe(1);
    await sync.resume();
    await flush();
    expect(sync.current.status).toBe('synced');
    expect(remote.saves).toBe(2);
  });

  it('never writes a file of another account', async () => {
    const { editor, remote, sync } = setup();
    await sync.create('folder');
    remote.accountId = 'someone-else';
    editor.rename('api', 'X');
    await sync.reconnected();
    await flush();
    expect(sync.current).toMatchObject({ status: 'failed', reason: 'account', detail: 'me@example.com' });
    expect(remote.saves).toBe(0);
  });

  it('opens a file without writing it back, and settles before switching', async () => {
    const { editor, session, remote, sync } = setup();
    const file = await sync.create('folder');
    const opened = await sync.open(file.id);
    sync.linkOpened(opened);
    session.replaceDocument(opened.document);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY + 10);
    expect(remote.saves).toBe(0);
    editor.rename('api', 'Before switch');
    const settled = sync.settle();
    await vi.runAllTimersAsync();
    expect(await settled).toBe(true);
    expect(label(remote.files.get(file.id)!.document, 'api')).toBe('Before switch');
    sync.unlink();
    expect(sync.current.status).toBe('unlinked');
  });
});
