import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DriveSync, Editor, EditorSession, type IdGenerator } from '../application';
import { analyticsConfig } from '../adapters/analytics/config';
import { GoogleAnalytics } from '../adapters/analytics/google-analytics';
import { log } from '../adapters/diagnostics/log';
import { openAuthChannel } from '../adapters/drive/auth-channel';
import { DriveClient } from '../adapters/drive/client';
import { driveConfig, webOrigin } from '../adapters/drive/config';
import { LocalCreations } from '../adapters/drive/creations';
import { GoogleConnection } from '../adapters/drive/google';
import { LocalDriveFolder, LocalDriveLinks } from '../adapters/drive/links';
import { LocalFileAccess, type FileAccessHost } from '../adapters/files/file-access';
import { FILE_EXTENSION, MIME_TYPE } from '../adapters/format/structlet-format';
import { IconPackStore } from '../adapters/storage/icon-pack-store';
import { LocalDocumentStore } from '../adapters/storage/local-document-store';
import { emptyDocument } from '../domain';
import { createTranslator, pickLanguage, type Language } from '../i18n/messages';
import { ManualPage } from '../components/ManualPage';
import { downloadSample } from './sample-downloads';
import { useTheme } from './use-theme';
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
// Failures are recorded by kind only; their messages may quote what the user typed.
window.addEventListener('error', (e) => log.error('app.uncaught', { name: e.error instanceof Error ? e.error.name : 'Error' }));
window.addEventListener('unhandledrejection', (e) => log.error('app.unhandled', { name: e.reason instanceof Error ? e.reason.name : typeof e.reason }));

const root = createRoot(document.getElementById('root')!);
const web = webOrigin(window.location);
const analytics = web ? analyticsConfig() : null;
const stats = analytics ? new GoogleAnalytics(analytics.measurementId) : undefined;

function Guide() {
  useTheme();
  return <ManualPage t={createTranslator(language)} language={language} onDownloadSample={downloadSample} />;
}

if (window.location.hash === '#manual') {
  document.documentElement.lang = language;
  document.title = `${createTranslator(language)('manual.title')} · Structlet`;
  root.render(<StrictMode><Guide /></StrictMode>);
} else {
  mountEditor();
}

function mountEditor() {
  const store = new LocalDocumentStore(window.localStorage);
  // A diagram linked to Drive whose browser copy was lost (or never written before a reload)
  // starts from the diagram as last synced: starting empty would read as deleting everything
  // and that would be saved to Drive on reconnecting (ADR 0016).
  const stored = store.load();
  const linked = new LocalDriveLinks().read();
  const doc = linked && (!stored || stored.id !== linked.base.id) ? linked.base : (stored ?? emptyDocument(newId('document'), createTranslator(language)('app.untitled')));
  const files = new LocalFileAccess(window as unknown as FileAccessHost, [{ description: 'Structlet diagram', accept: { [MIME_TYPE]: [FILE_EXTENSION] } }]);
  const packStore = new IconPackStore(typeof indexedDB === 'undefined' ? undefined : indexedDB);
  const session = new EditorSession(doc);
  const editor = new Editor(session, newId);

  // Google Drive and usage statistics: only when configured, and only on a web origin, since
  // Google sign-in cannot work on a page opened from a file (ADR 0016, ADR 0017).
  const google = driveConfig();
  function driveServices() {
    if (!google || !web) return undefined;
    const auth = new GoogleConnection(google, openAuthChannel(google.clientId));
    const client = new DriveClient(auth.getToken, undefined, (token) => auth.clearToken(token), new LocalCreations());
    return { auth, sync: new DriveSync(session, client, new LocalDriveLinks()), folder: new LocalDriveFolder() };
  }
  const drive = driveServices();
  root.render(
    <StrictMode>
      <App
        editor={editor}
        store={store}
        files={files}
        packStore={packStore}
        drive={drive}
        driveWebOnly={Boolean(google) && !web}
        stats={stats}
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
}
