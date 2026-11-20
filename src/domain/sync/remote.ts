import type { Document } from '../model';

/** A diagram file kept elsewhere (Google Drive today), as this editor last saw it. */
export interface RemoteFile {
  readonly id: string;
  readonly name: string;
  /** Changes whenever the file does; a save checks it to notice edits made elsewhere. */
  readonly version: string;
}

/** The account a remote file belongs to; files of another account are not written. */
export interface RemoteAccount {
  readonly id: string;
  /** Shown to the user to say which account a diagram's file is in. */
  readonly email: string;
}

/** Why a remote operation failed, in the terms the sync rules act on. */
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

/** Diagram files in remote storage. The adapter owns the file format and the file names. */
export interface RemoteDocuments {
  open(id: string): Promise<{ file: RemoteFile; document: Document }>;
  /** The file's current version, read without downloading it. */
  version(id: string): Promise<string>;
  /** Write `document` over `file`; fails with `conflict` if it changed since `file.version`. */
  save(file: RemoteFile, document: Document): Promise<RemoteFile>;
  create(folderId: string, document: Document): Promise<RemoteFile>;
  /** The account the current access is for. */
  account?(): Promise<RemoteAccount>;
  /** The file a creation made whose answer never reached this page, or null. */
  unconfirmed?(): Promise<{ file: RemoteFile; document: Document } | null>;
  /** Stop looking for an unconfirmed creation: it was linked, or the diagram moved on. */
  forgetUnconfirmed?(): void;
}

/** The linked file, remembered across reloads with the diagram as last synced. */
export interface RemoteLink {
  readonly file: RemoteFile;
  /** The diagram as last saved to or read from the file: the base of a three-way merge. */
  readonly base: Document;
  /** The account the file is in, when known. */
  readonly account?: RemoteAccount;
}

export interface RemoteLinks {
  read(): RemoteLink | null;
  write(link: RemoteLink | null): void;
}
