import { downloadText, pickTextFile } from './browser-files';

/** The parts of the File System Access API this adapter uses. */
interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<WritableLike>;
}
type PickerType = { description: string; accept: Record<string, string[]> };
export interface FileAccessHost {
  showOpenFilePicker?(options: { types: PickerType[]; multiple: boolean }): Promise<FileHandleLike[]>;
  showSaveFilePicker?(options: { types: PickerType[]; suggestedName: string }): Promise<FileHandleLike>;
  navigator?: { webdriver?: boolean };
}

export type SaveOutcome = 'saved' | 'downloaded' | 'cancelled';

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

/**
 * Opens and saves `.structlet` files. Where the browser supports the File
 * System Access API, Save writes back to the opened file; elsewhere it falls
 * back to a file input and a download. Automated browsers use the fallback.
 */
export class LocalFileAccess {
  private handle: FileHandleLike | null = null;

  constructor(
    private readonly host: FileAccessHost,
    private readonly types: PickerType[],
    private readonly fallback = { pick: pickTextFile, download: downloadText },
  ) {}

  get supported(): boolean {
    return typeof this.host.showOpenFilePicker === 'function' && typeof this.host.showSaveFilePicker === 'function' && !this.host.navigator?.webdriver;
  }

  /** Name of the file Save writes to, if any. */
  get fileName(): string | null {
    return this.handle?.name ?? null;
  }

  forget(): void {
    this.handle = null;
  }

  async open(accept: string): Promise<{ name: string; text: string } | null> {
    if (!this.supported) return this.fallback.pick(accept);
    try {
      const [handle] = await this.host.showOpenFilePicker!({ types: this.types, multiple: false });
      if (!handle) return null;
      const text = await (await handle.getFile()).text();
      this.handle = handle;
      return { name: handle.name, text };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }

  /** Reads a file for import without making it the save target. */
  async read(accept: string): Promise<{ name: string; text: string } | null> {
    const handle = this.handle;
    try {
      return await this.open(accept);
    } finally {
      this.handle = handle;
    }
  }

  async save(text: string, suggestedName: string, mime: string): Promise<SaveOutcome> {
    if (this.handle) {
      await this.write(this.handle, text);
      return 'saved';
    }
    return this.saveAs(text, suggestedName, mime);
  }

  async saveAs(text: string, suggestedName: string, mime: string): Promise<SaveOutcome> {
    if (!this.supported) {
      this.fallback.download(text, suggestedName, mime);
      return 'downloaded';
    }
    try {
      const handle = await this.host.showSaveFilePicker!({ types: this.types, suggestedName });
      await this.write(handle, text);
      this.handle = handle;
      return 'saved';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      throw e;
    }
  }

  private async write(handle: FileHandleLike, text: string): Promise<void> {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }
}
