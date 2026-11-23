import type { Document } from '../model';

export interface RemoteFile {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export interface RemoteAccount {
  readonly id: string;
  readonly email: string;
}

export type RemoteFailure = 'auth' | 'conflict' | 'permission' | 'full' | 'missing' | 'network' | 'unreadable';

export class RemoteError extends Error {
  constructor(
    readonly reason: RemoteFailure,
    message: string = reason,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

export interface RemoteDocuments {
  open(id: string): Promise<{ file: RemoteFile; document: Document }>;
  version(id: string): Promise<string>;
  save(file: RemoteFile, document: Document): Promise<RemoteFile>;
  create(folderId: string, document: Document): Promise<RemoteFile>;
  account?(): Promise<RemoteAccount>;
  unconfirmed?(): Promise<{ file: RemoteFile; document: Document } | null>;
  forgetUnconfirmed?(): void;
}

export interface RemoteLink {
  readonly file: RemoteFile;
  readonly base: Document;
  readonly account?: RemoteAccount;
}

export interface RemoteLinks {
  read(): RemoteLink | null;
  write(link: RemoteLink | null): void;
}
