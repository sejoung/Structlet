import { useLayoutEffect, useRef } from 'react';
import type { Editor } from '../../application';
import { getBox, indexDocument, topmost, type Document, type Id, type Point } from '../../domain';
import { alignDeltas, LAYOUT_MODES, type AlignMode, type Scene } from '../../engine';
import type { Translate } from '../../i18n/messages';
import type { DiagramMenuProps } from '../DiagramMenu';
import type { PanelActions } from '../properties/sections';

export interface ContextActions {
  diagram: DiagramMenuProps;
  actions: PanelActions;
  paste(at: Point): void;
}

export interface ContextRequest {
  screen: Point;
  world: Point;
  ids: readonly Id[];
  docId: Id;
}

interface Item {
  label: string;
  run(): void;
  disabled?: boolean;
}

interface Group {
  title?: string;
  items: Item[];
}

interface Props extends ContextActions {
  t: Translate;
  doc: Document;
  scene: Scene;
  editor: Editor;
  request: ContextRequest;
  fit(): void;
  fitGroup(id: Id): void;
  edit?(id: Id): void;
  inspect?(id: Id): void;
  toggle(id: Id): void;
  dismiss(restoreFocus: boolean): void;
  readOnly?: boolean;
  rotate?(step: -1 | 1): void;
  flow?: { canStart(id: Id): boolean; start(id: Id): void };
}

const ALIGNMENTS: readonly AlignMode[] = ['left', 'center', 'right', 'top', 'middle', 'bottom'];

function groups({ t, doc, scene, editor, diagram, actions, paste, request, fit, fitGroup, edit, inspect, toggle, readOnly, rotate, flow }: Props): Group[] {
  const index = indexDocument(doc);
  const ids = request.ids;
  const id = ids.length === 1 ? ids[0]! : null;
  const area = id ? index.containers.get(id) : undefined;
  const edge = id ? index.edges.get(id) : undefined;
  const folded = !!area && scene.nodes.some((node) => node.summary && node.id === area.id);
  const layout = (title: string, run: (mode: typeof LAYOUT_MODES[number]) => void): Group => ({
    title, items: LAYOUT_MODES.map((mode) => ({ label: t(`props.layout.${mode}`), run: () => run(mode) })),
  });
  const result: Group[] = [];
  const add = (...items: Item[]) => result.push({ items });
  if (id && inspect && getBox(doc, id)?.infrastructure) add({ label: t('infra.show'), run: () => inspect(id) });
  if (id && flow?.canStart(id)) add({ label: t('flow.start'), run: () => flow.start(id) });
  if (area && (folded || index.children.get(area.id)?.some((child) => scene.rects.has(child)))) {
    const label = t(folded ? 'summary.expandArea' : 'summary.foldArea', { name: area.label || t(`area.${area.kind}`) });
    add({ label, run: () => toggle(area.id) });
  }
  if (area && scene.rects.has(area.id)) add({ label: t('zoom.fitGroup'), run: () => fitGroup(area.id) });
  if (ids.length === 0 || diagram.active || readOnly) {
    add(
      ...(!diagram.active && !readOnly ? [{ label: t('context.paste'), run: () => paste(request.world) }] : []),
      { label: t('zoom.fit'), run: fit },
      { label: t('summary.foldTop'), run: diagram.foldTop, disabled: !diagram.canFoldTop },
      { label: t('summary.foldMiddle'), run: diagram.foldMiddle, disabled: !diagram.canFoldMiddle },
      ...(diagram.hasFolds ? [{ label: t('summary.expandAll'), run: diagram.expandAll }] : []),
    );
    if (diagram.active) result.push(layout(t('summary.layout'), diagram.arrange));
    if (rotate) add({ label: t('iso.rotateLeft'), run: () => rotate(-1) }, { label: t('iso.rotateRight'), run: () => rotate(1) });
    if (diagram.hasObjects && diagram.content === 'all' && !ids.length && !readOnly) result.push(layout(t('summary.layoutAll'), diagram.layoutAll));
    return result;
  }

  const boxes = topmost(doc, ids.filter((selected) => getBox(doc, selected)));
  if (id && edit) add({ label: t(edge ? 'context.edgeLabel' : 'sc.rename'), run: () => edit(id) });
  if (edge) add(
    { label: t('props.swap'), run: () => editor.reverseEdge(edge.id) },
    { label: t('props.resetRoute'), disabled: edge.routingMode !== 'manual', run: () => editor.resetRoute(edge.id) },
  );
  if (boxes.length) {
    const locked = boxes.every((selected) => getBox(doc, selected)?.locked);
    add({ label: t(locked ? 'props.unlock' : 'props.lock'), run: () => editor.setLocked(boxes, !locked) });
  }
  add(
    { label: t('props.duplicate'), run: () => editor.duplicate(ids), disabled: ids.every((selected) => index.edges.has(selected)) },
    { label: t('props.delete'), run: () => editor.delete(ids) },
  );
  if (area && (index.children.get(area.id)?.length ?? 0) >= 2) result.push(layout(t('props.layoutContents'), (mode) => actions.layoutContents(area.id, mode)));
  if (boxes.length >= 2) {
    add({ label: t('props.wrap'), run: () => editor.wrapInArea(boxes, 'custom', t('area.custom')) });
    const movable = boxes.flatMap((id) => {
      const rect = scene.rects.get(id);
      return rect && !getBox(doc, id)?.locked ? [{ id, rect }] : [];
    });
    const parents = movable.map(({ id }) => getBox(doc, id)?.parentId);
    if (new Set(parents).size < parents.length) result.push(layout(t('props.layout'), (mode) => actions.layout(boxes, mode)));
    if (movable.length >= 2) result.push({
      title: t('props.align'),
      items: ALIGNMENTS.map((mode) => ({ label: t(`context.align.${mode}`), run: () => editor.moveEach(alignDeltas(movable, mode)) })),
    });
  }
  return result;
}

export function ContextMenu(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { request, dismiss } = props;
  const sections = groups(props);
  useLayoutEffect(() => {
    const menu = ref.current!;
    menu.style.left = `${Math.max(8, Math.min(request.screen.x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(request.screen.y, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) dismiss(false);
    };
    const resize = () => dismiss(true);
    window.addEventListener('pointerdown', outside);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', resize);
    };
  }, [request, dismiss]);

  return (
    <div ref={ref} className="canvas-context-menu" role="menu" aria-label={props.t('context.menu')} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          dismiss(true);
          return;
        }
        const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        if (!step && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (current + step + items.length) % items.length;
        items[next]?.focus();
      }}>
      {sections.map((section, i) => (
        <div className="canvas-context-group" key={i} role="group" aria-label={section.title}>
          {section.title && <div className="menu-heading">{section.title}</div>}
          {section.items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className="menu-item" disabled={item.disabled} onClick={() => { dismiss(true); item.run(); }}>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
