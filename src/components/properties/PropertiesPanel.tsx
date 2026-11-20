import { useState } from 'react';
import type { Editor, SessionSnapshot } from '../../application';
import { CONTAINER_KINDS, getBox, indexDocument, topmost, type ContainerKind, type Id } from '../../domain';
import { alignDeltas, AREA_STROKE, distributeDeltas, type AlignMode, type Appearance, type Scene } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { GlyphIcon, ServiceTile } from '../GlyphIcon';
import type { PaletteService } from '../sidebar/types';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton, Row, Section } from '../ui/controls';
import { AnnotationSection, ContainerSection, EdgeSection, LayoutButtons, NodeSection, type PanelActions } from './sections';

export interface PanelFinding {
  readonly severity: 'warning' | 'info';
  readonly message: string;
  readonly ids: readonly Id[];
}

interface PropertiesProps {
  t: Translate;
  editor: Editor;
  snapshot: SessionSnapshot;
  scene: Scene;
  appearance: Appearance;
  services: readonly PaletteService[];
  findings: readonly PanelFinding[];
  actions: PanelActions;
  onWrap(ids: readonly Id[], kind: ContainerKind): void;
  onHide(): void;
}

function HideButton({ t, onHide }: { t: Translate; onHide(): void }) {
  return <IconButton icon="rightClose" label={t('panels.right.hide')} onClick={onHide} testId="toggle-right" />;
}

const ALIGN: { mode: AlignMode; icon: IconName; key: string }[] = [
  { mode: 'left', icon: 'alignLeft', key: 'left' },
  { mode: 'center', icon: 'alignCenter', key: 'center' },
  { mode: 'right', icon: 'alignRight', key: 'right' },
  { mode: 'top', icon: 'alignTop', key: 'top' },
  { mode: 'middle', icon: 'alignMiddle', key: 'middle' },
  { mode: 'bottom', icon: 'alignBottom', key: 'bottom' },
];

/** Inspector: what is selected, its properties, and what can be done with it. */
export function PropertiesPanel(props: PropertiesProps) {
  const { t, editor, snapshot, scene, appearance } = props;
  const doc = snapshot.document;
  const index = indexDocument(doc);
  const selection = snapshot.selection;

  if (selection.length === 0) return <aside className="inspector" aria-label={t('section.document')}><DocumentView {...props} /></aside>;

  if (selection.length > 1) return <aside className="inspector" aria-label={t('props.multi', { count: selection.length })}><MultiView {...props} /></aside>;

  const id = selection[0]!;
  const node = index.nodes.get(id);
  const container = index.containers.get(id);
  const edge = index.edges.get(id);
  const annotation = index.annotations.get(id);
  const common = { t, editor, doc, rect: scene.rects.get(id), actions: props.actions };
  const box = node ?? container;
  const look = node ? (appearance.service(node.serviceId) ?? appearance.fallback) : undefined;
  const areaColor = container ? AREA_STROKE[container.style.color] : undefined;
  const areaGlyph = container ? appearance.containerGlyph(container.kind) : null;
  const title = (node?.label ?? container?.label ?? edge?.label ?? annotation?.text ?? '').split('\n')[0] || (node ? t('props.node') : container ? t(`area.${container.kind}`) : edge ? t('props.edge') : t('props.annotation'));
  const subtitle = node ? look!.name : container ? t(`area.${container.kind}`) : edge ? t('props.edge') : annotation ? t(`note.${annotation.kind}`) : '';
  return (
    <aside className="inspector" aria-label={title}>
      <header className="inspector-head">
        <span className="inspector-icon" aria-hidden="true">
          {look ? (look.image ? <img src={look.image} alt="" width={28} height={28} /> : <ServiceTile glyph={look.glyph} color={look.color} size={28} />) : container ? (
            <span className="area-tag large" style={{ background: areaColor }}>{areaGlyph && <GlyphIcon glyph={areaGlyph} size={14} color="#fff" strokeWidth={2} />}</span>
          ) : (
            <span className="neutral-icon"><Icon name={edge ? 'link' : 'notes'} /></span>
          )}
        </span>
        <div className="inspector-title">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="inspector-actions">
          <IconButton icon="copy" label={t('props.duplicate')} onClick={() => editor.duplicate([id])} disabled={!!edge} />
          {box && <IconButton icon={box.locked ? 'lock' : 'unlock'} label={box.locked ? t('props.unlock') : t('props.lock')} pressed={box.locked} onClick={() => editor.setLocked([id], !box.locked)} testId="prop-lock" />}
          <IconButton icon="trash" label={t('props.delete')} tone="danger" onClick={() => editor.delete([id])} testId="prop-delete" />
          <HideButton t={t} onHide={props.onHide} />
        </div>
      </header>
      <div className="inspector-body">
        {node && <NodeSection key={id} {...common} node={node} services={props.services} />}
        {container && <ContainerSection key={id} {...common} container={container} />}
        {edge && <EdgeSection key={id} {...common} edge={edge} />}
        {annotation && <AnnotationSection key={id} {...common} annotation={annotation} />}
      </div>
    </aside>
  );
}

function DocumentView({ t, editor, snapshot, findings, onHide }: PropertiesProps) {
  const doc = snapshot.document;
  const index = indexDocument(doc);
  return (
    <>
      <header className="inspector-head">
        <div className="inspector-title">
          <strong>{doc.title}</strong>
          <span data-testid="doc-stats">{t('props.stats', { nodes: doc.nodes.length, areas: doc.containers.length, edges: doc.edges.length })}</span>
        </div>
        <div className="inspector-actions">
          <HideButton t={t} onHide={onHide} />
        </div>
      </header>
      <div className="inspector-body">
        <p className="section-hint padded">{t('props.empty')}</p>
        <Section title={t('checks.title')} testId="checks" actions={findings.length ? <span className="count">{findings.length}</span> : undefined}>
          {findings.length === 0 ? (
            <p className="section-hint">{t('checks.none')}</p>
          ) : (
            <ul className="findings">
              {findings.map((f, i) => (
                <li key={i}>
                  <button type="button" className={`finding ${f.severity}`} onClick={() => editor.session.select(f.ids.filter((id) => index.nodes.has(id) || index.containers.has(id) || index.edges.has(id)))}>
                    <Icon name={f.severity === 'warning' ? 'warning' : 'info'} size={14} />
                    <span>{f.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function MultiView({ t, editor, snapshot, scene, onWrap, actions, onHide }: PropertiesProps) {
  const doc = snapshot.document;
  const selection = snapshot.selection;
  const [kind, setKind] = useState<ContainerKind>('custom');
  const boxes = topmost(doc, selection.filter((id) => getBox(doc, id)));
  const movable = boxes.filter((id) => !getBox(doc, id)!.locked);
  const placed = movable.map((id) => ({ id, rect: scene.rects.get(id)! })).filter((p) => p.rect);
  const allLocked = boxes.length > 0 && boxes.every((id) => getBox(doc, id)!.locked);
  const pair = selection.length === 2 && selection.every((id) => getBox(doc, id));
  return (
    <>
      <header className="inspector-head">
        <span className="inspector-icon" aria-hidden="true"><span className="neutral-icon"><Icon name="group" /></span></span>
        <div className="inspector-title">
          <strong>{t('props.multi', { count: selection.length })}</strong>
        </div>
        <div className="inspector-actions">
          <IconButton icon="copy" label={t('props.duplicate')} onClick={() => editor.duplicate(selection)} />
          {boxes.length > 0 && <IconButton icon={allLocked ? 'lock' : 'unlock'} label={allLocked ? t('props.unlockAll') : t('props.lockAll')} pressed={allLocked} onClick={() => editor.setLocked(boxes, !allLocked)} />}
          <IconButton icon="trash" label={t('props.delete')} tone="danger" onClick={() => editor.delete(selection)} />
          <HideButton t={t} onHide={onHide} />
        </div>
      </header>
      <div className="inspector-body">
        {placed.length >= 2 && (
          <Section title={t('section.arrange')}>
            <Row label={t('props.align')} stacked>
              <div className="icon-row">
                {ALIGN.map((a) => (
                  <IconButton key={a.mode} icon={a.icon} label={`${t('props.align')}: ${a.key}`} onClick={() => editor.moveEach(alignDeltas(placed, a.mode))} testId={`align-${a.mode}`} />
                ))}
              </div>
            </Row>
            {placed.length >= 3 && (
              <Row label={t('props.distribute')}>
                <div className="icon-row">
                  <IconButton icon="spreadH" label={`${t('props.distribute')} ↔`} onClick={() => editor.moveEach(distributeDeltas(placed, 'horizontal'))} />
                  <IconButton icon="spreadV" label={`${t('props.distribute')} ↕`} onClick={() => editor.moveEach(distributeDeltas(placed, 'vertical'))} />
                </div>
              </Row>
            )}
            <Row label={t('props.layout')} stacked>
              <LayoutButtons t={t} testId="layout" onLayout={(m) => actions.layout(selection, m)} />
            </Row>
            <p className="section-hint">{t('props.layoutHint')}</p>
          </Section>
        )}
        {(pair || boxes.length > 0) && (
          <Section title={t('section.placement')}>
            {pair && (
              <div className="button-row">
                <button
                  type="button"
                  className="chip-button"
                  data-testid="connect-selected"
                  onClick={() => editor.connect({ kind: 'attached', objectId: selection[0]!, side: 'auto', offset: null }, { kind: 'attached', objectId: selection[1]!, side: 'auto', offset: null })}
                >
                  <Icon name="link" size={14} />
                  {t('props.connect')}
                </button>
              </div>
            )}
            {boxes.length > 0 && (
              <Row label={t('props.wrap')} stacked>
                <div className="inline-controls">
                  <select value={kind} onChange={(e) => setKind(e.target.value as ContainerKind)} aria-label={t('props.kind')}>
                    {CONTAINER_KINDS.map((k) => (
                      <option key={k} value={k}>{t(`area.${k}`)}</option>
                    ))}
                  </select>
                  <button type="button" className="chip-button" data-testid="wrap-selected" onClick={() => onWrap(boxes, kind)}>{t('props.wrap')}</button>
                </div>
              </Row>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
