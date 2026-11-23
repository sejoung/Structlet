import { useEffect, useRef } from 'react';
import manualEn from './assets/manual-en.webp';
import manualKo from './assets/manual-ko.webp';
import type { Language, MessageKey, Translate } from '../i18n/messages';
import { IconPackSources } from './IconPacksDialog';
import { Icon } from './ui/Icon';
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

export function ManualDialog({ t, language, onDownloadSample, onClose }: { t: Translate; language: Language; onDownloadSample(sample: 'three-tier' | 'gpu-training' | 'mig-inference'): void; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="manual-title" onCancel={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-head">
        <h2 id="manual-title">{t('manual.title')}</h2>
        <IconButton icon="close" label={t('packs.close')} onClick={onClose} />
      </div>
      <ol className="manual-steps">
        <li>{t('manual.add')}</li>
        <li>{t('sc.connect')}</li>
        <li>{t('manual.save')}</li>
      </ol>
      <section className="manual-sample" aria-labelledby="sample-title">
        <h3 id="sample-title">{t('manual.sample')}</h3>
        <img className="manual-preview" src={language === 'ko' ? manualKo : manualEn} alt={t('manual.preview')} width={1240} height={740} />
        <p className="hint">{t('manual.sampleHint')}</p>
        <button type="button" className="chip-button" onClick={() => onDownloadSample('three-tier')}>
          <Icon name="download" size={14} />
          {t('manual.download')}
        </button>
      </section>
      <section className="manual-packs" aria-labelledby="manual-gpu-title">
        <h3 id="manual-gpu-title">{t('manual.gpuSamples')}</h3>
        <p className="hint">{t('manual.gpuLinks')}</p>
        <div className="button-row">
          <button type="button" className="chip-button" onClick={() => onDownloadSample('gpu-training')}>
            <Icon name="download" size={14} />
            {t('manual.gpuTraining')}
          </button>
          <button type="button" className="chip-button" onClick={() => onDownloadSample('mig-inference')}>
            <Icon name="download" size={14} />
            {t('manual.migInference')}
          </button>
        </div>
      </section>
      <section className="manual-packs" aria-labelledby="manual-packs-title">
        <h3 id="manual-packs-title">{t('packs.title')}</h3>
        <p className="hint">{t('manual.packsHint')}</p>
        <IconPackSources t={t} />
      </section>
      <details className="manual-shortcuts">
        <summary>{t('shortcuts.title')}</summary>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>{keys.split(' ').map((k) => <kbd key={k}>{mac ? k : k.replace('⌘', 'Ctrl+').replace('⇧', 'Shift+')}</kbd>)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </dialog>
  );
}
