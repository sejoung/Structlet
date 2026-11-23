import summaryEn from './assets/manual-summary-en.webp';
import summaryKo from './assets/manual-summary-ko.webp';
import layoutEn from './assets/manual-layout-en.webp';
import layoutKo from './assets/manual-layout-ko.webp';
import polar from './assets/manual-polar-observatory.webp';
import type { Language, Translate } from '../i18n/messages';
import { Icon } from './ui/Icon';

export function LayoutGuide({ t, language, onDownload, onDownloadLarge }: { t: Translate; language: Language; onDownload(): void; onDownloadLarge(): void }) {
  return (
    <section className="manual-packs" aria-labelledby="manual-layout-title">
      <h2 id="manual-layout-title">{t('manual.layoutTitle')}</h2>
      <p className="hint">{t('manual.complexHint')}</p>
      <button type="button" className="chip-button" onClick={onDownload}>
        <Icon name="download" size={14} />
        {t('manual.complexDownload')}
      </button>
      <details className="manual-walkthrough" open>
        <summary>{t('manual.layoutGuide')}</summary>
        <ol className="manual-steps">
          <li>
            <strong>{t('manual.foldStep')}</strong>
            <p>{t('manual.foldBody')}</p>
          </li>
          <li>
            <strong>{t('manual.summaryStep')}</strong>
            <p>{t('manual.summaryBody')}</p>
            <img className="manual-preview" src={language === 'ko' ? summaryKo : summaryEn} alt={t('manual.summaryPreview')} width={1080} height={645} loading="lazy" />
          </li>
          <li>
            <strong>{t('manual.fullStep')}</strong>
            <p>{t('manual.fullBody')}</p>
            <img className="manual-preview" src={language === 'ko' ? layoutKo : layoutEn} alt={t('manual.fullPreview')} width={1080} height={645} loading="lazy" />
          </li>
        </ol>
      </details>
      <article className="manual-sample" aria-labelledby="manual-large-example">
        <h2 id="manual-large-example">{t('manual.largeTitle')}</h2>
        <p className="hint">{t('manual.largeHint')}</p>
        <button type="button" className="chip-button" onClick={onDownloadLarge}>
          <Icon name="download" size={14} />
          {t('manual.largeDownload')}
        </button>
        <img className="manual-preview" src={polar} alt={t('manual.largePreview')} width={1200} height={740} loading="lazy" />
      </article>
    </section>
  );
}
