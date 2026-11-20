import type { Collection, CollectionItem, Document, Id } from './model';
import type { Change, ObjectChange, Patch } from './patch';

const COLLECTIONS: Collection[] = ['containers', 'nodes', 'edges', 'annotations'];

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Patch that turns `before` into `after`, so whole-document edits (imports) are one undo step. */
export function diffDocuments(before: Document, after: Document): Patch {
  const changes: Change[] = [];
  if (before.title !== after.title) changes.push({ collection: 'title', before: before.title, after: after.title });
  for (const collection of COLLECTIONS) {
    const oldList = before[collection] as readonly CollectionItem[Collection][];
    const newList = after[collection] as readonly CollectionItem[Collection][];
    const oldById = new Map<Id, { item: CollectionItem[Collection]; index: number }>(oldList.map((item, index) => [item.id, { item, index }]));
    const newIds = new Set(newList.map((o) => o.id));
    // Removals from the highest index down keep every recorded index valid, forward and inverted.
    for (const { item, index } of [...oldById.values()].reverse()) {
      if (!newIds.has(item.id)) changes.push({ collection, id: item.id, before: item, after: null, index } as ObjectChange);
    }
    newList.forEach((item, index) => {
      const old = oldById.get(item.id);
      if (!old) changes.push({ collection, id: item.id, before: null, after: item, index } as ObjectChange);
      else if (!same(old.item, item)) changes.push({ collection, id: item.id, before: old.item, after: item } as ObjectChange);
    });
  }
  return { changes };
}
