import type { Collection, CollectionItem, Document, Id } from './model';

export type ObjectChange = {
  [C in Collection]: {
    readonly collection: C;
    readonly id: Id;
    readonly before: CollectionItem[C] | null;
    readonly after: CollectionItem[C] | null;
    readonly index?: number;
  };
}[Collection];

export interface TitleChange {
  readonly collection: 'title';
  readonly before: string;
  readonly after: string;
}

export type Change = ObjectChange | TitleChange;

export interface Patch {
  readonly changes: readonly Change[];
}

export const EMPTY_PATCH: Patch = { changes: [] };

export function isEmptyPatch(patch: Patch): boolean {
  return patch.changes.length === 0;
}

export function applyPatch(doc: Document, patch: Patch): Document {
  if (patch.changes.length === 0) return doc;
  const lists: { [C in Collection]: CollectionItem[C][] } = {
    nodes: [...doc.nodes],
    containers: [...doc.containers],
    edges: [...doc.edges],
    annotations: [...doc.annotations],
  };
  let title = doc.title;
  for (const change of patch.changes) {
    if (change.collection === 'title') {
      title = change.after;
      continue;
    }
    const list = lists[change.collection] as { id: Id }[];
    const at = list.findIndex((o) => o.id === change.id);
    if (change.after === null) {
      if (at >= 0) list.splice(at, 1);
    } else if (at >= 0) {
      list[at] = change.after;
    } else {
      const index = change.index ?? list.length;
      list.splice(Math.min(Math.max(index, 0), list.length), 0, change.after);
    }
  }
  return { ...doc, title, ...lists };
}

export function invertPatch(patch: Patch): Patch {
  return {
    changes: [...patch.changes].reverse().map((c): Change => {
      if (c.collection === 'title') return { collection: 'title', before: c.after, after: c.before };
      return { ...c, before: c.after, after: c.before } as ObjectChange;
    }),
  };
}

export function composePatches(...patches: Patch[]): Patch {
  const changes: Change[] = [];
  const position = new Map<string, number>();
  for (const patch of patches) {
    for (const change of patch.changes) {
      const key = change.collection === 'title' ? 'title' : `${change.collection}:${change.id}`;
      const at = position.get(key);
      if (at === undefined) {
        position.set(key, changes.length);
        changes.push(change);
        continue;
      }
      const first = changes[at]!;
      changes[at] = { ...first, after: change.after } as Change;
    }
  }
  return { changes: changes.filter((c) => c.before !== c.after) };
}
