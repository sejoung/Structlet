import type { RemoteAccount, RemoteFile, RemoteLink, RemoteLinks } from '../../domain';
import { log } from '../diagnostics/log';
import { parseStructlet, serializeStructlet } from '../format/structlet-format';
import { readItem, removeItem, writeItem } from '../storage/web-storage';
import type { DriveItem } from './types';

export const DRIVE_FILE_KEY = 'structlet.drive.file';
export const DRIVE_BASE_KEY = 'structlet.drive.base';
export const DRIVE_FOLDER_KEY = 'structlet.drive.folder';

const isFile = (value: unknown): value is RemoteFile => {
  const f = value as Partial<RemoteFile> | null;
  return typeof f?.id === 'string' && typeof f.name === 'string' && typeof f.version === 'string' && Boolean(f.id && f.version);
};

export class LocalDriveLinks implements RemoteLinks {
  read(): RemoteLink | null {
    const file = readItem(DRIVE_FILE_KEY);
    const base = readItem(DRIVE_BASE_KEY);
    if (file === null || base === null) return null;
    try {
      const parsed: unknown = JSON.parse(file);
      if (!isFile(parsed)) throw new Error('Malformed Drive file record.');
      const doc = parseStructlet(base);
      if (!doc.ok) throw new Error('Unreadable base diagram.');
      const { account } = parsed as { account?: Partial<RemoteAccount> };
      return {
        file: { id: parsed.id, name: parsed.name, version: parsed.version },
        base: doc.document,
        ...(typeof account?.id === 'string' && typeof account.email === 'string' ? { account: { id: account.id, email: account.email } } : {}),
      };
    } catch (error) {
      log.warn('drive.link-unreadable', { message: (error as Error).message });
      return null;
    }
  }

  write(link: RemoteLink | null): void {
    if (link) {
      const { id, name, version } = link.file;
      if (writeItem(DRIVE_BASE_KEY, serializeStructlet(link.base)) && writeItem(DRIVE_FILE_KEY, JSON.stringify({ id, name, version, account: link.account }))) return;
      log.warn('drive.link-not-kept');
    }
    removeItem(DRIVE_FILE_KEY);
    removeItem(DRIVE_BASE_KEY);
  }
}

export interface SavedFolder extends DriveItem {
  readonly account?: string;
}

export class LocalDriveFolder {
  read(): SavedFolder | null {
    try {
      const p = JSON.parse(readItem(DRIVE_FOLDER_KEY) ?? 'null') as Partial<SavedFolder> | null;
      if (typeof p?.id !== 'string' || !p.id || typeof p.name !== 'string') return null;
      return { id: p.id, name: p.name, ...(typeof p.account === 'string' ? { account: p.account } : {}) };
    } catch {
      return null;
    }
  }

  write(folder: SavedFolder | null): void {
    if (!folder) return removeItem(DRIVE_FOLDER_KEY);
    writeItem(DRIVE_FOLDER_KEY, JSON.stringify({ id: folder.id, name: folder.name, account: folder.account }));
  }
}
