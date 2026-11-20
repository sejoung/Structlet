import { useState, type ReactNode } from 'react';
import type { Editor, SessionSnapshot } from '../../application';
import { CONTAINER_KINDS, getBox, indexDocument, topmost, type ContainerKind, type Id } from '../../domain';
import { alignDeltas, distributeDeltas, type AlignMode, type Scene } from '../../engine';
import type { Translate } from '../../i18n/messages';
import type { PaletteService } from '../Palette';
import { Buttons } from './fields';
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
  services: readonly PaletteService[];
  findings: readonly PanelFinding[];
  actions: PanelActions;
  onWrap(ids: readonly Id[], kind: ContainerKind): void;
}

const ALIGN: { mode: AlignMode; icon: string }[] = [
  { mode: 'left', icon: '⇤' },
  { mode: 'center', icon: '↔' },
  { mode: 'right', icon: '⇥' },
  { mode: 'top', icon: '⤒' },
  { mode: 'middle', icon: '↕' },
  { mode: 'bottom', icon: '⤓' },
];

export function PropertiesPanel(props: PropertiesProps) {
  const { t, editor, snapshot, scene } = props;
  const doc = snapshot.document;
  const index = indexDocument(doc);
  const selection = snapshot.selection;
  let body: ReactNode;

  if (selection.length === 0) {
    body = (
      <section>
        <h2>{t('props.document')}</h2>
        <p data-testid="doc-stats">{t('props.stats', { nodes: doc.nodes.length, areas: doc.containers.length, edges: doc.edges.length })}</p>
        <p className="hint">{t('props.empty')}</p>
      </section>
    );
    body = (
      <>
        {body}
        <section data-testid="checks">
          <h2>{t('checks.title')}</h2>
          {props.findings.length === 0 && <p className="hint">{t('checks.none')}</p>}
          <ul className="findings">
            {props.findings.map((f, i) => (
              <li key={i}>
                <button type="button" className={`finding ${f.severity}`} onClick={() => editor.session.select(f.ids.filter((id) => index.nodes.has(id) || index.containers.has(id) || index.edges.has(id)))}>
                  <span className="finding-mark" aria-hidden="true">{f.severity === 'warning' ? '!' : 'i'}</span>
                  {f.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  } else if (selection.length === 1) {
    const id = selection[0]!;
    const common = { t, editor, doc, rect: scene.rects.get(id), actions: props.actions };
    const node = index.nodes.get(id);
    const container = index.containers.get(id);
    const edge = index.edges.get(id);
    const annotation = index.annotations.get(id);
    if (node) body = <NodeSection key={id} {...common} node={node} services={props.services} />;
    else if (container) body = <ContainerSection key={id} {...common} container={container} />;
    else if (edge) body = <EdgeSection key={id} {...common} edge={edge} />;
    else if (annotation) body = <AnnotationSection key={id} {...common} annotation={annotation} />;
  } else {
    body = <MultiSection {...props} />;
  }
  return (
    <aside className="properties" aria-label="properties">
      {body}
    </aside>
  );
}

function MultiSection({ t, editor, snapshot, scene, onWrap, actions }: PropertiesProps) {
  const doc = snapshot.document;
  const selection = snapshot.selection;
  const [kind, setKind] = useState<ContainerKind>('custom');
  const boxes = topmost(doc, selection.filter((id) => getBox(doc, id)));
  const movable = boxes.filter((id) => !getBox(doc, id)!.locked);
  const placed = movable.map((id) => ({ id, rect: scene.rects.get(id)! })).filter((p) => p.rect);
  const allLocked = boxes.length > 0 && boxes.every((id) => getBox(doc, id)!.locked);
  const pair = selection.length === 2 && selection.every((id) => getBox(doc, id));
  return (
    <section>
      <h2>{t('props.multi', { count: selection.length })}</h2>
      {placed.length >= 2 && (
        <div className="field">
          <span className="field-label">{t('props.align')}</span>
          <div className="button-row tight">
            {ALIGN.map((a) => (
              <button type="button" key={a.mode} title={a.mode} data-align={a.mode} onClick={() => editor.moveEach(alignDeltas(placed, a.mode))}>{a.icon}</button>
            ))}
          </div>
        </div>
      )}
      {placed.length >= 2 && (
        <div className="field">
          <span className="field-label">{t('props.layout')}</span>
          <LayoutButtons t={t} testId="layout" onLayout={(m) => actions.layout(selection, m)} />
          <p className="hint">{t('props.layoutHint')}</p>
        </div>
      )}
      {placed.length >= 3 && (
        <div className="field">
          <span className="field-label">{t('props.distribute')}</span>
          <div className="button-row tight">
            <button type="button" data-distribute="horizontal" onClick={() => editor.moveEach(distributeDeltas(placed, 'horizontal'))}>⋯</button>
            <button type="button" data-distribute="vertical" onClick={() => editor.moveEach(distributeDeltas(placed, 'vertical'))}>⋮</button>
          </div>
        </div>
      )}
      {pair && (
        <Buttons>
          <button
            type="button"
            data-testid="connect-selected"
            onClick={() => editor.connect({ kind: 'attached', objectId: selection[0]!, side: 'auto', offset: null }, { kind: 'attached', objectId: selection[1]!, side: 'auto', offset: null })}
          >
            {t('props.connect')} →
          </button>
        </Buttons>
      )}
      {boxes.length > 0 && (
        <div className="field">
          <span className="field-label">{t('props.wrap')}</span>
          <div className="button-row">
            <select value={kind} onChange={(e) => setKind(e.target.value as ContainerKind)} aria-label={t('props.kind')}>
              {CONTAINER_KINDS.map((k) => (
                <option key={k} value={k}>{t(`area.${k}`)}</option>
              ))}
            </select>
            <button type="button" data-testid="wrap-selected" onClick={() => onWrap(boxes, kind)}>{t('props.wrap')}</button>
          </div>
        </div>
      )}
      <Buttons>
        {boxes.length > 0 && <button type="button" onClick={() => editor.setLocked(boxes, !allLocked)}>{allLocked ? t('props.unlockAll') : t('props.lockAll')}</button>}
        <button type="button" onClick={() => editor.duplicate(selection)}>{t('props.duplicate')}</button>
        <button type="button" className="danger" onClick={() => editor.delete(selection)}>{t('props.delete')}</button>
      </Buttons>
    </section>
  );
}
