import { useEffect, useRef, useState } from 'react';
import manualEn from './assets/manual-en.webp';
import manualKo from './assets/manual-ko.webp';
import trainingEn from './assets/manual-training-en.webp';
import trainingKo from './assets/manual-training-ko.webp';
import migEn from './assets/manual-mig-en.webp';
import migKo from './assets/manual-mig-ko.webp';
import type { Language, MessageKey, Translate } from '../i18n/messages';
import { IconPackSources } from './IconPacksDialog';
import { LayoutGuide } from './LayoutGuide';
import { Icon } from './ui/Icon';
import { IconButton, Segmented } from './ui/controls';

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

const EXAMPLE_TABS = ['basic', 'complex', 'nvidia'] as const;
const GPU_EXAMPLES = [
  { sample: 'gpu-training', label: 'manual.gpuTraining', description: 'manual.trainingPreview', en: trainingEn, ko: trainingKo },
  { sample: 'mig-inference', label: 'manual.migInference', description: 'manual.migPreview', en: migEn, ko: migKo },
] as const;

export function ManualDialog({ t, language, onDownloadSample, onClose }: { t: Translate; language: Language; onDownloadSample(sample: 'three-tier' | 'gpu-training' | 'mig-inference' | 'commerce-and-ml'): void; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [example, setExample] = useState<(typeof EXAMPLE_TABS)[number]>('basic');
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <dialog ref={ref} className="dialog manual-dialog" aria-labelledby="manual-title" onCancel={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-head">
        <h2 id="manual-title">{t('manual.title')}</h2>
        <IconButton icon="close" label={t('packs.close')} onClick={onClose} />
      </div>
      <Segmented<(typeof EXAMPLE_TABS)[number]> label={t('manual.examples')} value={example} onChange={setExample} options={EXAMPLE_TABS.map((value) => ({ value, label: t(`manual.example.${value}`) }))} />
      {example === 'basic' && (
        <>
          <ol className="manual-steps">
            <li>{t('manual.add')}</li>
            <li>{t('sc.connect')}</li>
            <li>{t('manual.save')}</li>
          </ol>
          <section className="manual-sample" aria-labelledby="sample-title">
            <h3 id="sample-title">{t('manual.sample')}</h3>
            <p className="hint">{t('manual.sampleHint')}</p>
            <button type="button" className="chip-button" onClick={() => onDownloadSample('three-tier')}>
              <Icon name="download" size={14} />
              {t('manual.download')}
            </button>
            <img className="manual-preview" src={language === 'ko' ? manualKo : manualEn} alt={t('manual.preview')} width={1240} height={740} />
          </section>
        </>
      )}
      {example === 'complex' && <LayoutGuide t={t} language={language} onDownload={() => onDownloadSample('commerce-and-ml')} />}
      {example === 'nvidia' && (
        <section className="manual-packs" aria-labelledby="manual-gpu-title">
          <h3 id="manual-gpu-title">{t('manual.gpuSamples')}</h3>
          <p className="hint">{t('manual.gpuLinks')}</p>
          {GPU_EXAMPLES.map(({ sample, label, description, ...previews }) => (
            <article key={sample} className="manual-sample">
              <p className="hint">{t(description)}</p>
              <button type="button" className="chip-button" onClick={() => onDownloadSample(sample)}>
                <Icon name="download" size={14} />
                {t(label)}
              </button>
              <img className="manual-preview" src={previews[language]} alt={t(description)} width={1080} height={645} loading="lazy" />
            </article>
          ))}
        </section>
      )}
      <details className="manual-walkthrough">
        <summary>{t('manual.editingGuide')}</summary>
        <ul className="manual-steps">
          <li>{t('manual.areaGuide')}</li>
          <li>{t('manual.inspectorGuide')}</li>
          <li>{t('manual.importGuide')}</li>
          <li>{t('manual.storageGuide')}</li>
        </ul>
      </details>
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
