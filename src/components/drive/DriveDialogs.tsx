import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Conflict, MergeSide } from '../../domain';
import type { MessageKey, Translate } from '../../i18n/messages';
import { IconButton } from '../ui/controls';
import type { DriveActions, DriveView } from './types';

function Modal({ label, onClose, children, testId }: { label: string; onClose(): void; children: ReactNode; testId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-label={label} onCancel={onClose} data-testid={testId}>
      <div className="dialog-head">
        <h2>{label}</h2>
        <IconButton icon="close" label={label} onClick={onClose} />
      </div>
      {children}
    </dialog>
  );
}

const STATUS: Record<string, MessageKey> = {
  synced: 'drive.status.synced', pending: 'drive.status.pending', saving: 'drive.status.saving', paused: 'drive.status.paused', conflict: 'drive.status.conflict', failed: 'drive.status.failed',
};

export function DriveDialog({ t, view, actions, onClose, onConflict, onDisconnect }: { t: Translate; view: DriveView; actions: DriveActions; onClose(): void; onConflict(): void; onDisconnect(): void }) {
  const { state } = view;
  if (state.status === 'unlinked') return null;
  const failure = state.status === 'failed' ? t(`drive.failure.${state.reason}` as MessageKey, { email: state.detail }) : null;
  return (
    <Modal label={t('drive.dialog.title')} onClose={onClose} testId="drive-dialog">
      <dl className="drive-facts">
        <dt>{t('drive.dialog.file')}</dt>
        <dd data-testid="drive-file">{state.file.name}</dd>
        {view.account && (
          <>
            <dt>{t('drive.dialog.account')}</dt>
            <dd>{view.account}</dd>
          </>
        )}
        {view.folder && (
          <>
            <dt>{t('drive.dialog.folder')}</dt>
            <dd>{view.folder}</dd>
          </>
        )}
      </dl>
      <p className="hint" role="status">{t(STATUS[state.status]!)}</p>
      {failure && <p className="hint strong">{failure}</p>}
      <div className="button-row">
        {state.status === 'paused' ? (
          <button type="button" onClick={actions.connect}>{t('drive.dialog.reconnect')}</button>
        ) : state.status === 'conflict' ? (
          <button type="button" onClick={onConflict}>{t('drive.dialog.resolve')}</button>
        ) : (
          <button type="button" onClick={actions.saveNow} data-testid="drive-save-now">{state.status === 'failed' ? t('drive.dialog.retry') : t('drive.dialog.saveNow')}</button>
        )}
        <button type="button" onClick={actions.saveCopy}>{t('drive.saveCopy')}</button>
        <button type="button" onClick={() => (actions.stop(), onClose())} data-testid="drive-stop">{t('drive.stop')}</button>
        <button type="button" className="danger" onClick={onDisconnect}>{t('drive.disconnect')}</button>
      </div>
    </Modal>
  );
}

function describe(t: Translate, c: Conflict, value: unknown): string {
  if (value === undefined) return t('drive.conflict.deleted');
  if (c.collection === 'title') return String(value);
  if (c.field) {
    const v = value as Record<string, unknown>;
    if (c.field === 'position') return `${Math.round(Number(v.x))}, ${Math.round(Number(v.y))}`;
    if (c.field === 'size') return `${Math.round(Number(v.width))} × ${Math.round(Number(v.height))}`;
    const first = Object.values(v)[0];
    return typeof first === 'object' ? JSON.stringify(first).slice(0, 60) : String(first ?? '—');
  }
  const o = value as { label?: string; text?: string };
  return (o.label ?? o.text ?? '').split('\n')[0] || '—';
}

export function ConflictDialog({ t, conflicts, nameOf, onResolve, onClose }: { t: Translate; conflicts: readonly Conflict[]; nameOf(c: Conflict): string; onResolve(choices: Record<string, MergeSide>): void; onClose(): void }) {
  const [choices, setChoices] = useState<Record<string, MergeSide>>(() => Object.fromEntries(conflicts.map((c) => [c.key, 'local'])));
  const all = (side: MergeSide) => setChoices(Object.fromEntries(conflicts.map((c) => [c.key, side])));
  return (
    <Modal label={t('drive.conflict.title')} onClose={onClose} testId="conflict-dialog">
      <p className="hint">{t('drive.conflict.intro')}</p>
      <ul className="conflict-list">
        {conflicts.map((c) => (
          <li key={c.key} data-conflict={c.key}>
            <strong>{nameOf(c)}</strong>
            <div className="segmented" role="radiogroup" aria-label={nameOf(c)}>
              {(['local', 'remote'] as const).map((side) => (
                <button type="button" key={side} role="radio" aria-checked={choices[c.key] === side} data-side={side} onClick={() => setChoices({ ...choices, [c.key]: side })}>
                  <span className="side-name">{t(side === 'local' ? 'drive.conflict.mine' : 'drive.conflict.theirs')}</span>
                  <span className="side-value">{describe(t, c, side === 'local' ? c.local : c.remote)}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="button-row end">
        <button type="button" onClick={() => all('local')}>{t('drive.conflict.allMine')}</button>
        <button type="button" onClick={() => all('remote')} data-testid="conflict-all-theirs">{t('drive.conflict.allTheirs')}</button>
        <button type="button" className="primary" onClick={() => (onResolve(choices), onClose())} data-testid="conflict-apply">{t('drive.conflict.apply')}</button>
      </div>
    </Modal>
  );
}

export function DisconnectDialog({ t, onDisconnect, onClose }: { t: Translate; onDisconnect(forget: boolean): void; onClose(): void }) {
  const [forget, setForget] = useState(false);
  return (
    <Modal label={t('drive.disconnect.title')} onClose={onClose} testId="disconnect-dialog">
      <p className="hint">{t('drive.disconnect.body')}</p>
      <label className="check">
        <input type="checkbox" checked={forget} onChange={(e) => setForget(e.target.checked)} />
        {t('drive.disconnect.forget')}
      </label>
      <div className="button-row end">
        <button type="button" className="danger" onClick={() => (onDisconnect(forget), onClose())} data-testid="disconnect-confirm">{t('drive.disconnect.confirm')}</button>
      </div>
    </Modal>
  );
}

/** Asks once, without covering the canvas, before any usage statistics are sent. */
export function ConsentBanner({ t, onChoose }: { t: Translate; onChoose(granted: boolean): void }) {
  return (
    <div className="consent" role="region" aria-label={t('consent.setting')} data-testid="consent">
      <span>{t('consent.text')}</span>
      <button type="button" onClick={() => onChoose(false)} data-testid="consent-decline">{t('consent.decline')}</button>
      <button type="button" className="primary" onClick={() => onChoose(true)} data-testid="consent-accept">{t('consent.accept')}</button>
    </div>
  );
}
