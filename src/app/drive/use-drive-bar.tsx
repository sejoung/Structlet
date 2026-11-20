import { useState, type ReactNode } from 'react';
import type { Editor } from '../../application';
import { indexDocument, type Conflict, type Document } from '../../domain';
import { ConflictDialog, DisconnectDialog, DriveDialog } from '../../components/drive/DriveDialogs';
import type { DriveBar } from '../../components/Toolbar';
import type { Language, MessageKey, Translate } from '../../i18n/messages';
import { useDrive, type DriveController, type DriveServices } from './use-drive';

interface Options {
  services: DriveServices | undefined;
  /** Drive is configured but this page cannot use it (opened from a file). */
  webOnly: boolean;
  editor: Editor;
  t: Translate;
  language: Language;
  notify(message: string): void;
  onOpened(doc: Document): void;
}

/** The Drive parts of the screen: the top-bar entry and its dialogs. */
export function useDriveBar(options: Options): { bar: DriveBar | undefined; dialogs: ReactNode; controller: DriveController | null } {
  const { t, editor } = options;
  const controller = useDrive(options);
  const [dialog, setDialog] = useState<'details' | 'conflict' | 'disconnect' | null>(null);
  if (!controller) return { bar: options.webOnly ? { kind: 'web-only' } : undefined, dialogs: null, controller: null };
  const { view, actions } = controller;
  const nameOf = (c: Conflict): string => {
    if (c.collection === 'title') return t('drive.conflict.title-field');
    const index = indexDocument(editor.session.committedDocument);
    const o = c.id ? (index.nodes.get(c.id) ?? index.containers.get(c.id) ?? index.edges.get(c.id) ?? index.annotations.get(c.id)) : undefined;
    const from = (o && ('label' in o ? o.label : o.text)) || ((c.local ?? c.remote) as { label?: string } | undefined)?.label || c.id || '';
    const name = from.split('\n')[0] ?? '';
    return c.field ? `${name} · ${t(`field.${c.field}` as MessageKey)}` : name;
  };
  const dialogs = (
    <>
      {dialog === 'details' && <DriveDialog t={t} view={view} actions={actions} onClose={() => setDialog(null)} onConflict={() => setDialog('conflict')} onDisconnect={() => setDialog('disconnect')} />}
      {dialog === 'conflict' && view.state.status === 'conflict' && (
        <ConflictDialog t={t} conflicts={view.state.conflicts} nameOf={nameOf} onResolve={actions.resolve} onClose={() => setDialog(null)} />
      )}
      {dialog === 'disconnect' && <DisconnectDialog t={t} onDisconnect={actions.disconnect} onClose={() => setDialog(null)} />}
    </>
  );
  return {
    bar: { kind: 'ready', view, actions, onDetails: () => setDialog('details'), onConflict: () => setDialog('conflict'), onDisconnect: () => setDialog('disconnect') },
    dialogs,
    controller,
  };
}
