import { readItem, removeItem, writeItem } from '../storage/web-storage';

export const DRIVE_CREATING_KEY = 'structlet.drive.creating';

export interface PendingCreation {
  folderId: string;
  id: string;
  at: number;
}

export interface CreationRecord {
  read(): PendingCreation | null;
  write(creation: PendingCreation | null): void;
}

const isCreation = (value: unknown): value is PendingCreation => {
  const creation = value as Partial<PendingCreation> | null;
  return (
    typeof creation?.folderId === 'string' &&
    typeof creation.id === 'string' &&
    typeof creation.at === 'number' &&
    Boolean(creation.folderId && creation.id)
  );
};

export function memoryCreations(): CreationRecord {
  let creation: PendingCreation | null = null;
  return {
    read: () => creation,
    write: (next) => void (creation = next),
  };
}

export class LocalCreations implements CreationRecord {
  private readonly key: string;

  constructor(key = DRIVE_CREATING_KEY) {
    this.key = key;
  }

  read(): PendingCreation | null {
    const stored = readItem(this.key);
    if (stored === null) return null;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!isCreation(parsed)) return null;
      const { folderId, id, at } = parsed;
      return { folderId, id, at };
    } catch {
      return null;
    }
  }

  write(creation: PendingCreation | null): void {
    if (creation) writeItem(this.key, JSON.stringify(creation));
    else removeItem(this.key);
  }
}
