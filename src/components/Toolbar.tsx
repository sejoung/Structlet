import type { Language, Translate } from '../i18n/messages';
import { DriveButton } from './drive/DriveButton';
import type { DriveActions, DriveView } from './drive/types';
import { Icon } from './ui/Icon';
import { Menu, type MenuItem } from './ui/Menu';
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

/** Google Drive in this build: working, or configured but unusable here (a page opened from a file). */
export type DriveBar =
  | { readonly kind: 'ready'; readonly view: DriveView; readonly actions: DriveActions; onDetails(): void; onConflict(): void; onDisconnect(): void }
  | { readonly kind: 'web-only' };

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
  /** Checks that found something; shown on the inspector toggle while the inspector is folded. */
  findingCount: number;
  drive?: DriveBar;
  /** Usage statistics in this build: the current choice and how to change it. */
  stats?: { readonly granted: boolean; toggle(): void };
  presenting: boolean;
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function driveItems(t: Translate, drive: DriveBar | undefined): MenuItem[] {
  if (!drive) return [];
  if (drive.kind === 'web-only') return [{ id: 'drive-web-only', label: t('drive.webOnly'), disabled: true, separated: true, heading: t('drive.section'), onSelect: () => undefined }];
  const { view, actions } = drive;
  const linked = view.state.status !== 'unlinked';
  const items: MenuItem[] = [];
  if (!view.connected) items.push({ id: 'drive-connect', label: t('drive.connect'), onSelect: actions.connect });
  items.push({ id: 'drive-open', label: t('drive.open'), onSelect: actions.open });
  items.push({ id: 'drive-save', label: t('drive.saveTo'), onSelect: actions.saveToFolder });
  if (linked) items.push({ id: 'drive-copy', label: t('drive.saveCopy'), onSelect: actions.saveCopy }, { id: 'drive-stop', label: t('drive.stop'), onSelect: actions.stop });
  if (view.connected || linked) items.push({ id: 'drive-disconnect', label: t('drive.disconnect'), onSelect: drive.onDisconnect });
  items[0] = { ...items[0]!, separated: true, heading: t('drive.section') };
  return items;
}

/** Top bar: the document and where it is saved on the left, editing in the middle, layout, tools and output on the right. */
export function Toolbar(props: ToolbarProps) {
  const { t } = props;
  const drive = props.drive?.kind === 'ready' ? props.drive : undefined;
  // Linked to a Drive file, the Drive status is the save status; otherwise it is this browser.
  const driveLinked = drive !== undefined && drive.view.state.status !== 'unlinked';
  const both = t('panels.both', { key: `${mod}\\` });
  // Folded, the inspector still says when the checks found something.
  const flagged = !props.rightOpen && !props.presenting && props.findingCount > 0;
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
          onOpen={drive?.actions.prepare}
          label={<>{t('menu.file')}<Icon name="chevronDown" size={14} /></>}
          items={[
            { id: 'tb-new', label: t('toolbar.new'), icon: 'newFile', onSelect: props.onNew },
            { id: 'tb-open', label: t('toolbar.open'), icon: 'open', shortcut: `${mod}O`, onSelect: props.onOpen },
            { id: 'tb-import', label: t('toolbar.import'), icon: 'import', onSelect: props.onImport },
            { id: 'tb-save', label: t('toolbar.save'), icon: 'save', shortcut: `${mod}S`, separated: true, onSelect: props.onSave },
            { id: 'tb-save-as', label: t('toolbar.saveAs'), shortcut: `⇧${mod}S`, onSelect: props.onSaveAs },
            { id: 'tb-sample', label: t('toolbar.sample'), separated: true, onSelect: props.onSample },
            ...driveItems(t, props.drive),
          ]}
        />
        <div className="doc-title">
          {/* The hidden copy of the title sizes the field, so the save status sits right after it. */}
          <span className="title-field" data-value={props.title}>
            <input className="title-input" size={1} aria-label={t('toolbar.title')} value={props.title} onChange={(e) => props.onTitle(e.target.value)} spellCheck={false} />
          </span>
          <div className="save-status">
            {!driveLinked && (
              <span
                className={`save-state${props.dirty ? ' saving' : ''}`}
                data-testid="save-status"
                title={props.fileName ? `${t('status.saved')} · ${props.fileName}` : t('status.saved')}
              >
                <Icon name="local" size={14} />
                <span className="status-label">{props.dirty ? t('save.state.saving') : t('save.state.saved')}</span>
              </span>
            )}
            {drive && <DriveButton t={t} view={drive.view} actions={drive.actions} onDetails={drive.onDetails} onConflict={drive.onConflict} />}
          </div>
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
        </>
        )}
      </div>
      <div className="topbar-end">
        <div className="panel-toggles" role="group" aria-label={t('panels.label')}>
          <IconButton icon="panelLeft" label={`${props.leftOpen ? t('panels.left.hide') : t('panels.left.show')} (${both})`} pressed={props.leftOpen} disabled={props.presenting} onClick={() => props.onLeftPanel(!props.leftOpen)} testId="toggle-left" />
          <span className="badge-anchor">
            <IconButton icon="panelRight" label={`${props.rightOpen ? t('panels.right.hide') : t('panels.right.show')}${flagged ? ` · ${t('panels.findings', { count: props.findingCount })}` : ''} (I · ${both})`} pressed={props.rightOpen} disabled={props.presenting} onClick={() => props.onRightPanel(!props.rightOpen)} testId="toggle-right" />
            {flagged && <span className="toggle-badge" data-testid="findings-badge" aria-hidden="true">{props.findingCount > 9 ? '9+' : props.findingCount}</span>}
          </span>
        </div>
        <span className="topbar-divider" aria-hidden="true" />
        <IconButton icon="present" label={`${props.presenting ? t('view.exit') : t('view.present')} (${mod}.)`} pressed={props.presenting} onClick={() => props.onPresent(!props.presenting)} testId="tb-present" />
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
            ...(props.stats ? [{ id: 'tb-usage-stats', label: t('consent.setting'), checked: props.stats.granted, separated: true, onSelect: props.stats.toggle }] : []),
          ]}
        />
        <span className="topbar-divider" aria-hidden="true" />
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
