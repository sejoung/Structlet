import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor, EditorSession, type IdGenerator } from '../application';
import { LocalFileAccess, type FileAccessHost } from '../adapters/files/file-access';
import { FILE_EXTENSION, MIME_TYPE } from '../adapters/format/structlet-format';
import { IconPackStore } from '../adapters/storage/icon-pack-store';
import { LocalDocumentStore } from '../adapters/storage/local-document-store';
import { emptyDocument } from '../domain';
import { createTranslator, pickLanguage, type Language } from '../i18n/messages';
import { App } from './App';
import './styles.css';

const LANGUAGE_KEY = 'structlet:language';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    // storage blocked
  }
  return pickLanguage(navigator.language);
}

const PREFIX: Record<Parameters<IdGenerator>[0], string> = { node: 'n', container: 'a', edge: 'e', annotation: 't', document: 'doc' };
const newId: IdGenerator = (kind) => `${PREFIX[kind]}-${crypto.randomUUID().slice(0, 8)}`;

const language = initialLanguage();
const store = new LocalDocumentStore(window.localStorage);
const doc = store.load() ?? emptyDocument(newId('document'), createTranslator(language)('app.untitled'));
const files = new LocalFileAccess(window as unknown as FileAccessHost, [{ description: 'Structlet diagram', accept: { [MIME_TYPE]: [FILE_EXTENSION] } }]);
const packStore = new IconPackStore(typeof indexedDB === 'undefined' ? undefined : indexedDB);
const session = new EditorSession(doc);
const editor = new Editor(session, newId);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      editor={editor}
      store={store}
      files={files}
      packStore={packStore}
      newId={newId}
      initialLanguage={language}
      onLanguage={(l) => {
        try {
          localStorage.setItem(LANGUAGE_KEY, l);
        } catch {
          // ignore
        }
      }}
    />
  </StrictMode>,
);
