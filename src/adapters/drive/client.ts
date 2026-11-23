import { RemoteError, type Document, type RemoteAccount, type RemoteDocuments, type RemoteFailure, type RemoteFile } from '../../domain';
import { log } from '../diagnostics/log';
import { freeName, isNameFor } from '../format/file-names';
import { FILE_EXTENSION, fileNameFor, MAX_FILE_BYTES as MAX_DIAGRAM_BYTES, MIME_TYPE, parseStructlet, serializeStructlet } from '../format/structlet-format';
import { memoryCreations, type CreationRecord } from './creations';
import { failureOf, multipart } from './http';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_ABOUT =
  'https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const REQUEST_TIMEOUT = 30_000;
export const MAX_FILE_BYTES = MAX_DIAGRAM_BYTES;
const FILE_FIELDS = 'id,name,version';
const LIST_PAGES = 10;
const quoted = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
export const CREATE_ATTEMPTS = 3;
export const CREATE_BACKOFF = 500;
const RETRY_CREATE: readonly RemoteFailure[] = ['network', 'conflict'];
export const LATE_UPLOAD = 10 * 60_000;

interface Sent {
  name: string;
  content: string;
}
interface Reservation {
  id: string;
  sent: Sent[];
}
interface Created {
  file: RemoteFile;
  parents: string[];
  content: string;
}

function read(content: string): Document {
  const result = parseStructlet(content);
  if (!result.ok) throw new RemoteError('unreadable', result.errors.slice(0, 2).join(' · '));
  return result.document;
}

export const driveFileName = (doc: Document): string => fileNameFor(doc.title, FILE_EXTENSION);

interface Reply<T> {
  data: T;
  etag: string | null;
}

export class DriveClient implements RemoteDocuments {
  private readonly reserved = new Map<string, Reservation>();
  private creating = 0;
  private readonly accounts = new Map<string, Promise<RemoteAccount>>();

  constructor(
    private readonly token: () => string | null,
    private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
    private readonly onRefused: (token: string) => void = () => {},
    private readonly creations: CreationRecord = memoryCreations(),
    private readonly now: () => number = Date.now,
  ) {}

  async open(id: string): Promise<{ file: RemoteFile; document: Document }> {
    const url = `${DRIVE_API}/${encodeURIComponent(id)}`;
    const { data: meta } = await this.request(
      `${url}?fields=${FILE_FIELDS},size`,
      (response) => response.json() as Promise<RemoteFile & { size?: string }>,
    );
    if (Number(meta.size) > MAX_FILE_BYTES)
      throw new RemoteError('unreadable', `The file is larger than ${MAX_FILE_BYTES} bytes.`);
    const { data: content } = await this.request(`${url}?alt=media`, (response) => response.text());
    return { file: { id: meta.id, name: meta.name, version: meta.version }, document: read(content) };
  }

  account(): Promise<RemoteAccount> {
    const token = this.token();
    if (!token) return Promise.reject(new RemoteError('auth', 'Not connected to Google Drive.'));
    let account = this.accounts.get(token);
    if (!account) {
      account = this.request(
        DRIVE_ABOUT,
        (response) =>
          response.json() as Promise<{ user?: { permissionId?: string; emailAddress?: string } }>,
      ).then(({ data }) => {
        const id = data.user?.permissionId;
        if (!id) throw new RemoteError('network', 'Drive did not say whose files these are.');
        return { id, email: data.user?.emailAddress ?? '' };
      });
      this.accounts.set(token, account);
      account.catch(() => this.accounts.delete(token));
    }
    return account;
  }

  async version(id: string): Promise<string> {
    return (await this.metadata(id)).data.version;
  }

  async save(file: RemoteFile, doc: Document): Promise<RemoteFile> {
    const current = await this.metadata(file.id, 'version,mimeType');
    if (current.data.version !== file.version)
      throw new RemoteError('conflict', 'The file changed in Drive.');
    const name = isNameFor(file.name, driveFileName(doc))
      ? file.name
      : await this.nameInParent(file.id, doc);
    const content = serializeStructlet(doc);
    const upload =
      name === file.name && current.data.mimeType === MIME_TYPE
        ? null
        : multipart({ name, mimeType: MIME_TYPE }, content, MIME_TYPE);
    const { data } = await this.request(
      `${DRIVE_UPLOAD}/${encodeURIComponent(file.id)}?uploadType=${upload ? 'multipart' : 'media'}&fields=${FILE_FIELDS}`,
      (response) => response.json() as Promise<RemoteFile>,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': upload?.type ?? MIME_TYPE,
          ...(current.etag ? { 'If-Match': current.etag } : {}),
        },
        body: upload?.body ?? content,
      },
    );
    return { id: data.id, name: data.name, version: data.version };
  }

  async create(folderId: string, doc: Document): Promise<RemoteFile> {
    const sent = { name: await this.nameIn(folderId, doc), content: serializeStructlet(doc) };
    this.creating++;
    try {
      const reservation = this.reserved.get(folderId) ?? { id: await this.reserveId(), sent: [] };
      this.reserved.set(folderId, reservation);
      reservation.sent.push(sent);
      this.creations.write({ folderId, id: reservation.id, at: this.now() });
      const file = await this.attempts(reservation, folderId, sent, doc);
      this.reserved.delete(folderId);
      this.creations.write(null);
      return file;
    } finally {
      this.creating--;
    }
  }

  async unconfirmed(): Promise<{ file: RemoteFile; document: Document } | null> {
    const pending = this.creations.read();
    if (!pending || this.creating) return null;
    const existing = await this.created(pending.id);
    if (!existing) {
      if (this.now() - pending.at > LATE_UPLOAD) this.forgetUnconfirmed();
      return null;
    }
    if (!existing.parents.includes(pending.folderId)) {
      this.forgetUnconfirmed();
      return null;
    }
    return { file: existing.file, document: read(existing.content) };
  }

  forgetUnconfirmed(): void {
    this.reserved.clear();
    this.creations.write(null);
  }

  private async attempts(
    reservation: Reservation,
    folderId: string,
    sent: Sent,
    doc: Document,
  ): Promise<RemoteFile> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.upload(reservation.id, folderId, sent);
      } catch (error) {
        if (!(error instanceof RemoteError && RETRY_CREATE.includes(error.reason))) throw error;
        const existing = await this.created(reservation.id);
        if (existing) return this.adopt(existing, reservation, folderId, doc);
        if (attempt + 1 >= CREATE_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, CREATE_BACKOFF * 2 ** attempt));
      }
    }
  }

  private async nameIn(folderId: string, doc: Document, except?: string): Promise<string> {
    const base = driveFileName(doc);
    try {
      const taken = new Set<string>();
      let page = '';
      for (let read = 0; read < LIST_PAGES; read++) {
        const q = `${quoted(folderId)} in parents and trashed = false`;
        const { data } = await this.request(
          `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=1000${page && `&pageToken=${encodeURIComponent(page)}`}`,
          (response) =>
            response.json() as Promise<{ files?: RemoteFile[]; nextPageToken?: string }>,
        );
        for (const file of data.files ?? []) if (file.id !== except) taken.add(file.name);
        if (!data.nextPageToken) break;
        page = data.nextPageToken;
      }
      return freeName(base, taken);
    } catch (error) {
      log.warn('drive.name-check-failed', { message: (error as Error).message });
      return base;
    }
  }

  private async nameInParent(id: string, doc: Document): Promise<string> {
    const parents = await this.request(
      `${DRIVE_API}/${encodeURIComponent(id)}?fields=parents`,
      (response) => response.json() as Promise<{ parents?: string[] }>,
    ).then(
      ({ data }) => data.parents ?? [],
      () => [],
    );
    return parents[0] ? this.nameIn(parents[0], doc, id) : driveFileName(doc);
  }

  private async reserveId(): Promise<string> {
    const { data } = await this.request(
      `${DRIVE_API}/generateIds?count=1&space=drive&type=files`,
      (response) => response.json() as Promise<{ ids?: string[] }>,
    );
    const [id] = data.ids ?? [];
    if (!id) throw new RemoteError('network', 'Drive did not reserve a file ID.');
    return id;
  }

  private async upload(id: string, folderId: string, { name, content }: Sent) {
    const upload = multipart(
      { id, name, mimeType: MIME_TYPE, parents: [folderId] },
      content,
      MIME_TYPE,
    );
    const { data } = await this.request(
      `${DRIVE_UPLOAD}?uploadType=multipart&fields=${FILE_FIELDS}`,
      (response) => response.json() as Promise<RemoteFile>,
      { method: 'POST', headers: { 'Content-Type': upload.type }, body: upload.body },
    );
    if (data.id !== id) throw new RemoteError('conflict', 'Drive created a different file.');
    return { id: data.id, name: data.name, version: data.version };
  }

  private async created(id: string): Promise<Created | null> {
    const url = `${DRIVE_API}/${encodeURIComponent(id)}`;
    try {
      const { data: meta } = await this.request(
        `${url}?fields=${FILE_FIELDS},parents`,
        (response) => response.json() as Promise<RemoteFile & { parents?: string[] }>,
      );
      const { data: content } = await this.request(`${url}?alt=media`, (response) =>
        response.text(),
      );
      return {
        file: { id: meta.id, name: meta.name, version: meta.version },
        parents: meta.parents ?? [],
        content,
      };
    } catch (error) {
      if (error instanceof RemoteError && error.reason === 'missing') return null;
      throw error;
    }
  }

  private async adopt(
    existing: Created,
    reservation: Reservation,
    folderId: string,
    doc: Document,
  ): Promise<RemoteFile> {
    const ours = reservation.sent.some(
      (sent) => sent.content === existing.content && sent.name === existing.file.name,
    );
    if (!ours || !existing.parents.includes(folderId)) {
      this.forgetUnconfirmed();
      throw new RemoteError('conflict', 'The reserved file holds something else.');
    }
    const latest = reservation.sent.at(-1)!;
    if (existing.content === latest.content && existing.file.name === latest.name)
      return existing.file;
    return this.save(existing.file, doc);
  }

  private metadata(id: string, fields = 'version') {
    return this.request(
      `${DRIVE_API}/${encodeURIComponent(id)}?fields=${fields}`,
      (response) => response.json() as Promise<{ version: string; mimeType?: string }>,
    );
  }

  private async request<T>(
    url: string,
    read: (response: Response) => Promise<T>,
    init: RequestInit = {},
  ): Promise<Reply<T>> {
    const token = this.token();
    if (!token) throw new RemoteError('auth', 'Not connected to Google Drive.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await this.fetcher(url, {
        cache: 'no-store',
        ...init,
        signal: controller.signal,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) this.onRefused(token);
      if (!response.ok) throw await failureOf(response);
      return { data: await read(response), etag: response.headers.get('ETag') };
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError(
        'network',
        controller.signal.aborted ? 'Drive did not answer in time.' : (error as Error).message,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
