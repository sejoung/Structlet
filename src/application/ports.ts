import type { Document } from '../domain';

/** Browser autosave. Implemented by an adapter. */
export interface DocumentStore {
  load(): Document | null;
  save(doc: Document): void;
  clear(): void;
}
