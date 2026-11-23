import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DriveSync, Editor, SyncState } from '../../application';
import { errorDetails, log } from '../../adapters/diagnostics/log';
import type { LocalDriveFolder } from '../../adapters/drive/links';
import { DriveAuthError, type DriveAuth, type DriveItem } from '../../adapters/drive/types';
import { RemoteError, type Document } from '../../domain';
import type { DriveActions, DriveView } from '../../components/drive/types';
import type { Language, MessageKey, Translate } from '../../i18n/messages';
import { useAuthRenewal } from './use-auth-renewal';

export interface DriveServices {
  readonly auth: DriveAuth;
  readonly sync: DriveSync;
  readonly folder: LocalDriveFolder;
}

interface Options {
  services: DriveServices | undefined;
  editor: Editor;
  t: Translate;
  language: Language;
  notify(message: string): void;
  onOpened(doc: Document): void;
}

const UNLINKED: SyncState = { status: 'unlinked' };
const isEmpty = (d: Document) => d.nodes.length + d.containers.length + d.edges.length + d.annotations.length === 0;

export function failureMessage(error: unknown): MessageKey {
  if (error instanceof DriveAuthError) return error.reason === 'revoke' ? 'drive.revokeFailed' : error.reason === 'cancelled' ? 'drive.error.cancelled' : 'drive.error.unavailable';
  if (error instanceof RemoteError) return error.reason === 'auth' ? 'drive.failure.auth' : `drive.failure.${error.reason}`;
  return 'drive.failure.unknown';
}

export interface DriveController {
  readonly view: DriveView;
  readonly actions: DriveActions;
  beforeReplace(): Promise<boolean>;
  markFresh(): void;
  readonly linked: boolean;
}

export function useDrive({ services, editor, t, language, notify, onOpened }: Options): DriveController | null {
  const [state, setState] = useState<SyncState>(() => services?.sync.current ?? UNLINKED);
  const [connected, setConnected] = useState(() => Boolean(services?.auth.getToken()));
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<string | undefined>(() => services?.sync.linkedAccount?.email);
  const [folder, setFolder] = useState(() => services?.folder.read() ?? null);
  const fresh = useRef(false);
  const latest = useRef({ t, notify, onOpened, language });
  latest.current = { t, notify, onOpened, language };
  const hint = () => services?.sync.linkedAccount?.email || undefined;

  useEffect(() => {
    if (!services) return;
    const { auth, sync } = services;
    const offSync = sync.watch((s) => {
      setState(s);
      setAccount(sync.linkedAccount?.email);
    });
    const offAuth = auth.subscribe((event) => {
      setConnected(Boolean(auth.getToken()));
      if (event === 'connected') void (sync.current.status === 'unlinked' ? sync.recover() : sync.reconnected());
      if (event === 'expired' || event === 'disconnected') sync.pause();
      if (event === 'forgotten') {
        sync.unlink();
        services.folder.write(null);
        setFolder(null);
      }
    });
    if (sync.current.status !== 'unlinked') void auth.prepare().catch(() => undefined);
    return () => {
      offSync();
      offAuth();
    };
  }, [services]);

  useEffect(() => {
    if (!services) return;
    return editor.session.subscribe(() => {
      const doc = editor.session.committedDocument;
      const target = services.folder.read();
      if (!fresh.current || !target || isEmpty(doc) || services.sync.current.status !== 'unlinked' || !services.auth.getToken()) return;
      fresh.current = false;
      void services.sync.create(target.id).then(
        (file) => {
          log.info('drive.created', { automatic: true });
          latest.current.notify(latest.current.t('drive.saved', { name: file.name }));
        },
        (error) => {
          log.warn('drive.create-failed', errorDetails(error, false));
          latest.current.notify(latest.current.t(failureMessage(error)));
        },
      );
    });
  }, [services, editor]);

  const renewal = useAuthRenewal(services?.auth, state.status !== 'unlinked', () => notify(t('drive.renewFailed')), hint);

  const run = useCallback(
    async (name: string, action: (s: DriveServices) => Promise<void>) => {
      if (!services) return;
      setBusy(true);
      try {
        await action(services);
      } catch (error) {
        log.warn(`drive.${name}-failed`, errorDetails(error, false));
        latest.current.notify(latest.current.t(failureMessage(error), { email: services.sync.linkedAccount?.email ?? '' }));
      } finally {
        setBusy(false);
      }
    },
    [services],
  );

  const access = async ({ auth }: DriveServices) => {
    if (auth.getToken()) return;
    if (!auth.ready()) await auth.prepare();
    await auth.connect(hint());
    log.info('drive.connected');
    latest.current.notify(latest.current.t('drive.connected'));
  };
  const pick = (s: DriveServices, kind: 'file' | 'folder') =>
    s.auth.pick(kind, { language: latest.current.language, title: latest.current.t(kind === 'folder' ? 'drive.pickFolder' : 'drive.pickFile') });
  const createIn = async (s: DriveServices, target: DriveItem) => {
    const email = (await s.sync.account())?.email;
    s.folder.write({ ...target, ...(email ? { account: email } : {}) });
    setFolder(s.folder.read());
    const file = await s.sync.create(target.id);
    log.info('drive.created', { automatic: false });
    latest.current.notify(latest.current.t('drive.saved', { name: file.name }));
  };

  const actions: DriveActions = {
    prepare: () => void services?.auth.prepare().catch(() => undefined),
    connect: () =>
      void run('connect', async (s) => {
        await access(s);
        if (s.sync.current.status !== 'unlinked') await s.sync.resume();
      }),
    renew: renewal.renew,
    saveToFolder: () =>
      void run('save', async (s) => {
        await access(s);
        if (s.sync.current.status !== 'unlinked') return s.sync.saveNow();
        const current = await s.sync.account();
        const remembered = s.folder.read();
        const target = remembered && (!remembered.account || remembered.account === current?.email) ? remembered : await pick(s, 'folder');
        if (target) await createIn(s, target);
      }),
    saveCopy: () =>
      void run('copy', async (s) => {
        await access(s);
        const target = await pick(s, 'folder');
        if (target) await createIn(s, target);
      }),
    open: () =>
      void run('open', async (s) => {
        await access(s);
        const item = await pick(s, 'file');
        if (!item) return;
        const doc = editor.session.committedDocument;
        if (s.sync.current.status === 'unlinked' && !isEmpty(doc) && !window.confirm(latest.current.t('drive.confirmReplace'))) return;
        if (!(await s.sync.settle())) return latest.current.notify(latest.current.t('drive.notSettled'));
        const opened = await s.sync.open(item.id);
        s.sync.linkOpened(opened);
        editor.session.replaceDocument(opened.document);
        fresh.current = false;
        log.info('drive.opened');
        latest.current.onOpened(opened.document);
        latest.current.notify(latest.current.t('drive.opened', { name: opened.file.name }));
      }),
    saveNow: () => void run('save', (s) => (s.auth.getToken() ? s.sync.saveNow() : access(s).then(() => s.sync.resume()))),
    stop: () => services?.sync.unlink(),
    disconnect: (forget) =>
      void run('disconnect', async (s) => {
        await s.auth.disconnect(forget);
      }),
    resolve: (choices) => void run('resolve', (s) => s.sync.resolve(choices)),
  };

  const view: DriveView = useMemo(
    () => ({ state, connected, expiring: renewal.expiring, busy, ...(account ? { account } : {}), ...(folder ? { folder: folder.name } : {}) }),
    [state, connected, renewal.expiring, busy, account, folder],
  );

  if (!services) return null;
  return {
    view,
    actions,
    linked: state.status !== 'unlinked',
    markFresh: () => void (fresh.current = true),
    async beforeReplace() {
      if (services.sync.current.status === 'unlinked') return true;
      if (!(await services.sync.settle())) {
        latest.current.notify(latest.current.t('drive.notSettled'));
        return false;
      }
      services.sync.unlink();
      return true;
    },
  };
}
