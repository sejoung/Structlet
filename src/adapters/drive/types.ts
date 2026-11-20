/** A Drive file or folder as the user picked it. */
export interface DriveItem {
  readonly id: string;
  readonly name: string;
}

export type PickKind = 'file' | 'folder';

export interface PickOptions {
  /** Picker interface language, such as `en`. */
  readonly language: string;
  /** Already translated: adapters hold no interface text. */
  readonly title: string;
}

/** A token arrived (here or from another tab), it nears its end, it ran out, or the user disconnected. */
export type AuthEvent = 'connected' | 'expiring' | 'expired' | 'disconnected' | 'forgotten';

/** Google sign-in and the Drive Picker; `GoogleConnection` implements them. */
export interface DriveAuth {
  getToken(): string | null;
  expiring(): boolean;
  subscribe(listener: (event: AuthEvent) => void): () => void;
  /** Forget `token` after Drive refused it, here and in other tabs; a newer one stays. */
  clearToken(token: string): void;
  /** Load Google's scripts ahead, because the sign-in popup needs a fresh user gesture. */
  prepare(): Promise<void>;
  ready(): boolean;
  /** Ask for access, or renew it, in Google's popup; call it straight from a click. */
  connect(hint?: string): Promise<void>;
  pick(kind: PickKind, options: PickOptions): Promise<DriveItem | null>;
  /** Forget the token and withdraw consent in every tab; `forget` also drops remembered files. */
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
