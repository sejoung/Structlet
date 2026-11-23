import type { DocumentStore } from '../../application';
import type { Document } from '../../domain';
import { parseStructlet, serializeStructlet } from '../format/structlet-format';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const AUTOSAVE_KEY = 'structlet:autosave:v1';

export class LocalDocumentStore implements DocumentStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = AUTOSAVE_KEY,
  ) {}

  load(): Document | null {
    let text: string | null = null;
    try {
      text = this.storage.getItem(this.key);
    } catch {
      return null;
    }
    if (!text) return null;
    const result = parseStructlet(text);
    return result.ok ? result.document : null;
  }

  save(doc: Document): void {
    try {
      this.storage.setItem(this.key, serializeStructlet(doc));
    } catch {
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
    }
  }
}
