import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Editor } from '../../application';
import { indexDocument, type Document, type Id } from '../../domain';
import { AREA_STROKE, type Appearance } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { GlyphIcon, ServiceTile } from '../GlyphIcon';
import { Icon } from '../ui/Icon';


type Row =
  | { kind: 'box'; id: Id; depth: number; guides: string[]; area: boolean; hasChildren: boolean }
  | { kind: 'group'; id: 'edges' | 'annotations'; count: number }
  | { kind: 'item'; id: Id; group: 'edges' | 'annotations' };

const DRAG_TYPE = 'application/x-structlet-layer';

interface Props {
  t: Translate;
  editor: Editor;
  doc: Document;
  selection: readonly Id[];
  appearance: Appearance;
}

export function LayersPanel({ t, editor, doc, selection, appearance }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['edges', 'annotations']));
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [dropTarget, setDropTarget] = useState<Id | 'root' | null>(null);
  const tree = useRef<HTMLDivElement>(null);
  const index = indexDocument(doc);
  const selected = new Set(selection);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (parent: Id | null, depth: number, guides: string[]) => {
      const kids = index.children.get(parent) ?? [];
      const ordered = [...kids.filter((k) => index.containers.has(k)), ...kids.filter((k) => index.nodes.has(k))];
      for (const id of ordered) {
        const area = index.containers.get(id);
        const hasChildren = (index.children.get(id) ?? []).length > 0;
        out.push({ kind: 'box', id, depth, guides, area: !!area, hasChildren });
        if (area && hasChildren && !collapsed.has(id)) walk(id, depth + 1, [...guides, AREA_STROKE[area.style.color] ?? AREA_STROKE.gray!]);
      }
    };
    walk(null, 0, []);
    for (const group of ['edges', 'annotations'] as const) {
      const list = doc[group];
      if (!list.length) continue;
      out.push({ kind: 'group', id: group, count: list.length });
      if (!collapsed.has(group)) for (const o of list) out.push({ kind: 'item', id: o.id, group });
    }
    return out;
  }, [doc, index, collapsed]);

  useEffect(() => {
    const last = selection[selection.length - 1];
    if (last) tree.current?.querySelector(`[data-layer-id="${CSS.escape(last)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selection]);

  const toggle = (id: string) => setCollapsed((c) => {
    const next = new Set(c);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const choose = (id: Id, additive: boolean) => editor.session.select(additive ? (selected.has(id) ? selection.filter((x) => x !== id) : [...selection, id]) : [id]);

  const labelOf = (id: Id): string => {
    const o = index.nodes.get(id) ?? index.containers.get(id);
    if (o) return o.label.split('\n')[0] || t(index.containers.has(id) ? `area.${index.containers.get(id)!.kind}` : 'props.node');
    const e = index.edges.get(id);
    if (e) {
      const end = (x: typeof e.source) => (x.kind === 'attached' ? (index.nodes.get(x.objectId) ?? index.containers.get(x.objectId))?.label.split('\n')[0] ?? '?' : '·');
      return e.label ? `${e.label} (${end(e.source)} → ${end(e.target)})` : `${end(e.source)} → ${end(e.target)}`;
    }
    return index.annotations.get(id)?.text.split('\n')[0] || id;
  };

  const rawLabel = (id: Id): string => (index.nodes.get(id) ?? index.containers.get(id) ?? index.edges.get(id))?.label ?? index.annotations.get(id)?.text ?? '';

  const drop = (e: DragEvent, target: Id | null) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (!id || id === target) return;
    const moving = selected.has(id) ? selection.filter((x) => index.nodes.has(x) || index.containers.has(x)) : [id];
    editor.setParent(moving, target);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    const ids = rows.filter((r) => r.kind !== 'group').map((r) => r.id as Id);
    const current = ids.indexOf(selection[selection.length - 1] ?? '');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = ids[Math.min(ids.length - 1, Math.max(0, current + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) editor.session.select([next]);
    }
    const id = selection[0];
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && id && index.containers.has(id)) {
      e.preventDefault();
      if ((e.key === 'ArrowLeft') !== collapsed.has(id)) toggle(id);
    }
    if ((e.key === 'Enter' || e.key === 'F2') && selection.length === 1) {
      e.preventDefault();
      e.stopPropagation();
      setRenaming(selection[0]!);
    }
  };

  if (rows.length === 0) return <div className="panel-body"><p className="empty-note">{t('layers.empty')}</p></div>;

  return (
    <div className="panel-body layers-panel">
      <div
        className={`layer-root${dropTarget === 'root' ? ' drop' : ''}`}
        onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && (e.preventDefault(), setDropTarget('root'))}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, null)}
        data-testid="layer-root"
      >
        {t('layers.canvas')}
      </div>
      <div className="tree" role="tree" aria-label={t('rail.layers')} aria-multiselectable="true" ref={tree} tabIndex={0} onKeyDown={onKey} data-testid="layers">
        {rows.map((r) => {
          if (r.kind === 'group') {
            return (
              <button type="button" key={r.id} className="layer-group" aria-expanded={!collapsed.has(r.id)} onClick={() => toggle(r.id)}>
                <Icon name={collapsed.has(r.id) ? 'chevronRight' : 'chevronDown'} size={14} />
                {t(r.id === 'edges' ? 'layers.edges' : 'layers.annotations')}
                <span className="count">{r.count}</span>
              </button>
            );
          }
          const isBox = r.kind === 'box';
          const area = isBox ? index.containers.get(r.id) : undefined;
          const node = isBox ? index.nodes.get(r.id) : undefined;
          const look = node ? (appearance.service(node.serviceId) ?? appearance.fallback) : undefined;
          const color = area ? (AREA_STROKE[area.style.color] ?? AREA_STROKE.gray!) : undefined;
          const glyph = area ? appearance.containerGlyph(area.kind) : null;
          const locked = (node ?? area)?.locked;
          return (
            <div
              key={r.id}
              role="treeitem"
              aria-level={isBox ? r.depth + 1 : 2}
              aria-selected={selected.has(r.id)}
              aria-expanded={area && r.kind === 'box' && r.hasChildren ? !collapsed.has(r.id) : undefined}
              data-layer-id={r.id}
              className={`layer-row${selected.has(r.id) ? ' selected' : ''}${dropTarget === r.id ? ' drop' : ''}${isBox ? '' : ' leaf'}`}
              draggable={isBox && !locked}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, r.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => area && e.dataTransfer.types.includes(DRAG_TYPE) && (e.preventDefault(), setDropTarget(r.id))}
              onDragLeave={() => setDropTarget((d) => (d === r.id ? null : d))}
              onDrop={(e) => area && drop(e, r.id)}
              onClick={(e) => choose(r.id, e.shiftKey || e.metaKey || e.ctrlKey)}
              onDoubleClick={() => setRenaming(r.id)}
            >
              {isBox && r.guides.map((g, i) => <span key={i} className="tree-guide" style={{ borderColor: g }} aria-hidden="true" />)}
              {area && r.kind === 'box' && r.hasChildren ? (
                <button type="button" className="twisty" aria-label={collapsed.has(r.id) ? t('layers.expand') : t('layers.collapse')} onClick={(e) => (e.stopPropagation(), toggle(r.id))}>
                  <Icon name={collapsed.has(r.id) ? 'chevronRight' : 'chevronDown'} size={14} />
                </button>
              ) : (
                <span className="twisty" aria-hidden="true" />
              )}
              <span className="layer-icon" aria-hidden="true">
                {area ? (
                  <span className="area-tag" style={{ background: color }}>{glyph && <GlyphIcon glyph={glyph} size={10} color="#fff" strokeWidth={2.2} />}</span>
                ) : look ? (
                  look.image ? <img src={look.image} alt="" width={16} height={16} /> : <ServiceTile glyph={look.glyph} color={look.color} size={16} />
                ) : (
                  <Icon name={r.kind === 'item' && r.group === 'edges' ? 'link' : 'notes'} size={14} />
                )}
              </span>
              {renaming === r.id ? (
                <input
                  className="layer-rename"
                  autoFocus
                  defaultValue={rawLabel(r.id)}
                  aria-label={t('props.label')}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      editor.rename(r.id, e.currentTarget.value);
                      setRenaming(null);
                      tree.current?.focus();
                    }
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onBlur={(e) => {
                    if (e.currentTarget.value !== rawLabel(r.id)) editor.rename(r.id, e.currentTarget.value);
                    setRenaming(null);
                  }}
                />
              ) : (
                <span className="layer-label" style={area ? { color } : undefined}>{labelOf(r.id)}</span>
              )}
              {locked && <span className="layer-lock" aria-label={t('props.locked')}><Icon name="lock" size={12} /></span>}
            </div>
          );
        })}
      </div>
      <p className="panel-foot">{t('layers.dropHint')}</p>
    </div>
  );
}
