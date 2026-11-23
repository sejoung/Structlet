import type { Document } from '../domain';

export interface DocumentStore {
  load(): Document | null;
  save(doc: Document): void;
  clear(): void;
}
