import { useState } from 'react';
import manualEn from './assets/manual-en.webp';
import manualKo from './assets/manual-ko.webp';
import trainingEn from './assets/manual-training-en.webp';
import trainingKo from './assets/manual-training-ko.webp';
import migEn from './assets/manual-mig-en.webp';
import migKo from './assets/manual-mig-ko.webp';
import type { Language, MessageKey, Translate } from '../i18n/messages';
import { IconPackSources } from './IconPacksDialog';
import { LayoutGuide } from './LayoutGuide';
import { ManualAiGuide, type ManualAiActions } from './ManualAiGuide';
import { Icon } from './ui/Icon';
import { Segmented } from './ui/controls';

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

const GUIDE_TABS = ['basic', 'complex', 'nvidia', 'ai'] as const;
const GPU_EXAMPLES = [
  { sample: 'gpu-training', label: 'manual.gpuTraining', description: 'manual.trainingPreview', en: trainingEn, ko: trainingKo },
  { sample: 'mig-inference', label: 'manual.migInference', description: 'manual.migPreview', en: migEn, ko: migKo },
] as const;

export function ManualPage({ t, language, ai, onDownloadSample }: { t: Translate; language: Language; ai: ManualAiActions; onDownloadSample(sample: 'three-tier' | 'gpu-training' | 'mig-inference' | 'commerce-and-ml' | 'polar-observatory'): void }) {
  const [section, setSection] = useState<(typeof GUIDE_TABS)[number]>('basic');
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <main className="manual-page" aria-labelledby="manual-title">
      <header className="manual-header">
        <h1 id="manual-title">{t('manual.title')}</h1>
        <Segmented<(typeof GUIDE_TABS)[number]> label={t('manual.sections')} value={section} onChange={setSection} options={GUIDE_TABS.map((value) => ({ value, label: t(`manual.example.${value}`) }))} />
      </header>
      {section === 'basic' && (
        <>
          <ol className="manual-steps">
            <li>{t('manual.add')}</li>
            <li>{t('sc.connect')}</li>
            <li>{t('manual.save')}</li>
          </ol>
          <section className="manual-sample" aria-labelledby="sample-title">
            <h2 id="sample-title">{t('manual.sample')}</h2>
            <p className="hint">{t('manual.sampleHint')}</p>
            <button type="button" className="chip-button" onClick={() => onDownloadSample('three-tier')}>
              <Icon name="download" size={14} />
              {t('manual.download')}
            </button>
            <img className="manual-preview" src={language === 'ko' ? manualKo : manualEn} alt={t('manual.preview')} width={1240} height={740} />
          </section>
        </>
      )}
      {section === 'complex' && <LayoutGuide t={t} language={language} onDownload={() => onDownloadSample('commerce-and-ml')} onDownloadLarge={() => onDownloadSample('polar-observatory')} />}
      {section === 'nvidia' && (
        <section className="manual-packs" aria-labelledby="manual-gpu-title">
          <h2 id="manual-gpu-title">{t('manual.gpuSamples')}</h2>
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
      {section === 'ai' && <ManualAiGuide t={t} actions={ai} />}
      <details className="manual-walkthrough">
        <summary>{t('manual.editingGuide')}</summary>
        <ul className="manual-steps">
          <li>{t('manual.areaGuide')}</li>
          <li>{t('manual.inspectorGuide')}</li>
          <li>{t('manual.contextGuide')}</li>
          <li>{t('manual.isometricGuide')}</li>
          <li>{t('manual.flowGuide')}</li>
          <li>{t('manual.importGuide')}</li>
          <li>{t('manual.infrastructureGuide')}</li>
          <li>{t('manual.storageGuide')}</li>
        </ul>
      </details>
      <section className="manual-packs" aria-labelledby="manual-packs-title">
        <h2 id="manual-packs-title">{t('packs.title')}</h2>
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
    </main>
  );
}
