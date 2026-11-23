import { useEffect } from 'react';
import type { Translate } from '../i18n/messages';
import { IconButton } from './ui/controls';

/** Short message at the bottom of the canvas; errors stay until dismissed. */
export function Toast({ t, message, onDismiss }: { t: Translate; message: string | null; onDismiss(): void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) return null;
  return (
    <div className="toast" role="alert">
      <span>{message}</span>
      <IconButton icon="close" label={t('toast.dismiss')} onClick={onDismiss} />
    </div>
  );
}
