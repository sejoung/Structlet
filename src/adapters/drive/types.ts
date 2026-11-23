export interface DriveItem {
  readonly id: string;
  readonly name: string;
}

export type PickKind = 'file' | 'folder';

export interface PickOptions {
  readonly language: string;
  readonly title: string;
}

export type AuthEvent = 'connected' | 'expiring' | 'expired' | 'disconnected' | 'forgotten';

export interface DriveAuth {
  getToken(): string | null;
  expiring(): boolean;
  subscribe(listener: (event: AuthEvent) => void): () => void;
  clearToken(token: string): void;
  prepare(): Promise<void>;
  ready(): boolean;
  connect(hint?: string): Promise<void>;
  pick(kind: PickKind, options: PickOptions): Promise<DriveItem | null>;
  disconnect(forget?: boolean): Promise<void>;
}

export type AuthFailure = 'unavailable' | 'cancelled' | 'revoke';

export class DriveAuthError extends Error {
  constructor(
    readonly reason: AuthFailure,
    message: string = reason,
  ) {
    super(message);
    this.name = 'DriveAuthError';
  }
}
