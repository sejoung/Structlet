import type { Editor } from '../../application';
import {
  AREA_COLORS,
  CONTAINER_KINDS,
  CONTAINER_PRESETS,
  depth,
  descendants,
  NODE_SIZES,
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
  type NodeVariant,
  type Rect,
  type Side,
} from '../../domain';
import { AREA_STROKE } from '../../engine';
import type { Translate } from '../../i18n/messages';
import type { PaletteService } from '../sidebar/types';
import { Row, Section, Segmented, Switch } from '../ui/controls';
import { Pair, Select, TextArea } from './fields';

export type LayoutChoice = 'flow' | 'flow-down' | 'grid';

/** Actions that need geometry or catalog data, provided by the app. */
export interface PanelActions {
  layout(ids: readonly Id[], mode: LayoutChoice): void;
  layoutContents(containerId: Id, mode: LayoutChoice): void;
  attach(annotationId: Id, targetId: Id | null): void;
  regenerateLegend(annotationId: Id): void;
}

export interface SectionProps {
  t: Translate;
  editor: Editor;
  doc: Document;
  rect: Rect | undefined;
  actions: PanelActions;
}

export function LayoutButtons({ t, onLayout, testId }: { t: Translate; onLayout(mode: LayoutChoice): void; testId: string }) {
  return (
    <div className="button-row">
      {(['flow', 'flow-down', 'grid'] as const).map((m) => (
        <button type="button" className="chip-button" key={m} data-testid={`${testId}-${m}`} onClick={() => onLayout(m)}>{t(`props.layout.${m}`)}</button>
      ))}
    </div>
  );
}

function parentOptions(t: Translate, doc: Document, self: Id | null) {
  const blocked = new Set<Id>(self ? [self, ...descendants(doc, self)] : []);
  return [
    { value: '', label: t('props.root') },
    ...doc.containers.filter((c) => !blocked.has(c.id)).map((c) => ({ value: c.id, label: `${'  '.repeat(depth(doc, c.id))}${c.label || t(`area.${c.kind}`)}` })),
  ];
}

function Geometry({ t, editor, id, rect }: { t: Translate; editor: Editor; id: Id; rect: Rect | undefined }) {
  if (!rect) return null;
  return (
    <Section title={t('section.geometry')} defaultOpen={false}>
      <Pair label={t('props.position')} names={['X', 'Y']} a={rect.x} b={rect.y} onA={(v) => editor.move([id], { x: v - rect.x, y: 0 })} onB={(v) => editor.move([id], { x: 0, y: v - rect.y })} />
      <Pair label={t('props.size')} names={['W', 'H']} a={rect.width} b={rect.height} onA={(v) => editor.setBounds(id, { ...rect, width: v })} onB={(v) => editor.setBounds(id, { ...rect, height: v })} />
    </Section>
  );
}

function sizeOf(node: Node): 's' | 'm' | 'l' | 'custom' {
  const presets = NODE_SIZES[node.variant];
  return (['s', 'm', 'l'] as const).find((k) => presets[k].width === node.width && presets[k].height === node.height) ?? 'custom';
}

export function NodeSection({ node, services, ...p }: SectionProps & { node: Node; services: readonly PaletteService[] }) {
  const { t, editor, doc } = p;
  const known = services.some((s) => s.id === node.serviceId);
  const options = [...(known ? [] : [{ value: node.serviceId, label: t('props.unknownService', { id: node.serviceId }) }]), ...services.map((s) => ({ value: s.id, label: s.name }))];
  return (
    <>
      <Section title={t('section.basics')}>
        <TextArea label={t('props.label')} value={node.label} onChange={(v) => editor.rename(node.id, v)} testId="prop-label" />
        <Select label={t('props.service')} value={node.serviceId} options={options} onChange={(v) => editor.update('nodes', node.id, { serviceId: v })} testId="prop-service" />
      </Section>
      <Section title={t('section.appearance')}>
        <Row label={t('props.variant')}>
          <Segmented label={t('props.variant')} testId="prop-variant" value={node.variant} onChange={(v: NodeVariant) => editor.setNodeStyle(node.id, v)} options={(['icon', 'box'] as const).map((v) => ({ value: v, label: t(`props.variant.${v}`) }))} />
        </Row>
        <Row label={t('props.sizePreset')}>
          <Segmented label={t('props.sizePreset')} testId="prop-size" value={sizeOf(node)} onChange={(k) => k !== 'custom' && editor.setNodeStyle(node.id, node.variant, k)} options={(['s', 'm', 'l'] as const).map((k) => ({ value: k, label: k.toUpperCase() }))} />
        </Row>
      </Section>
      <Section title={t('section.placement')}>
        <Select label={t('props.parent')} value={node.parentId ?? ''} options={parentOptions(t, doc, null)} onChange={(v) => editor.setParent([node.id], v || null)} testId="prop-parent" />
      </Section>
      <Geometry t={t} editor={editor} id={node.id} rect={p.rect} />
    </>
  );
}

export function ContainerSection({ container: c, ...p }: SectionProps & { container: Container }) {
  const { t, editor, doc } = p;
  return (
    <>
      <Section title={t('section.basics')}>
        <TextArea label={t('props.label')} value={c.label} onChange={(v) => editor.rename(c.id, v)} testId="prop-label" />
        <Select label={t('props.kind')} value={c.kind} options={CONTAINER_KINDS.map((k) => ({ value: k, label: t(`area.${k}`) }))} onChange={(kind: ContainerKind) => editor.update('containers', c.id, { kind, style: CONTAINER_PRESETS[kind] })} />
      </Section>
      <Section title={t('section.appearance')}>
        <Row label={t('props.color')}>
          <div className="swatches" role="radiogroup" aria-label={t('props.color')}>
            {AREA_COLORS.map((color) => (
              <button type="button" key={color} role="radio" aria-label={color} aria-checked={c.style.color === color} className="swatch" style={{ background: AREA_STROKE[color] }} onClick={() => editor.update('containers', c.id, { style: { ...c.style, color } })} />
            ))}
          </div>
        </Row>
        <Row label="">
          <div className="switch-stack">
            <Switch label={t('props.dashed')} checked={c.style.dashed} onChange={(dashed) => editor.update('containers', c.id, { style: { ...c.style, dashed } })} />
            <Switch label={t('props.filled')} checked={c.style.filled} onChange={(filled) => editor.update('containers', c.id, { style: { ...c.style, filled } })} />
          </div>
        </Row>
      </Section>
      <Section title={t('section.placement')}>
        <Select label={t('props.parent')} value={c.parentId ?? ''} options={parentOptions(t, doc, c.id)} onChange={(v) => editor.setParent([c.id], v || null)} testId="prop-parent" />
        <Row label={t('props.layoutContents')} stacked>
          <LayoutButtons t={t} testId="layout-contents" onLayout={(m) => p.actions.layoutContents(c.id, m)} />
        </Row>
      </Section>
      <Geometry t={t} editor={editor} id={c.id} rect={p.rect} />
    </>
  );
}

function sideValue(end: Endpoint): Side | 'auto' | 'free' {
  return end.kind === 'free' ? 'free' : end.side;
}

const FABRIC_LINKS = ['NVLink', 'InfiniBand', 'Ethernet / RoCE'] as const;

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
    <>
      <Section title={t('section.basics')}>
        <TextArea label={t('props.label')} value={edge.label} onChange={(v) => editor.rename(edge.id, v)} testId="prop-label" />
        <Select
          label={t('props.linkPreset')}
          value=""
          options={[{ value: '', label: t('props.chooseLinkPreset') }, ...FABRIC_LINKS.map((label) => ({ value: label, label }))]}
          onChange={(label) => {
            if (label) editor.update('edges', edge.id, { label, style: { ...edge.style, dashed: false, arrow: 'none' } });
          }}
          testId="prop-link-preset"
        />
      </Section>
      <Section title={t('section.appearance')}>
        <Row label={t('props.arrow')}>
          <Segmented label={t('props.arrow')} value={edge.style.arrow} onChange={(arrow: ArrowHeads) => editor.update('edges', edge.id, { style: { ...edge.style, arrow } })} options={(['end', 'start', 'both', 'none'] as const).map((a) => ({ value: a, label: t(`props.arrow.${a}`) }))} />
        </Row>
        <Row label={t('props.shape')}>
          <Segmented label={t('props.shape')} value={edge.style.shape} onChange={(shape: EdgeShape) => editor.update('edges', edge.id, { style: { ...edge.style, shape }, routingMode: 'auto', waypoints: [] })} options={(['orthogonal', 'straight'] as const).map((s) => ({ value: s, label: t(`props.shape.${s}`) }))} />
        </Row>
        <Row label="">
          <Switch label={t('props.dashed')} checked={edge.style.dashed} onChange={(dashed) => editor.update('edges', edge.id, { style: { ...edge.style, dashed } })} testId="prop-dashed" />
        </Row>
      </Section>
      <Section title={t('section.ends')}>
        <Select label={t('props.sourceSide')} value={sideValue(edge.source)} options={sideOptions(edge.source)} onChange={(v) => setSide('source', v)} />
        <Select label={t('props.targetSide')} value={sideValue(edge.target)} options={sideOptions(edge.target)} onChange={(v) => setSide('target', v)} />
        <Row label={t('props.routing')}>
          <span className="value-text" data-testid="prop-routing">{edge.routingMode === 'manual' ? t('props.routing.manual', { count: edge.waypoints.length }) : t('props.routing.auto')}</span>
        </Row>
        <div className="button-row">
          <button type="button" className="chip-button" disabled={edge.routingMode === 'auto'} onClick={() => editor.resetRoute(edge.id)}>{t('props.resetRoute')}</button>
          <button type="button" className="chip-button" onClick={() => editor.update('edges', edge.id, { source: edge.target, target: edge.source, waypoints: [...edge.waypoints].reverse() })}>{t('props.swap')}</button>
        </div>
        <p className="section-hint">{t('props.editHint')}</p>
      </Section>
    </>
  );
}

export function AnnotationSection({ annotation: a, ...p }: SectionProps & { annotation: Annotation }) {
  const { t, editor } = p;
  return (
    <Section title={t('section.basics')}>
      <TextArea label={t('props.text')} value={a.text} onChange={(v) => editor.rename(a.id, v)} testId="prop-label" />
      <Select
        label={t('props.target')}
        value={a.targetId ?? ''}
        options={[{ value: '', label: t('props.noTarget') }, ...[...p.doc.nodes, ...p.doc.containers].map((b) => ({ value: b.id, label: b.label.split('\n')[0] || b.id }))]}
        onChange={(v) => p.actions.attach(a.id, v || null)}
        testId="prop-target"
      />
      {a.kind === 'legend' && (
        <div className="button-row">
          <button type="button" className="chip-button" data-testid="regenerate-legend" onClick={() => p.actions.regenerateLegend(a.id)}>{t('props.regenerateLegend')}</button>
        </div>
      )}
    </Section>
  );
}
