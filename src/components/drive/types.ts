import type { SyncState } from '../../application';
import type { MergeSide } from '../../domain';

export interface DriveView {
  readonly state: SyncState;
  readonly connected: boolean;
  readonly expiring: boolean;
  readonly busy: boolean;
  readonly account?: string;
  readonly folder?: string;
}

export interface DriveActions {
  prepare(): void;
  connect(): void;
  open(): void;
  saveToFolder(): void;
  saveCopy(): void;
  saveNow(): void;
  stop(): void;
  disconnect(forget: boolean): void;
  resolve(choices: Readonly<Record<string, MergeSide>>): void;
  renew(): void;
}
