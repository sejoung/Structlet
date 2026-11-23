import type { SyncState } from '../../application';
import type { MessageKey, Translate } from '../../i18n/messages';
import { Icon, type IconName } from '../ui/Icon';
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

const MARK: Record<SyncState['status'], IconName> = {
  unlinked: 'cloud',
  synced: 'cloudCheck',
  pending: 'cloudUpload',
  saving: 'cloudUpload',
  paused: 'cloudOff',
  conflict: 'cloudAlert',
  failed: 'cloudAlert',
};

export const needsAttention = (s: SyncState) => s.status === 'paused' || s.status === 'conflict' || s.status === 'failed';

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
  const linked = state.status !== 'unlinked';
  const tone = needsAttention(state) || view.expiring ? ' attention' : state.status === 'synced' ? ' synced' : '';
  const where = linked ? `${t('drive.section')} · ${state.file.name}` : t('drive.section');
  return (
    <button
      type="button"
      className={`drive-button${linked ? ' linked' : ''}${tone}`}
      data-testid="drive-button"
      data-status={state.status}
      data-drive-renew={view.expiring ? '' : undefined}
      aria-busy={view.busy || state.status === 'saving'}
      aria-label={label}
      onPointerEnter={actions.prepare}
      onFocus={actions.prepare}
      onClick={onClick}
      title={label === where ? where : `${label} — ${where}`}
    >
      <span className="drive-mark" aria-hidden="true">
        <Icon name={view.expiring ? 'cloudAlert' : MARK[state.status]} size={15} />
      </span>
      <span className="status-label">{label}</span>
    </button>
  );
}
