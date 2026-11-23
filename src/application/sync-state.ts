import type { Conflict, RemoteFailure, RemoteFile } from '../domain';

export const SYNC_DELAY = 2000;
export const MAX_SYNC_WAIT = 10_000;
export const RETRY_DELAYS = [5_000, 15_000, 60_000] as const;
export const ROUNDS = 3;

export type SyncFailure = Exclude<RemoteFailure, 'auth'> | 'unknown' | 'account';
export type SyncState =
  | { status: 'unlinked' }
  | { status: 'synced' | 'pending' | 'saving'; file: RemoteFile }
  | { status: 'paused'; file: RemoteFile }
  | { status: 'conflict'; file: RemoteFile; conflicts: Conflict[] }
  | { status: 'failed'; file: RemoteFile; reason: SyncFailure; detail: string };

export type SyncStatus = SyncState['status'];
