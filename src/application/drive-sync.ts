import {
  diffDocuments,
  mergeDocuments,
  RemoteError,
  same,
  type Document,
  type MergeSide,
  type RemoteAccount,
  type RemoteDocuments,
  type RemoteFile,
  type RemoteLink,
  type RemoteLinks,
} from '../domain';
import type { EditorSession } from './session';
import { MAX_SYNC_WAIT, RETRY_DELAYS, ROUNDS, SYNC_DELAY, type SyncFailure, type SyncState, type SyncStatus } from './sync-state';

export type Opened = Awaited<ReturnType<RemoteDocuments['open']>> & { account?: RemoteAccount };

export class DriveSync {
  private link: RemoteLink | null;
  private state: SyncState;
  private readonly watchers = new Set<(state: SyncState) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPending: number | null = null;
  private running: Promise<void> | null = null;
  private rerun = false;
  private pullWanted = false;
  private retries = 0;
  private generation = 0;
  private recheck = false;
  private applying = false;
  private seen: Document;
  private theirs: Opened | null = null;

  constructor(
    private readonly session: EditorSession,
    private readonly remote: RemoteDocuments,
    private readonly links: RemoteLinks,
    private readonly now: () => number = Date.now,
  ) {
    this.link = links.read();
    this.state = this.link ? { status: 'paused', file: this.link.file } : { status: 'unlinked' };
    this.seen = session.committedDocument;
    session.subscribe(() => {
      const doc = session.committedDocument;
      if (doc === this.seen) return;
      this.seen = doc;
      if (!this.applying) this.changed();
    });
  }

  get current(): SyncState {
    return this.state;
  }

  watch(listener: (state: SyncState) => void): () => void {
    this.watchers.add(listener);
    return () => this.watchers.delete(listener);
  }

  get linkedAccount(): RemoteAccount | undefined {
    return this.link?.account;
  }

  private load(): Document {
    return this.session.committedDocument;
  }

  async create(folderId: string): Promise<RemoteFile> {
    const generation = this.link ? this.generation : this.detach();
    const doc = this.load();
    const [file, account] = await Promise.all([this.remote.create(folderId, doc), this.account()]);
    if (generation === this.generation) {
      this.detach();
      this.remember({ file, base: doc, account });
      this.set('synced');
      if (!same(this.load(), doc)) this.changed();
    }
    return file;
  }

  async open(id: string): Promise<Opened> {
    const [opened, account] = await Promise.all([this.remote.open(id), this.account()]);
    return { ...opened, account };
  }

  account(): Promise<RemoteAccount | undefined> {
    return this.remote.account?.().catch(() => undefined) ?? Promise.resolve(undefined);
  }

  linkOpened(opened: Opened): void {
    this.detach();
    this.remote.forgetUnconfirmed?.();
    this.remember({ file: opened.file, base: opened.document, account: opened.account });
    this.set('synced');
  }

  unlink(): void {
    this.detach();
    this.remote.forgetUnconfirmed?.();
    this.link = null;
    this.links.write(null);
    this.set('unlinked');
  }

  async recover(): Promise<RemoteFile | null> {
    if (this.link || !this.remote.unconfirmed) return null;
    const generation = this.generation;
    const [found, account] = await Promise.all([this.remote.unconfirmed(), this.account()]);
    if (!found || generation !== this.generation || this.link) return null;
    this.remote.forgetUnconfirmed?.();
    this.remember({ file: found.file, base: found.document, account });
    this.set('synced');
    if (!same(this.load(), found.document)) this.changed();
    return found.file;
  }

  pause(): void {
    if (!this.link) return;
    this.cancelWait();
    this.set('paused');
  }

  saveNow(): Promise<void> {
    if (!this.link) return Promise.resolve();
    return this.otherAccount() || this.state.status === 'paused' ? this.resume() : this.run();
  }

  async resume(): Promise<void> {
    if (!this.link) return;
    const generation = this.generation;
    this.set('saving');
    if (!(await this.verify(this.activeFor(generation)))) return;
    this.pullWanted = true;
    return this.run();
  }

  reconnected(): Promise<void> {
    if (!this.link) return Promise.resolve();
    const { status } = this.state;
    if (status === 'paused' || this.otherAccount()) return this.resume();
    this.recheck = true;
    return ['synced', 'pending', 'saving'].includes(status) ? this.run() : Promise.resolve();
  }

  resolve(choices: Readonly<Record<string, MergeSide>>): Promise<void> {
    const theirs = this.theirs;
    if (this.state.status !== 'conflict' || !theirs || !this.link) return Promise.resolve();
    const merged = mergeDocuments(this.link.base, this.load(), theirs.document, (c) => choices[c.key]);
    this.theirs = null;
    this.adopt(theirs, merged.document);
    return this.run();
  }

  async settle(): Promise<boolean> {
    for (let round = 0; ; round++) {
      if (!this.link || same(this.load(), this.link.base)) return true;
      const { status } = this.state;
      const failed = status === 'failed' && (round > 0 || this.otherAccount());
      if (status === 'paused' || status === 'conflict' || failed || round === ROUNDS) return false;
      await this.run();
    }
  }

  private activeFor(generation: number): () => boolean {
    return () => generation === this.generation && this.link !== null && this.state.status !== 'paused';
  }

  private async verify(active: () => boolean): Promise<boolean> {
    this.recheck = false;
    const expected = this.link?.account;
    const current = await this.account();
    if (!active()) return false;
    if (expected && current && current.id !== expected.id) {
      this.cancelWait();
      this.set('failed', { reason: 'account', detail: expected.email });
      return false;
    }
    if (!expected && current) this.remember({ ...this.link!, account: current });
    return true;
  }

  private otherAccount(): boolean {
    return this.state.status === 'failed' && this.state.reason === 'account';
  }

  private changed(): void {
    if (!this.link) return;
    const { status } = this.state;
    if (status === 'paused' || status === 'conflict') return;
    if (status === 'failed' && this.state.reason !== 'network') return;
    if (status !== 'saving') this.set('pending');
    const now = this.now();
    this.firstPending ??= now;
    this.wait(Math.max(0, Math.min(SYNC_DELAY, this.firstPending + MAX_SYNC_WAIT - now)));
  }

  private wait(delay: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delay);
  }

  private cancelWait(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.firstPending = null;
  }

  private detach(): number {
    this.cancelWait();
    this.theirs = null;
    this.pullWanted = false;
    this.retries = 0;
    return ++this.generation;
  }

  private run(): Promise<void> {
    this.cancelWait();
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.sync().finally(() => {
      this.running = null;
      if (!this.rerun) return;
      this.rerun = false;
      void this.run();
    });
    return this.running;
  }

  private async sync(): Promise<void> {
    const generation = this.generation;
    const live = () => generation === this.generation && this.link !== null;
    const active = this.activeFor(generation);
    try {
      if (this.recheck && !(await this.verify(active))) return;
      if (this.pullWanted) {
        this.pullWanted = false;
        if (!(await this.pull(active, false))) return;
      }
      for (let round = 0; round < ROUNDS && active(); round++) {
        const doc = this.load();
        if (same(doc, this.link!.base)) return this.set('synced');
        this.set('saving');
        try {
          const file = await this.remote.save(this.link!.file, doc);
          if (!live()) return;
          this.remember({ file, base: doc, account: this.link!.account });
          this.retries = 0;
          if (!active()) return;
          if (same(this.load(), doc)) this.set('synced');
          else this.changed();
          return;
        } catch (error) {
          if (!(error instanceof RemoteError && error.reason === 'conflict')) throw error;
          if (!(await this.pull(active, true))) return;
        }
      }
      if (active()) throw new RemoteError('conflict', 'The file kept changing while saving.');
    } catch (error) {
      if (active()) this.fail(error);
    }
  }

  private async pull(live: () => boolean, changed: boolean): Promise<boolean> {
    const { file } = this.link!;
    if (!changed && (await this.remote.version(file.id)) === file.version) return live();
    const theirs = await this.remote.open(file.id);
    if (!live()) return false;
    const merged = mergeDocuments(this.link!.base, this.load(), theirs.document);
    if (merged.conflicts.length) {
      this.theirs = theirs;
      this.set('conflict', { conflicts: merged.conflicts });
      return false;
    }
    this.adopt(theirs, merged.document);
    return true;
  }

  private adopt(theirs: Opened, merged: Document): void {
    const current = this.load();
    const patch = diffDocuments(current, { ...merged, id: current.id, formatVersion: current.formatVersion });
    this.applying = true;
    try {
      this.session.applyExternal(patch);
    } finally {
      this.applying = false;
      this.seen = this.session.committedDocument;
    }
    this.remember({ file: theirs.file, base: theirs.document, account: this.link?.account });
  }

  private fail(error: unknown): void {
    const reason = error instanceof RemoteError ? error.reason : 'unknown';
    const detail = error instanceof Error ? error.message : String(error);
    if (reason === 'auth') return this.set('paused');
    this.set('failed', { reason: reason as SyncFailure, detail });
    if (reason === 'network' && this.retries < RETRY_DELAYS.length) this.wait(RETRY_DELAYS[this.retries++]!);
  }

  private remember(link: RemoteLink): void {
    this.link = link;
    this.links.write(link);
  }

  private set(status: SyncStatus, extra: object = {}): void {
    const next = (status === 'unlinked' || !this.link ? { status: 'unlinked' } : { status, file: this.link.file, ...extra }) as SyncState;
    if (same(next, this.state)) return;
    this.state = next;
    for (const w of this.watchers) w(next);
  }
}
