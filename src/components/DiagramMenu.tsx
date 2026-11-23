import { LAYOUT_MODES, type LayoutMode } from '../engine';
import type { Translate } from '../i18n/messages';
import { Icon } from './ui/Icon';
import { Menu } from './ui/Menu';

export interface DiagramMenuProps {
  active: boolean;
  canFoldTop: boolean;
  canFoldMiddle: boolean;
  hasObjects: boolean;
  layout: LayoutMode | null;
  foldTop(): void;
  foldMiddle(): void;
  expandAll(): void;
  arrange(mode: LayoutMode | null): void;
  layoutAll(mode: LayoutMode): void;
}

export function DiagramMenu({ t, diagram }: { t: Translate; diagram: DiagramMenuProps }) {
  return (
    <Menu
      testId="menu-diagram"
      ariaLabel={t('summary.menu')}
      label={<><Icon name="group" />{t('summary.menu')}<Icon name="chevronDown" size={14} /></>}
      items={[
        { id: 'fold-top', label: t('summary.foldTop'), disabled: !diagram.canFoldTop, onSelect: diagram.foldTop },
        { id: 'fold-middle', label: t('summary.foldMiddle'), disabled: !diagram.canFoldMiddle, onSelect: diagram.foldMiddle },
        { id: 'expand-all', label: t('summary.expandAll'), disabled: !diagram.active, onSelect: diagram.expandAll },
        ...LAYOUT_MODES.map((mode, i) => ({
          id: `layout-summary-${mode}`, label: t(`props.layout.${mode}`), disabled: !diagram.active,
          checked: diagram.layout === mode, separated: i === 0, heading: i === 0 ? t('summary.layout') : undefined,
          onSelect: () => diagram.arrange(mode),
        })),
        { id: 'layout-summary-reset', label: t('summary.resetLayout'), disabled: !diagram.active || diagram.layout === null, onSelect: () => diagram.arrange(null) },
        ...LAYOUT_MODES.map((mode, i) => ({
          id: `layout-document-${mode}`, label: t(`props.layout.${mode}`), disabled: !diagram.hasObjects,
          separated: i === 0, heading: i === 0 ? t('summary.layoutAll') : undefined,
          onSelect: () => diagram.layoutAll(mode),
        })),
      ]}
    />
  );
}
