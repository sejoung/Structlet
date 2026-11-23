import type { IconPack } from '../icon-packs/pack';

export class IconPackStore {
  private memory = new Map<string, IconPack>();
  private db: Promise<IDBDatabase | null>;

  constructor(factory: IDBFactory | undefined, name = 'structlet') {
    this.db = new Promise((resolve) => {
      if (!factory) return resolve(null);
      try {
        const req = factory.open(name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('icon-packs', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async persistent(): Promise<boolean> {
    return (await this.db) !== null;
  }

  async list(): Promise<IconPack[]> {
    const db = await this.db;
    if (!db) return [...this.memory.values()];
    return new Promise((resolve) => {
      const req = db.transaction('icon-packs').objectStore('icon-packs').getAll();
      req.onsuccess = () => resolve((req.result as IconPack[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      req.onerror = () => resolve([...this.memory.values()]);
    });
  }

  async put(pack: IconPack): Promise<void> {
    this.memory.set(pack.id, pack);
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('icon-packs', 'readwrite');
      tx.objectStore('icon-packs').put(pack);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the icon pack'));
    });
  }

  async remove(id: string): Promise<void> {
    this.memory.delete(id);
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction('icon-packs', 'readwrite');
      tx.objectStore('icon-packs').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}
