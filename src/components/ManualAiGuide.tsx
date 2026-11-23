import { useState, type FormEvent } from 'react';
import type { Translate } from '../i18n/messages';
import { Icon } from './ui/Icon';

export interface ManualAiActions {
  prompt: string;
  copyPrompt(): Promise<void>;
  downloadPrompt(): void;
  downloadSkill(): Promise<void>;
  compile(input: string): readonly string[];
}

export function ManualAiGuide({ t, actions }: { t: Translate; actions: ManualAiActions }) {
  const [copy, setCopy] = useState<'copied' | 'fallback' | null>(null);
  const [skillError, setSkillError] = useState(false);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [converted, setConverted] = useState(false);
  const convert = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = actions.compile(draft);
    setErrors(result);
    setConverted(result.length === 0);
  };
  return (
    <section aria-label={t('manual.example.ai')}>
      <section className="manual-sample" aria-labelledby="ai-chat">
        <h2 id="ai-chat">ChatGPT · Claude</h2>
        <p className="hint">{t('manual.ai.chat')}</p>
        <div className="button-row">
          <button type="button" className="chip-button" onClick={async () => {
            try {
              await actions.copyPrompt();
              setCopy('copied');
            } catch {
              setCopy('fallback');
            }
          }}><Icon name="copy" size={14} />{t('manual.ai.copy')}</button>
          <button type="button" className="chip-button" onClick={actions.downloadPrompt}>
            <Icon name="download" size={14} />{t('manual.ai.downloadPrompt')}
          </button>
        </div>
        {copy === 'copied' && <p role="status">{t('manual.ai.copied')}</p>}
        {copy === 'fallback' && (
          <>
            <p className="hint" role="status">{t('manual.ai.copyFallback')}</p>
            <textarea aria-label={t('manual.ai.prompt')} readOnly value={actions.prompt} rows={6} style={{ width: '100%' }} onFocus={(e) => e.currentTarget.select()} />
          </>
        )}
        <form onSubmit={convert} className="manual-packs">
          <label htmlFor="ai-draft">{t('manual.ai.draft')}</label>
          <textarea id="ai-draft" value={draft} rows={7} spellCheck={false} style={{ display: 'block', width: '100%' }}
            aria-invalid={errors.length ? true : undefined} onChange={(e) => {
              setDraft(e.target.value);
              setErrors([]);
              setConverted(false);
            }} />
          <div className="button-row">
            <button type="submit" className="chip-button" disabled={!draft.trim()}><Icon name="download" size={14} />{t('manual.ai.convert')}</button>
          </div>
          {errors.length > 0 && <p role="alert">{errors.slice(0, 3).join(' · ')}</p>}
          {converted && <p role="status">{t('manual.ai.converted')}</p>}
        </form>
        <p className="hint">{t('manual.ai.update')}</p>
      </section>
      <section className="manual-sample" aria-labelledby="ai-agents">
        <h2 id="ai-agents">Codex · Claude Code</h2>
        <p className="hint">{t('manual.ai.agents')}</p>
        <ul className="manual-steps">
          <li>{t('manual.ai.codex')}</li>
          <li>{t('manual.ai.claudeCode')}</li>
        </ul>
        <button type="button" className="chip-button" onClick={async () => {
          setSkillError(false);
          try {
            await actions.downloadSkill();
          } catch {
            setSkillError(true);
          }
        }}><Icon name="download" size={14} />{t('manual.ai.downloadSkill')}</button>
        {skillError && <p role="alert">{t('manual.ai.skillError')}</p>}
      </section>
    </section>
  );
}
