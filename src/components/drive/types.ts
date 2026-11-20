import type { SyncState } from '../../application';
import type { MergeSide } from '../../domain';

/** What the Drive controls show; built by the app from the Drive services. */
export interface DriveView {
  readonly state: SyncState;
  readonly connected: boolean;
  /** Access ends soon; the next click renews it. */
  readonly expiring: boolean;
  /** A Drive action is running. */
  readonly busy: boolean;
  readonly account?: string;
  readonly folder?: string;
}

export interface DriveActions {
  /** Load Google's scripts ahead, so a click can open the sign-in popup at once. */
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
