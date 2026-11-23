import type { Editor, IdGenerator } from '../application';
import { log } from '../adapters/diagnostics/log';
import { importInto, type ImportSource } from '../adapters/draft/import';
import { exportPng, exportSvg, type ExportView } from '../adapters/export/image-export';
import { downloadBlob, downloadText } from '../adapters/files/browser-files';
import type { LocalFileAccess } from '../adapters/files/file-access';
import { FILE_EXTENSION, fileNameFor, MIME_TYPE, parseStructlet, serializeStructlet } from '../adapters/format/structlet-format';
import { emptyDocument, type Document } from '../domain';
import type { Appearance, DiagramView } from '../engine';
import type { Translate } from '../i18n/messages';

export interface DocumentActions {
  newDocument(): Promise<void>;
  open(): Promise<void>;
  openDroppedFiles(dropped: FileList): Promise<void>;
  importFile(): Promise<void>;
  importText(text: string, name?: string): Promise<void>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  exportSvg(): void;
  exportPng(): Promise<void>;
}

interface Deps {
  editor: Editor;
  files: LocalFileAccess;
  newId: IdGenerator;
  appearance(): Appearance;
  t: Translate;
  notify(message: string): void;
  onOpened(doc: Document): void;
  view(): ExportView;
  diagram(doc: Document): DiagramView;
  /** Google Drive, when this build has it: settle before replacing, save to the linked file. */
  drive?: () => { beforeReplace(): Promise<boolean>; markFresh(): void; linked: boolean; saveNow(): void } | null;
}

const SOURCE_NAMES: Record<ImportSource, string> = { draft: 'draft JSON', compose: 'docker-compose', terraform: 'Terraform', kubernetes: 'Kubernetes' };

/** File use cases wired to browser adapters. `onOpened` lets the view fit the new document. */
export function createDocumentActions({ editor, files, newId, appearance, t, notify, onOpened, view, diagram, drive }: Deps): DocumentActions {
  const session = editor.session;
  /** False when unsaved Drive changes could not be saved first; nothing is replaced then. */
  const replace = async (doc: Document, keepFile = false): Promise<boolean> => {
    const d = drive?.();
    if (d && !(await d.beforeReplace())) return false;
    if (!keepFile) files.forget();
    session.replaceDocument(doc, { dirty: true });
    onOpened(doc);
    return true;
  };
  const openText = async (text: string, keepFile: boolean) => {
    const result = parseStructlet(text);
    if (!result.ok) {
      if (keepFile) files.forget();
      notify(`${t('error.open')}: ${result.errors.slice(0, 3).join(' · ')}`);
      return;
    }
    if (await replace(result.document, keepFile)) log.info('files.opened');
  };
  const importText = async (text: string, name?: string) => {
    const result = await importInto(session.committedDocument, text, undefined, name?.replace(/\.[^.]+$/, ''));
    const doc = session.committedDocument;
    if (!result.ok) {
      log.warn('files.import-failed', { source: result.source });
      notify(`${t('import.failed')}: ${result.errors.slice(0, 3).join(' · ')}`);
      return;
    }
    log.info('files.imported', { source: result.source });
    const hadContent = doc.nodes.length + doc.containers.length > 0;
    // Merging into an existing diagram keeps its title; an empty diagram takes the imported one.
    const next = hadContent ? { ...result.document, title: doc.title } : result.document;
    editor.importDocument(next, result.created);
    notify(t('import.done', { count: result.created.length, source: SOURCE_NAMES[result.source] }));
    if (!hadContent) onOpened(session.committedDocument);
  };
  const text = () => serializeStructlet(session.committedDocument);
  const name = () => fileNameFor(session.committedDocument.title, FILE_EXTENSION);
  const saved = (outcome: string) => {
    if (outcome === 'saved' && files.fileName) notify(t('save.saved', { name: files.fileName }));
  };
  return {
    async newDocument() {
      const doc = session.committedDocument;
      const hasContent = doc.nodes.length + doc.containers.length + doc.annotations.length > 0;
      if (hasContent && !drive?.()?.linked && !window.confirm(t('confirm.new'))) return;
      if (!(await replace(emptyDocument(newId('document'), t('app.untitled'))))) return;
      drive?.()?.markFresh();
      log.info('files.new');
    },
    async open() {
      const file = await files.open(`${FILE_EXTENSION},application/json,.json`);
      if (file) await openText(file.text, true);
    },
    async openDroppedFiles(dropped) {
      const file = dropped[0];
      if (dropped.length !== 1 || !file?.name.toLowerCase().endsWith(FILE_EXTENSION)) {
        notify(t('error.dropFile'));
        return;
      }
      const contents = await file.text().catch(() => null);
      if (contents === null) {
        notify(t('error.open'));
        return;
      }
      await openText(contents, false);
    },
    async importFile() {
      const file = await files.read('.json,.yml,.yaml,application/json,text/yaml');
      if (file) await importText(file.text, file.name);
    },
    importText,
    async save() {
      const d = drive?.();
      if (d?.linked) {
        d.saveNow();
        log.info('files.saved', { target: 'drive' });
        return;
      }
      const outcome = await files.save(text(), name(), MIME_TYPE);
      if (outcome !== 'cancelled') log.info('files.saved', { target: outcome === 'saved' ? 'file' : 'download' });
      saved(outcome);
    },
    async saveAs() {
      const outcome = await files.saveAs(text(), name(), MIME_TYPE);
      if (outcome !== 'cancelled') log.info('files.saved', { target: outcome === 'saved' ? 'file' : 'download' });
      saved(outcome);
    },
    exportSvg() {
      const doc = session.committedDocument;
      const suffix = view() === 'isometric' ? '-isometric' : '';
      downloadText(exportSvg(doc, appearance(), { view: view(), diagram: diagram(doc) }), fileNameFor(doc.title + suffix, '.svg'), 'image/svg+xml');
      log.info('files.exported', { format: 'svg', view: view() });
    },
    async exportPng() {
      const doc = session.committedDocument;
      try {
        const suffix = view() === 'isometric' ? '-isometric' : '';
        downloadBlob(await exportPng(doc, appearance(), { view: view(), diagram: diagram(doc) }), fileNameFor(doc.title + suffix, '.png'));
        log.info('files.exported', { format: 'png', view: view() });
      } catch {
        log.error('files.png-failed');
        notify(t('error.png'));
      }
    },
  };
}
