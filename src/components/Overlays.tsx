import { useEffect, useRef } from 'react';
import type { MessageKey, Translate } from '../i18n/messages';
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

const SHORTCUTS: [string, MessageKey][] = [
  ['⌘Z', 'sc.undo'],
  ['⇧⌘Z', 'sc.redo'],
  ['⌘S', 'sc.save'],
  ['⇧⌘S', 'sc.saveAs'],
  ['⌘O', 'sc.open'],
  ['⌘C ⌘X ⌘V', 'sc.copy'],
  ['⌘D', 'sc.duplicate'],
  ['⌫', 'sc.delete'],
  ['⌘A', 'sc.selectAll'],
  ['Esc', 'sc.deselect'],
  ['← → ↑ ↓', 'sc.nudge'],
  ['Enter', 'sc.rename'],
  ['⌘0', 'sc.fit'],
  ['⌘+ ⌘−', 'sc.zoom'],
  ['Space', 'sc.pan'],
  ['Tab', 'sc.tab'],
  ['Alt', 'sc.marquee'],
  ['V H C', 'sc.tools'],
  ['⌘\\', 'sc.panels'],
  ['I', 'sc.inspector'],
  ['⌘.', 'sc.present'],
];

export function ShortcutsDialog({ t, onClose }: { t: Translate; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="sc-title" onCancel={onClose} onClick={(e) => e.target === ref.current && onClose()} data-testid="shortcuts">
      <div className="dialog-head">
        <h2 id="sc-title">{t('shortcuts.title')}</h2>
        <IconButton icon="close" label={t('packs.close')} onClick={onClose} />
      </div>
      <dl className="shortcut-list">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{keys.split(' ').map((k) => <kbd key={k}>{mac ? k : k.replace('⌘', 'Ctrl+').replace('⇧', 'Shift+')}</kbd>)}</dd>
          </div>
        ))}
      </dl>
      <p className="section-hint">{t('sc.connect')}</p>
    </dialog>
  );
}
