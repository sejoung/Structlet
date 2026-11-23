import { allIds, applyPatch, composePatches, invertPatch, isEmptyPatch, type Document, type Id, type Patch } from '../domain';


interface HistoryEntry {
  readonly patch: Patch;
  readonly selectionBefore: readonly Id[];
  readonly selectionAfter: readonly Id[];
  readonly coalesceKey: string | null;
  readonly at: number;
}

export interface SessionSnapshot {
  readonly document: Document;
  readonly committed: Document;
  readonly selection: readonly Id[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly revision: number;
  readonly dirty: boolean;
}

export interface ExecuteOptions {
  readonly select?: readonly Id[];
  readonly coalesceKey?: string;
}

export interface SessionOptions {
  readonly historyLimit?: number;
  readonly coalesceMs?: number;
  readonly now?: () => number;
}

export class EditorSession {
  private committed: Document;
  private previewPatch: Patch | null = null;
  private selection: readonly Id[] = [];
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private revision = 0;
  private dirty = false;
  private snapshot: SessionSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly historyLimit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(doc: Document, options: SessionOptions = {}) {
    this.committed = doc;
    this.historyLimit = options.historyLimit ?? 200;
    this.coalesceMs = options.coalesceMs ?? 1200;
    this.now = options.now ?? (() => Date.now());
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  get document(): Document {
    return this.snapshot.document;
  }

  get committedDocument(): Document {
    return this.committed;
  }

  get selected(): readonly Id[] {
    return this.selection;
  }

  preview(patch: Patch | null): void {
    this.previewPatch = patch && !isEmptyPatch(patch) ? patch : null;
    this.emit();
  }

  execute(patch: Patch, options: ExecuteOptions = {}): void {
    this.previewPatch = null;
    const selectionAfter = options.select ?? this.selection;
    if (isEmptyPatch(patch)) {
      this.selection = selectionAfter;
      this.emit();
      return;
    }
    const at = this.now();
    const last = this.undoStack[this.undoStack.length - 1];
    const key = options.coalesceKey ?? null;
    if (last && key !== null && last.coalesceKey === key && at - last.at <= this.coalesceMs) {
      this.undoStack[this.undoStack.length - 1] = { ...last, patch: composePatches(last.patch, patch), selectionAfter, at };
    } else {
      this.undoStack.push({ patch, selectionBefore: this.selection, selectionAfter, coalesceKey: key, at });
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    }
    this.redoStack = [];
    this.committed = applyPatch(this.committed, patch);
    this.selection = selectionAfter;
    this.changed();
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.previewPatch = null;
    this.committed = applyPatch(this.committed, invertPatch(entry.patch));
    this.redoStack.push(entry);
    this.selection = this.existing(entry.selectionBefore);
    this.changed();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.previewPatch = null;
    this.committed = applyPatch(this.committed, entry.patch);
    this.undoStack.push(entry);
    this.selection = this.existing(entry.selectionAfter);
    this.changed();
    return true;
  }

  breakCoalescing(): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last) this.undoStack[this.undoStack.length - 1] = { ...last, coalesceKey: null };
  }

  select(ids: readonly Id[]): void {
    const next = this.existing(ids);
    if (next.length === this.selection.length && next.every((id, i) => id === this.selection[i])) return;
    this.selection = next;
    this.emit();
  }

  applyExternal(patch: Patch): void {
    if (isEmptyPatch(patch)) return;
    this.previewPatch = null;
    this.committed = applyPatch(this.committed, patch);
    this.selection = this.existing(this.selection);
    this.changed();
  }

  replaceDocument(doc: Document, options: { dirty?: boolean } = {}): void {
    this.committed = doc;
    this.previewPatch = null;
    this.selection = [];
    this.undoStack = [];
    this.redoStack = [];
    this.revision++;
    this.dirty = options.dirty ?? false;
    this.emit();
  }

  markSaved(revision: number): void {
    if (revision === this.revision && this.dirty) {
      this.dirty = false;
      this.emit();
    }
  }

  private existing(ids: readonly Id[]): Id[] {
    const all = allIds(this.committed);
    return ids.filter((id) => all.has(id));
  }

  private changed(): void {
    this.revision++;
    this.dirty = true;
    this.emit();
  }

  private buildSnapshot(): SessionSnapshot {
    return {
      document: this.previewPatch ? applyPatch(this.committed, this.previewPatch) : this.committed,
      committed: this.committed,
      selection: this.selection,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      revision: this.revision,
      dirty: this.dirty,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }
}
