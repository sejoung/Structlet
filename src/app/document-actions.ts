import type { Editor, IdGenerator } from '../application';
import { createAppearance } from '../adapters/catalog/services';
import { exportPng, exportSvg } from '../adapters/export/image-export';
import { downloadBlob, downloadText, pickTextFile } from '../adapters/files/browser-files';
import { FILE_EXTENSION, fileNameFor, MIME_TYPE, parseStructlet, serializeStructlet } from '../adapters/format/structlet-format';
import { emptyDocument, type Document } from '../domain';
import type { Language, Translate } from '../i18n/messages';
import sampleText from '../../samples/three-tier.structlet?raw';

export interface DocumentActions {
  newDocument(): void;
  open(): Promise<void>;
  save(): void;
  exportSvg(): void;
  exportPng(): Promise<void>;
  openSample(): void;
}

/** File use cases wired to browser adapters. `onOpened` lets the view fit the new document. */
export function createDocumentActions(editor: Editor, newId: IdGenerator, language: Language, t: Translate, notify: (message: string) => void, onOpened: (doc: Document) => void): DocumentActions {
  const session = editor.session;
  const appearance = createAppearance(language);
  const replace = (doc: Document) => {
    session.replaceDocument(doc, { dirty: true });
    onOpened(doc);
  };
  return {
    newDocument() {
      const doc = session.committedDocument;
      const hasContent = doc.nodes.length + doc.containers.length + doc.annotations.length > 0;
      if (hasContent && !window.confirm(t('confirm.new'))) return;
      replace(emptyDocument(newId('document'), t('app.untitled')));
    },
    async open() {
      const file = await pickTextFile(`${FILE_EXTENSION},application/json,.json`);
      if (!file) return;
      const result = parseStructlet(file.text);
      if (!result.ok) {
        notify(`${t('error.open')}: ${result.errors.slice(0, 3).join(' · ')}`);
        return;
      }
      replace(result.document);
    },
    save() {
      const doc = session.committedDocument;
      downloadText(serializeStructlet(doc), fileNameFor(doc.title, FILE_EXTENSION), MIME_TYPE);
    },
    exportSvg() {
      const doc = session.committedDocument;
      downloadText(exportSvg(doc, appearance), fileNameFor(doc.title, '.svg'), 'image/svg+xml');
    },
    async exportPng() {
      const doc = session.committedDocument;
      try {
        downloadBlob(await exportPng(doc, appearance), fileNameFor(doc.title, '.png'));
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
