import type { Translate } from '../i18n/messages';

export function StatusBar({ t, zoom, dirty, notice, onDismiss }: { t: Translate; zoom: number; dirty: boolean; notice: string | null; onDismiss(): void }) {
  return (
    <footer className="statusbar">
      <span>{t('status.zoom', { zoom: Math.round(zoom * 100) })}</span>
      <span className="status-save" data-testid="save-status">{dirty ? t('status.saving') : t('status.saved')}</span>
      <span className="status-hint">{t('status.hint')}</span>
      {notice && (
        <span className="notice" role="alert">
          {notice}
          <button type="button" className="ghost" onClick={onDismiss} aria-label="dismiss">×</button>
        </span>
      )}
    </footer>
  );
}
