import type { Editor } from '../../application';
import {
  AREA_COLORS,
  CONTAINER_KINDS,
  CONTAINER_PRESETS,
  descendants,
  depth,
  SIDES,
  type Annotation,
  type ArrowHeads,
  type Container,
  type ContainerKind,
  type Document,
  type Edge,
  type EdgeShape,
  type Endpoint,
  type Id,
  type Node,
  type Rect,
  type Side,
} from '../../domain';
import { AREA_STROKE } from '../../engine';
import type { Translate } from '../../i18n/messages';
import type { PaletteService } from '../Palette';
import { Buttons, Check, Pair, Select, TextArea } from './fields';

export interface SectionProps {
  t: Translate;
  editor: Editor;
  doc: Document;
  rect: Rect | undefined;
}

function parentOptions(t: Translate, doc: Document, self: Id | null) {
  const blocked = new Set<Id>(self ? [self, ...descendants(doc, self)] : []);
  return [
    { value: '', label: t('props.root') },
    ...doc.containers.filter((c) => !blocked.has(c.id)).map((c) => ({ value: c.id, label: `${'  '.repeat(depth(doc, c.id))}${c.label || t(`area.${c.kind}`)}` })),
  ];
}

function Geometry({ t, editor, id, rect, sized }: { t: Translate; editor: Editor; id: Id; rect: Rect | undefined; sized: boolean }) {
  if (!rect) return null;
  return (
    <>
      <Pair label={t('props.position')} names={['X', 'Y']} a={rect.x} b={rect.y} onA={(v) => editor.move([id], { x: v - rect.x, y: 0 })} onB={(v) => editor.move([id], { x: 0, y: v - rect.y })} />
      {sized && <Pair label={t('props.size')} names={['W', 'H']} a={rect.width} b={rect.height} onA={(v) => editor.setBounds(id, { ...rect, width: v })} onB={(v) => editor.setBounds(id, { ...rect, height: v })} />}
    </>
  );
}

function Common({ t, editor, id, locked }: { t: Translate; editor: Editor; id: Id; locked: boolean }) {
  return (
    <>
      <Check label={t('props.locked')} checked={locked} onChange={(v) => editor.setLocked([id], v)} testId="prop-locked" />
      <Buttons>
        <button type="button" onClick={() => editor.duplicate([id])}>{t('props.duplicate')}</button>
        <button type="button" className="danger" onClick={() => editor.delete([id])}>{t('props.delete')}</button>
      </Buttons>
    </>
  );
}

export function NodeSection({ node, services, ...p }: SectionProps & { node: Node; services: readonly PaletteService[] }) {
  const { t, editor, doc } = p;
  const known = services.some((s) => s.id === node.serviceId);
  const options = [...(known ? [] : [{ value: node.serviceId, label: t('props.unknownService', { id: node.serviceId }) }]), ...services.map((s) => ({ value: s.id, label: s.name }))];
  return (
    <section>
      <h2>{t('props.node')}</h2>
      <TextArea label={t('props.label')} value={node.label} onChange={(v) => editor.rename(node.id, v)} testId="prop-label" />
      <Select label={t('props.service')} value={node.serviceId} options={options} onChange={(v) => editor.update('nodes', node.id, { serviceId: v })} testId="prop-service" />
      <Select label={t('props.parent')} value={node.parentId ?? ''} options={parentOptions(t, doc, null)} onChange={(v) => editor.setParent([node.id], v || null)} testId="prop-parent" />
      <Geometry t={t} editor={editor} id={node.id} rect={p.rect} sized />
      <Common t={t} editor={editor} id={node.id} locked={node.locked} />
    </section>
  );
}

export function ContainerSection({ container: c, ...p }: SectionProps & { container: Container }) {
  const { t, editor, doc } = p;
  return (
    <section>
      <h2>{t('props.area')}</h2>
      <TextArea label={t('props.label')} value={c.label} onChange={(v) => editor.rename(c.id, v)} testId="prop-label" />
      <Select
        label={t('props.kind')}
        value={c.kind}
        options={CONTAINER_KINDS.map((k) => ({ value: k, label: t(`area.${k}`) }))}
        onChange={(kind: ContainerKind) => editor.update('containers', c.id, { kind, style: CONTAINER_PRESETS[kind] })}
      />
      <div className="field">
        <span className="field-label">{t('props.color')}</span>
        <div className="swatches">
          {AREA_COLORS.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={color}
              aria-pressed={c.style.color === color}
              className="swatch"
              style={{ background: AREA_STROKE[color] }}
              onClick={() => editor.update('containers', c.id, { style: { ...c.style, color } })}
            />
          ))}
        </div>
      </div>
      <Check label={t('props.dashed')} checked={c.style.dashed} onChange={(dashed) => editor.update('containers', c.id, { style: { ...c.style, dashed } })} />
      <Check label={t('props.filled')} checked={c.style.filled} onChange={(filled) => editor.update('containers', c.id, { style: { ...c.style, filled } })} />
      <Select label={t('props.parent')} value={c.parentId ?? ''} options={parentOptions(t, doc, c.id)} onChange={(v) => editor.setParent([c.id], v || null)} testId="prop-parent" />
      <Geometry t={t} editor={editor} id={c.id} rect={p.rect} sized />
      <Common t={t} editor={editor} id={c.id} locked={c.locked} />
    </section>
  );
}

function sideValue(end: Endpoint): Side | 'auto' | 'free' {
  return end.kind === 'free' ? 'free' : end.side;
}

export function EdgeSection({ edge, ...p }: SectionProps & { edge: Edge }) {
  const { t, editor } = p;
  const sideOptions = (end: Endpoint) => [
    ...(end.kind === 'free' ? [{ value: 'free' as const, label: t('props.free') }] : []),
    { value: 'auto' as const, label: t('props.side.auto') },
    ...SIDES.map((s) => ({ value: s, label: t(`props.side.${s}`) })),
  ];
  const setSide = (which: 'source' | 'target', side: Side | 'auto' | 'free') => {
    const end = edge[which];
    if (end.kind !== 'attached' || side === 'free') return;
    editor.update('edges', edge.id, { [which]: { ...end, side, offset: side === 'auto' ? null : end.side === side ? end.offset : null } });
  };
  return (
    <section>
      <h2>{t('props.edge')}</h2>
      <TextArea label={t('props.label')} value={edge.label} onChange={(v) => editor.rename(edge.id, v)} testId="prop-label" />
      <Select
        label={t('props.arrow')}
        value={edge.style.arrow}
        options={(['end', 'start', 'both', 'none'] as ArrowHeads[]).map((a) => ({ value: a, label: t(`props.arrow.${a}`) }))}
        onChange={(arrow) => editor.update('edges', edge.id, { style: { ...edge.style, arrow } })}
      />
      <Select
        label={t('props.shape')}
        value={edge.style.shape}
        options={(['orthogonal', 'straight'] as EdgeShape[]).map((s) => ({ value: s, label: t(`props.shape.${s}`) }))}
        onChange={(shape) => editor.update('edges', edge.id, { style: { ...edge.style, shape }, routingMode: 'auto', waypoints: [] })}
      />
      <Check label={t('props.dashed')} checked={edge.style.dashed} onChange={(dashed) => editor.update('edges', edge.id, { style: { ...edge.style, dashed } })} testId="prop-dashed" />
      <Select label={t('props.sourceSide')} value={sideValue(edge.source)} options={sideOptions(edge.source)} onChange={(v) => setSide('source', v)} />
      <Select label={t('props.targetSide')} value={sideValue(edge.target)} options={sideOptions(edge.target)} onChange={(v) => setSide('target', v)} />
      <div className="field">
        <span className="field-label">{t('props.routing')}</span>
        <span data-testid="prop-routing">{edge.routingMode === 'manual' ? t('props.routing.manual', { count: edge.waypoints.length }) : t('props.routing.auto')}</span>
      </div>
      <p className="hint">{t('props.editHint')}</p>
      <Buttons>
        <button type="button" disabled={edge.routingMode === 'auto'} onClick={() => editor.resetRoute(edge.id)}>{t('props.resetRoute')}</button>
        <button type="button" onClick={() => editor.update('edges', edge.id, { source: edge.target, target: edge.source, waypoints: [...edge.waypoints].reverse() })}>⇄</button>
        <button type="button" className="danger" onClick={() => editor.delete([edge.id])}>{t('props.delete')}</button>
      </Buttons>
    </section>
  );
}

export function AnnotationSection({ annotation: a, ...p }: SectionProps & { annotation: Annotation }) {
  const { t, editor } = p;
  return (
    <section>
      <h2>{t('props.annotation')} · {t(`note.${a.kind}`)}</h2>
      <TextArea label={t('props.text')} value={a.text} onChange={(v) => editor.rename(a.id, v)} testId="prop-label" />
      <Buttons>
        <button type="button" onClick={() => editor.duplicate([a.id])}>{t('props.duplicate')}</button>
        <button type="button" className="danger" onClick={() => editor.delete([a.id])}>{t('props.delete')}</button>
      </Buttons>
    </section>
  );
}
