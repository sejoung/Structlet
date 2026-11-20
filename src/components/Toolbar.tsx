import type { Language, Translate } from '../i18n/messages';

export type ViewMode = '2d' | 'isometric';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface ToolbarActions {
  onNew(): void;
  onOpen(): void;
  onImport(): void;
  onSave(): void;
  onSaveAs(): void;
  onExportSvg(): void;
  onExportPng(): void;
  onUndo(): void;
  onRedo(): void;
  onFit(): void;
  onSample(): void;
  onTitle(title: string): void;
  onLanguage(language: Language): void;
  onView(view: ViewMode): void;
  onTheme(theme: ThemeChoice): void;
  onIconPacks(): void;
}

interface ToolbarProps extends ToolbarActions {
  t: Translate;
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  language: Language;
  view: ViewMode;
  theme: ThemeChoice;
  fileName: string | null;
}

export function Toolbar(props: ToolbarProps) {
  const { t } = props;
  return (
    <header className="toolbar" role="toolbar" aria-label="Structlet">
      <div className="brand" aria-hidden="true">
        <span className="brand-mark" />
        Structlet
      </div>
      <input className="title-input" aria-label={t('toolbar.title')} value={props.title} onChange={(e) => props.onTitle(e.target.value)} spellCheck={false} title={props.fileName ?? undefined} />
      <div className="toolbar-group">
        <button type="button" data-testid="tb-new" onClick={props.onNew}>{t('toolbar.new')}</button>
        <button type="button" data-testid="tb-open" onClick={props.onOpen} title="⌘O">{t('toolbar.open')}</button>
        <button type="button" data-testid="tb-import" onClick={props.onImport} title={t('toolbar.importHint')}>{t('toolbar.import')}</button>
        <button type="button" data-testid="tb-save" onClick={props.onSave} title={props.fileName ? `⌘S → ${props.fileName}` : '⌘S'}>{t('toolbar.save')}</button>
        <button type="button" data-testid="tb-save-as" onClick={props.onSaveAs} title="⇧⌘S">{t('toolbar.saveAs')}</button>
      </div>
      <div className="toolbar-group" aria-label={t('toolbar.export')}>
        <span className="toolbar-label">{t('toolbar.export')}</span>
        <button type="button" data-testid="tb-svg" onClick={props.onExportSvg}>{t('toolbar.exportSvg')}</button>
        <button type="button" data-testid="tb-png" onClick={props.onExportPng}>{t('toolbar.exportPng')}</button>
      </div>
      <div className="toolbar-group">
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="⌘Z" aria-label={t('toolbar.undo')}>↶</button>
        <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="⇧⌘Z" aria-label={t('toolbar.redo')}>↷</button>
        <button type="button" data-testid="tb-fit" onClick={props.onFit} title="⌘0">{t('toolbar.fit')}</button>
      </div>
      <div className="toolbar-group segmented" role="group" aria-label={t('toolbar.view')}>
        {(['2d', 'isometric'] as const).map((v) => (
          <button type="button" key={v} data-testid={`tb-view-${v}`} aria-pressed={props.view === v} onClick={() => props.onView(v)}>
            {t(`toolbar.view.${v}`)}
          </button>
        ))}
      </div>
      <div className="toolbar-spacer" />
      <button type="button" className="ghost" data-testid="tb-sample" onClick={props.onSample}>{t('toolbar.sample')}</button>
      <button type="button" className="ghost" data-testid="tb-icon-packs" onClick={props.onIconPacks}>{t('toolbar.iconPacks')}</button>
      <select aria-label={t('toolbar.theme')} data-testid="tb-theme" value={props.theme} onChange={(e) => props.onTheme(e.target.value as ThemeChoice)}>
        {(['system', 'light', 'dark'] as const).map((v) => (
          <option key={v} value={v}>{t(`toolbar.theme.${v}`)}</option>
        ))}
      </select>
      <select aria-label={t('toolbar.language')} value={props.language} onChange={(e) => props.onLanguage(e.target.value as Language)}>
        <option value="ko">한국어</option>
        <option value="en">English</option>
      </select>
    </header>
  );
}
