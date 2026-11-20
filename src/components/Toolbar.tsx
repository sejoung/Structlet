import type { Language, Translate } from '../i18n/messages';
import { Icon } from './ui/Icon';
import { Menu } from './ui/Menu';
import { IconButton, Segmented } from './ui/controls';

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
  onSample(): void;
  onTitle(title: string): void;
  onLanguage(language: Language): void;
  onView(view: ViewMode): void;
  onTheme(theme: ThemeChoice): void;
  onIconPacks(): void;
  onShortcuts(): void;
  onLeftPanel(open: boolean): void;
  onRightPanel(open: boolean): void;
  /** Hides both side panels, or shows both when they are hidden. */
  onTogglePanels(): void;
  onPresent(on: boolean): void;
}

interface ToolbarProps extends ToolbarActions {
  t: Translate;
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  language: Language;
  view: ViewMode;
  theme: ThemeChoice;
  fileName: string | null;
  leftOpen: boolean;
  rightOpen: boolean;
  presenting: boolean;
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** Top bar: document on the left, editing in the middle, output on the right. */
export function Toolbar(props: ToolbarProps) {
  const { t } = props;
  return (
    <header className="topbar" role="toolbar" aria-label="Structlet">
      <div className="topbar-start">
        <div className="brand" aria-label="Structlet">
          <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
            <rect x="5" y="5" width="5" height="5" rx="1.2" fill="currentColor" />
            <rect x="11" y="10.5" width="4.5" height="4.5" rx="1.2" fill="currentColor" opacity="0.55" />
          </svg>
        </div>
        <Menu
          testId="menu-file"
          label={<>{t('menu.file')}<Icon name="chevronDown" size={14} /></>}
          items={[
            { id: 'tb-new', label: t('toolbar.new'), icon: 'newFile', onSelect: props.onNew },
            { id: 'tb-open', label: t('toolbar.open'), icon: 'open', shortcut: `${mod}O`, onSelect: props.onOpen },
            { id: 'tb-import', label: t('toolbar.import'), icon: 'import', onSelect: props.onImport },
            { id: 'tb-save', label: t('toolbar.save'), icon: 'save', shortcut: `${mod}S`, separated: true, onSelect: props.onSave },
            { id: 'tb-save-as', label: t('toolbar.saveAs'), shortcut: `⇧${mod}S`, onSelect: props.onSaveAs },
            { id: 'tb-sample', label: t('toolbar.sample'), separated: true, onSelect: props.onSample },
          ]}
        />
        <div className="doc-title">
          <input className="title-input" aria-label={t('toolbar.title')} value={props.title} onChange={(e) => props.onTitle(e.target.value)} spellCheck={false} />
          <span className={`save-state${props.dirty ? ' saving' : ''}`} data-testid="save-status" title={props.fileName ?? t('status.saved')}>
            <span className="save-dot" aria-hidden="true" />
            {props.dirty ? t('save.state.saving') : t('save.state.saved')}
          </span>
        </div>
      </div>
      <div className="topbar-center">
        {props.presenting ? (
          <button type="button" className="present-exit" onClick={() => props.onPresent(false)} data-testid="exit-present">
            {t('view.exit')} <kbd>Esc</kbd>
          </button>
        ) : (
        <>
        <IconButton icon="undo" label={`${t('toolbar.undo')} (${mod}Z)`} onClick={props.onUndo} disabled={!props.canUndo} testId="tb-undo" />
        <IconButton icon="redo" label={`${t('toolbar.redo')} (⇧${mod}Z)`} onClick={props.onRedo} disabled={!props.canRedo} testId="tb-redo" />
        <span className="topbar-divider" aria-hidden="true" />
        <Segmented
          label={t('toolbar.view')}
          value={props.view}
          onChange={props.onView}
          testId="tb-view"
          options={[
            { value: '2d', label: t('toolbar.view.2d') },
            { value: 'isometric', label: t('toolbar.view.isometric') },
          ]}
        />
        <IconButton icon="present" label={`${t('view.present')} (${mod}.)`} onClick={() => props.onPresent(true)} testId="tb-present" />
        </>
        )}
      </div>
      <div className="topbar-end">
        <div className="panel-toggles" role="group" aria-label={t('panels.label')}>
          <IconButton icon="panelLeft" label={props.leftOpen ? t('panels.left.hide') : t('panels.left.show')} pressed={props.leftOpen} disabled={props.presenting} onClick={() => props.onLeftPanel(!props.leftOpen)} testId="toggle-left" />
          <IconButton icon="panelRight" label={props.rightOpen ? t('panels.right.hide') : t('panels.right.show')} pressed={props.rightOpen} disabled={props.presenting} onClick={() => props.onRightPanel(!props.rightOpen)} testId="toggle-right" />
          <IconButton
            icon={!props.leftOpen && !props.rightOpen ? 'unfocus' : 'focus'}
            label={`${!props.leftOpen && !props.rightOpen ? t('panels.all.show') : t('panels.all.hide')} (${mod}\\)`}
            disabled={props.presenting}
            onClick={props.onTogglePanels}
            testId="toggle-panels"
          />
        </div>
        <span className="topbar-divider" aria-hidden="true" />
        <IconButton icon="keyboard" label={t('menu.shortcuts')} onClick={props.onShortcuts} testId="tb-shortcuts" />
        <Menu
          testId="menu-settings"
          align="end"
          ariaLabel={t('menu.settings')}
          className="icon-menu"
          label={<Icon name="settings" />}
          items={[
            { id: 'tb-icon-packs', label: t('toolbar.iconPacks'), icon: 'pack', onSelect: props.onIconPacks },
            ...(['system', 'light', 'dark'] as const).map((v, i) => ({ id: `tb-theme-${v}`, label: t(`toolbar.theme.${v}`), checked: props.theme === v, heading: i === 0 ? t('menu.theme') : undefined, separated: i === 0, onSelect: () => props.onTheme(v) })),
            ...(['ko', 'en'] as const).map((l, i) => ({ id: `tb-lang-${l}`, label: l === 'ko' ? '한국어' : 'English', checked: props.language === l, heading: i === 0 ? t('menu.language') : undefined, separated: i === 0, onSelect: () => props.onLanguage(l) })),
          ]}
        />
        <Menu
          testId="menu-export"
          align="end"
          className="primary-menu"
          label={<><Icon name="download" />{t('menu.export')}</>}
          items={[
            { id: 'tb-svg', label: t('menu.exportSvg'), onSelect: props.onExportSvg },
            { id: 'tb-png', label: t('menu.exportPng'), onSelect: props.onExportPng },
          ]}
        />
      </div>
    </header>
  );
}
