import {
  addAnnotation,
  addContainer,
  addEdge,
  addNode,
  CommandError,
  CONTAINER_PRESETS,
  DEFAULT_EDGE_STYLE,
  deleteObjects,
  diffDocuments,
  NODE_SIZES,
  pasteFragment,
  sequence,
  duplicate,
  findCollection,
  getBox,
  moveBy,
  moveEach,
  moveInto,
  NODE_SIZE,
  setBounds,
  setParent,
  setTitle,
  updateObject,
  wrapInContainer,
  type AnnotationKind,
  type Collection,
  type CollectionItem,
  type ContainerKind,
  type Document,
  type Endpoint,
  type Fragment,
  type NodeVariant,
  type Id,
  type Patch,
  type Point,
  type Rect,
} from '../domain';
import type { EditorSession, ExecuteOptions } from './session';

export type IdKind = 'node' | 'container' | 'edge' | 'annotation' | 'document';
export type IdGenerator = (kind: IdKind) => Id;

export type EditResult = { ok: true } | { ok: false; error: string };

/**
 * Editing use cases on top of a session. Each method is one undo step.
 * Geometry decisions (drop targets, alignment) are made by the caller.
 */
export class Editor {
  constructor(
    readonly session: EditorSession,
    private readonly newId: IdGenerator,
  ) {}

  private get doc(): Document {
    return this.session.committedDocument;
  }

  private run(build: (doc: Document) => Patch, options: ExecuteOptions = {}): EditResult {
    try {
      this.session.execute(build(this.doc), options);
      return { ok: true };
    } catch (error) {
      if (error instanceof CommandError) return { ok: false, error: error.message };
      throw error;
    }
  }

  addService(serviceId: string, label: string, center: Point, parentId: Id | null): Id {
    const id = this.newId('node');
    const at = { x: Math.round(center.x - NODE_SIZE / 2), y: Math.round(center.y - NODE_SIZE / 2) };
    this.run((d) => addNode(d, { id, serviceId, label, parentId, at, width: NODE_SIZE, height: NODE_SIZE }), { select: [id] });
    return id;
  }

  addArea(kind: ContainerKind, label: string, rect: Rect, parentId: Id | null): Id {
    const id = this.newId('container');
    this.run((d) => addContainer(d, { id, kind, label, parentId, rect, width: rect.width, height: rect.height, style: CONTAINER_PRESETS[kind] }), { select: [id] });
    return id;
  }

  /** Wraps the selected boxes in a new area. Returns null when nothing is selected. */
  wrapInArea(ids: readonly Id[], kind: ContainerKind, label: string): Id | null {
    const id = this.newId('container');
    const result = this.run((d) => wrapInContainer(d, ids, { id, kind, label, width: 0, height: 0, style: CONTAINER_PRESETS[kind] }, 32), { select: [id] });
    return result.ok ? id : null;
  }

  connect(source: Endpoint, target: Endpoint, label = ''): Id | null {
    const id = this.newId('edge');
    const result = this.run(
      (d) => addEdge(d, { id, source, target, label, style: DEFAULT_EDGE_STYLE, routingMode: 'auto', waypoints: [] }),
      { select: [id] },
    );
    return result.ok ? id : null;
  }

  addAnnotation(kind: AnnotationKind, text: string, at: Point, targetId: Id | null = null): Id {
    const id = this.newId('annotation');
    this.run((d) => addAnnotation(d, { id, kind, text, x: Math.round(at.x), y: Math.round(at.y), targetId }), { select: [id] });
    return id;
  }

  /** Next free flow-step number in the document. */
  nextStepNumber(): number {
    const used = this.doc.annotations.filter((a) => a.kind === 'step').map((a) => Number.parseInt(a.text, 10)).filter(Number.isFinite);
    return used.length ? Math.max(...used) + 1 : 1;
  }

  move(ids: readonly Id[], delta: Point, parents: ReadonlyMap<Id, Id | null> = new Map()): EditResult {
    return this.run((d) => moveInto(d, ids, delta.x, delta.y, parents));
  }

  /** Keyboard nudges of the same selection merge into one undo step. */
  nudge(ids: readonly Id[], delta: Point): EditResult {
    return this.run((d) => moveBy(d, ids, delta.x, delta.y), { coalesceKey: `nudge:${ids.join(',')}` });
  }

  moveEach(deltas: ReadonlyMap<Id, Point>): EditResult {
    return this.run((d) => moveEach(d, deltas));
  }

  /** Patch for a move, for previews during a drag. */
  previewMove(ids: readonly Id[], delta: Point): void {
    try {
      this.session.preview(moveInto(this.doc, ids, delta.x, delta.y, new Map()));
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
    }
  }

  previewBounds(id: Id, rect: Rect): void {
    this.session.preview(setBounds(this.doc, id, rect));
  }

  previewUpdate<C extends Collection>(collection: C, id: Id, fields: Partial<Omit<CollectionItem[C], 'id' | 'parentId'>>): void {
    this.session.preview(updateObject(this.doc, collection, id, fields));
  }

  cancelPreview(): void {
    this.session.preview(null);
  }

  setBounds(id: Id, rect: Rect): EditResult {
    return this.run((d) => setBounds(d, id, rect));
  }

  setParent(ids: readonly Id[], parentId: Id | null): EditResult {
    return this.run((d) => setParent(d, ids, parentId));
  }

  update<C extends Collection>(collection: C, id: Id, fields: Partial<Omit<CollectionItem[C], 'id' | 'parentId'>>, coalesceKey?: string): EditResult {
    return this.run((d) => updateObject(d, collection, id, fields), coalesceKey ? { coalesceKey } : {});
  }

  rename(id: Id, text: string): EditResult {
    const collection = findCollection(this.doc, id);
    if (!collection) return { ok: false, error: `Unknown object ${id}` };
    const field = collection === 'annotations' ? { text } : { label: text };
    return this.update(collection, id, field as never, `rename:${id}`);
  }

  setTitle(title: string): EditResult {
    return this.run((d) => setTitle(d, title), { coalesceKey: 'title' });
  }

  delete(ids: readonly Id[]): EditResult {
    return this.run((d) => deleteObjects(d, ids), { select: [] });
  }

  duplicate(ids: readonly Id[], offset: Point = { x: 24, y: 24 }): Id[] {
    const { patch, created } = duplicate(this.doc, ids, (c) => this.newId(ID_KIND[c]), offset);
    this.session.execute(patch, { select: created });
    return created;
  }

  setLocked(ids: readonly Id[], locked: boolean): EditResult {
    return this.run((d) => {
      const patches: Patch[] = [];
      for (const id of ids) {
        const box = getBox(d, id);
        if (!box || box.locked === locked) continue;
        const collection = findCollection(d, id) as 'nodes' | 'containers';
        patches.push(updateObject(d, collection, id, { locked }));
      }
      return { changes: patches.flatMap((p) => p.changes) };
    });
  }

  /** Stores a manual route for an edge. An empty list returns it to automatic routing. */
  setRoute(edgeId: Id, waypoints: readonly Point[]): EditResult {
    const rounded = waypoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    return this.update('edges', edgeId, rounded.length ? { routingMode: 'manual', waypoints: rounded } : { routingMode: 'auto', waypoints: [] });
  }

  resetRoute(edgeId: Id): EditResult {
    return this.update('edges', edgeId, { routingMode: 'auto', waypoints: [] });
  }

  /** Applies a computed layout: moves, then grows areas, as one undo step. */
  applyLayout(moves: ReadonlyMap<Id, Point>, grow: ReadonlyMap<Id, Rect>): EditResult {
    return this.run((d) => sequence(d, (x) => moveEach(x, moves), ...[...grow].map(([id, rect]) => (x: Document) => setBounds(x, id, rect))));
  }

  /** Replaces the document with an imported version as one undo step; the document id is kept. */
  importDocument(next: Document, created: readonly Id[]): EditResult {
    return this.run((d) => diffDocuments(d, { ...next, id: d.id, formatVersion: d.formatVersion }), { select: created.filter((id) => findCollection(next, id) !== 'edges') });
  }

  paste(fragment: Fragment, offset: Point, parentId: Id | null): Id[] {
    const { patch, created } = pasteFragment(this.doc, fragment, (c) => this.newId(ID_KIND[c]), offset, parentId);
    this.session.execute(patch, { select: created });
    return created;
  }

  /** Switches a node between icon and box style, or picks a size preset. */
  setNodeStyle(id: Id, variant: NodeVariant, size: 's' | 'm' | 'l' = 'm'): EditResult {
    return this.update('nodes', id, { variant, ...NODE_SIZES[variant][size] });
  }

  undo(): boolean {
    return this.session.undo();
  }

  redo(): boolean {
    return this.session.redo();
  }
}

const ID_KIND: Record<Collection, IdKind> = { nodes: 'node', containers: 'container', edges: 'edge', annotations: 'annotation' };
