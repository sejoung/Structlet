import type { SyncState } from '../../application';
import type { MessageKey, Translate } from '../../i18n/messages';
import { Icon } from '../ui/Icon';
import type { DriveActions, DriveView } from './types';

export const SHORT: Record<SyncState['status'], MessageKey> = {
  unlinked: 'drive.button.save',
  synced: 'drive.short.synced',
  pending: 'drive.short.pending',
  saving: 'drive.short.saving',
  paused: 'drive.short.paused',
  conflict: 'drive.short.conflict',
  failed: 'drive.short.failed',
};

export const needsAttention = (s: SyncState) => s.status === 'paused' || s.status === 'conflict' || s.status === 'failed';

/**
 * The Drive button: always in the same place, its label saying where the diagram is saved.
 * It connects, saves to Drive, renews access, or opens the details.
 */
export function DriveButton({ t, view, actions, onDetails, onConflict }: { t: Translate; view: DriveView; actions: DriveActions; onDetails(): void; onConflict(): void }) {
  const { state } = view;
  const label = view.expiring ? t('drive.short.renew') : !view.connected && state.status === 'unlinked' ? t('drive.button.connect') : t(SHORT[state.status]);
  const onClick = () => {
    if (view.expiring) return actions.renew();
    if (state.status === 'unlinked') return view.connected ? actions.saveToFolder() : actions.connect();
    if (state.status === 'paused') return actions.connect();
    if (state.status === 'conflict') return onConflict();
    return onDetails();
  };
  const tone = needsAttention(state) || view.expiring ? ' attention' : state.status === 'synced' ? ' synced' : '';
  return (
    <button
      type="button"
      className={`drive-button${tone}`}
      data-testid="drive-button"
      data-status={state.status}
      data-drive-renew={view.expiring ? '' : undefined}
      aria-busy={view.busy || state.status === 'saving'}
      onPointerEnter={actions.prepare}
      onFocus={actions.prepare}
      onClick={onClick}
      title={state.status !== 'unlinked' ? state.file.name : t('drive.section')}
    >
      <svg className="drive-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.3 3h7.4l5.8 10-3.7 6.4H6.2L2.5 13 8.3 3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8.3 3l5.8 10h7.4M2.5 13h7.4l3.7 6.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
      {state.status === 'synced' && <Icon name="check" size={14} />}
    </button>
  );
}
