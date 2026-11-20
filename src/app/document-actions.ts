import type { Editor, IdGenerator } from '../application';
import { importInto, type ImportSource } from '../adapters/draft/import';
import { exportPng, exportSvg, type ExportView } from '../adapters/export/image-export';
import { downloadBlob, downloadText } from '../adapters/files/browser-files';
import type { LocalFileAccess } from '../adapters/files/file-access';
import { FILE_EXTENSION, fileNameFor, MIME_TYPE, parseStructlet, serializeStructlet } from '../adapters/format/structlet-format';
import { emptyDocument, type Document } from '../domain';
import type { Appearance } from '../engine';
import type { Translate } from '../i18n/messages';
import sampleText from '../../samples/three-tier.structlet?raw';

export interface DocumentActions {
  newDocument(): void;
  open(): Promise<void>;
  importFile(): Promise<void>;
  importText(text: string, name?: string): Promise<void>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  exportSvg(): void;
  exportPng(): Promise<void>;
  openSample(): void;
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
}

const SOURCE_NAMES: Record<ImportSource, string> = { draft: 'draft JSON', compose: 'docker-compose', terraform: 'Terraform', kubernetes: 'Kubernetes' };

/** File use cases wired to browser adapters. `onOpened` lets the view fit the new document. */
export function createDocumentActions({ editor, files, newId, appearance, t, notify, onOpened, view }: Deps): DocumentActions {
  const session = editor.session;
  const replace = (doc: Document, keepFile = false) => {
    if (!keepFile) files.forget();
    session.replaceDocument(doc, { dirty: true });
    onOpened(doc);
  };
  const importText = async (text: string, name?: string) => {
    const result = await importInto(session.committedDocument, text, undefined, name?.replace(/\.[^.]+$/, ''));
    const doc = session.committedDocument;
    if (!result.ok) {
      notify(`${t('import.failed')}: ${result.errors.slice(0, 3).join(' · ')}`);
      return;
    }
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
    newDocument() {
      const doc = session.committedDocument;
      const hasContent = doc.nodes.length + doc.containers.length + doc.annotations.length > 0;
      if (hasContent && !window.confirm(t('confirm.new'))) return;
      replace(emptyDocument(newId('document'), t('app.untitled')));
    },
    async open() {
      const file = await files.open(`${FILE_EXTENSION},application/json,.json`);
      if (!file) return;
      const result = parseStructlet(file.text);
      if (!result.ok) {
        files.forget();
        notify(`${t('error.open')}: ${result.errors.slice(0, 3).join(' · ')}`);
        return;
      }
      replace(result.document, true);
    },
    async importFile() {
      const file = await files.read('.json,.yml,.yaml,application/json,text/yaml');
      if (file) await importText(file.text, file.name);
    },
    importText,
    async save() {
      saved(await files.save(text(), name(), MIME_TYPE));
    },
    async saveAs() {
      saved(await files.saveAs(text(), name(), MIME_TYPE));
    },
    exportSvg() {
      const doc = session.committedDocument;
      const suffix = view() === 'isometric' ? '-isometric' : '';
      downloadText(exportSvg(doc, appearance(), { view: view() }), fileNameFor(doc.title + suffix, '.svg'), 'image/svg+xml');
    },
    async exportPng() {
      const doc = session.committedDocument;
      try {
        const suffix = view() === 'isometric' ? '-isometric' : '';
        downloadBlob(await exportPng(doc, appearance(), { view: view() }), fileNameFor(doc.title + suffix, '.png'));
      } catch {
        notify(t('error.png'));
      }
    },
    openSample() {
      const result = parseStructlet(sampleText);
      if (result.ok) replace({ ...result.document, id: newId('document') });
    },
  };
}
