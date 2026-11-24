import previewEn from '../assets/manual-comparison-en.webp';
import previewKo from '../assets/manual-comparison-ko.webp';
import { Icon } from '../ui/Icon';
import type { Language, Translate } from '../../i18n/messages';

export type ComparisonSample = 'architecture-diff-before' | 'architecture-diff-after';

export function ComparisonGuide({ t, language, download }: { t: Translate; language: Language; download(sample: ComparisonSample): void }) {
  return (
    <section className="manual-sample" aria-labelledby="manual-comparison-title">
      <h2 id="manual-comparison-title">{t('compare.title')}</h2>
      <ol className="manual-steps">
        <li>{t('compare.guide.current')}</li>
        <li>{t('compare.guide.previous')}</li>
        <li>{t('compare.guide.review')}</li>
      </ol>
      <div className="button-row">
        <button type="button" className="chip-button" onClick={() => download('architecture-diff-after')}>
          <Icon name="download" size={14} />{t('compare.guide.downloadAfter')}
        </button>
        <button type="button" className="chip-button" onClick={() => download('architecture-diff-before')}>
          <Icon name="download" size={14} />{t('compare.guide.downloadBefore')}
        </button>
      </div>
      <img className="manual-preview" src={language === 'ko' ? previewKo : previewEn} alt={t('compare.guide.preview')} loading="lazy" />
    </section>
  );
}
