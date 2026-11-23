import type { Annotation, Collection, CollectionItem, Container, Document, Edge, Id, Node } from './model';

export interface DocumentIndex {
  readonly nodes: ReadonlyMap<Id, Node>;
  readonly containers: ReadonlyMap<Id, Container>;
  readonly edges: ReadonlyMap<Id, Edge>;
  readonly annotations: ReadonlyMap<Id, Annotation>;
  readonly children: ReadonlyMap<Id | null, readonly Id[]>;
}

const cache = new WeakMap<Document, DocumentIndex>();

export function indexDocument(doc: Document): DocumentIndex {
  const hit = cache.get(doc);
  if (hit) return hit;
  const children = new Map<Id | null, Id[]>();
  const push = (parent: Id | null, id: Id) => {
    const list = children.get(parent);
    if (list) list.push(id);
    else children.set(parent, [id]);
  };
  for (const c of doc.containers) push(c.parentId, c.id);
  for (const n of doc.nodes) push(n.parentId, n.id);
  const index: DocumentIndex = {
    nodes: new Map(doc.nodes.map((n) => [n.id, n])),
    containers: new Map(doc.containers.map((c) => [c.id, c])),
    edges: new Map(doc.edges.map((e) => [e.id, e])),
    annotations: new Map(doc.annotations.map((a) => [a.id, a])),
    children,
  };
  cache.set(doc, index);
  return index;
}

export function findCollection(doc: Document, id: Id): Collection | null {
  const index = indexDocument(doc);
  if (index.nodes.has(id)) return 'nodes';
  if (index.containers.has(id)) return 'containers';
  if (index.edges.has(id)) return 'edges';
  if (index.annotations.has(id)) return 'annotations';
  return null;
}

export function getItem<C extends Collection>(doc: Document, collection: C, id: Id): CollectionItem[C] | undefined {
  return indexDocument(doc)[collection].get(id) as CollectionItem[C] | undefined;
}

export function getBox(doc: Document, id: Id): Node | Container | undefined {
  const index = indexDocument(doc);
  return index.nodes.get(id) ?? index.containers.get(id);
}

export function allIds(doc: Document): Set<Id> {
  const ids = new Set<Id>();
  for (const list of [doc.nodes, doc.containers, doc.edges, doc.annotations]) for (const o of list) ids.add(o.id);
  return ids;
}
