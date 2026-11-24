import { DIAGRAM_CONTENTS, LAYOUT_MODES, type DiagramContent, type LayoutMode } from '../engine';
import type { Translate } from '../i18n/messages';
import { Icon } from './ui/Icon';
import { Menu } from './ui/Menu';

export interface DiagramMenuProps {
  active: boolean;
  hasFolds: boolean;
  content: DiagramContent;
  availableContents: readonly DiagramContent[];
  canFoldTop: boolean;
  canFoldMiddle: boolean;
  hasObjects: boolean;
  layout: LayoutMode | null;
  setContent(content: DiagramContent): void;
  recommend(): void;
  foldTop(): void;
  foldMiddle(): void;
  expandAll(): void;
  arrange(mode: LayoutMode | null): void;
  layoutAll(mode: LayoutMode): void;
}

export function DiagramContentMenu({ t, diagram }: { t: Translate; diagram: DiagramMenuProps }) {
  return (
    <Menu
      testId="menu-diagram-content"
      className="diagram-content-menu"
      align="end"
      label={<>{t(`diagramContent.${diagram.content}`)}<Icon name="chevronDown" size={14} /></>}
      items={DIAGRAM_CONTENTS.map((content) => ({
        id: `diagram-content-${content}`, label: t(`diagramContent.${content}`), checked: diagram.content === content,
        disabled: !diagram.availableContents.includes(content), onSelect: () => diagram.setContent(content),
      }))}
    />
  );
}

export function DiagramMenu({ t, diagram }: { t: Translate; diagram: DiagramMenuProps }) {
  return (
    <Menu
      testId="menu-diagram"
      ariaLabel={t('summary.menu')}
      label={<><Icon name="group" />{t('summary.menu')}<Icon name="chevronDown" size={14} /></>}
      items={[
        { id: 'recommend-summary', label: t('diagramSummary.recommend'), disabled: !diagram.hasObjects, onSelect: diagram.recommend },
        { id: 'fold-top', label: t('summary.foldTop'), disabled: !diagram.canFoldTop, separated: true, onSelect: diagram.foldTop },
        { id: 'fold-middle', label: t('summary.foldMiddle'), disabled: !diagram.canFoldMiddle, onSelect: diagram.foldMiddle },
        { id: 'expand-all', label: t('summary.expandAll'), disabled: !diagram.hasFolds, onSelect: diagram.expandAll },
        ...LAYOUT_MODES.map((mode, i) => ({
          id: `layout-summary-${mode}`, label: t(`props.layout.${mode}`), disabled: !diagram.active,
          checked: diagram.layout === mode, separated: i === 0, heading: i === 0 ? t('summary.layout') : undefined,
          onSelect: () => diagram.arrange(mode),
        })),
        { id: 'layout-summary-reset', label: t('summary.resetLayout'), disabled: !diagram.active || diagram.layout === null, onSelect: () => diagram.arrange(null) },
        ...LAYOUT_MODES.map((mode, i) => ({
          id: `layout-document-${mode}`, label: t(`props.layout.${mode}`), disabled: !diagram.hasObjects || diagram.content !== 'all',
          separated: i === 0, heading: i === 0 ? t('summary.layoutAll') : undefined,
          onSelect: () => diagram.layoutAll(mode),
        })),
      ]}
    />
  );
}
