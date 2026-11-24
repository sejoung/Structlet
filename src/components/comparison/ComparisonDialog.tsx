import { useEffect, useMemo, useRef, useState } from 'react';
import { indexDocument, type Document, type Id } from '../../domain';
import { architectureDiff, comparisonStatus } from '../../domain/architecture-diff';
import type { Change } from '../../domain/patch';
import { computeScene, inflate, objectBounds, renderSceneBody, union, type Appearance, type DiagramTheme } from '../../engine';
import type { Translate } from '../../i18n/messages';

interface Props {
  before: Document;
  after: Document;
  fileName: string;
  appearance: Appearance;
  theme: DiagramTheme;
  t: Translate;
  onClose(): void;
}

function nameLookup(doc: Document) {
  const index = indexDocument(doc);
  return (id: Id) => index.nodes.get(id)?.label || index.containers.get(id)?.label || index.annotations.get(id)?.text || id;
}

function describe(change: Change, beforeName: ReturnType<typeof nameLookup>, afterName: ReturnType<typeof nameLookup>, t: Translate) {
  if (change.collection === 'title') return [t('toolbar.title'), [`${change.before} → ${change.after}`]] as const;
  const { before, after, id } = change;
  const details: string[] = [];
  const add = (key: Parameters<Translate>[0], oldValue: string, newValue: string) =>
    details.push(`${t(key)} · ${oldValue} → ${newValue}`);
  if (before && after && 'label' in before && 'label' in after && before.label !== after.label) {
    details.push(`${before.label || id} → ${after.label || id}`);
  }
  if (before && after && 'parentId' in before && 'parentId' in after && before.parentId !== after.parentId) {
    add('compare.parent', before.parentId ? beforeName(before.parentId) : t('compare.root'), after.parentId ? afterName(after.parentId) : t('compare.root'));
  }
  if (change.collection === 'nodes' && change.before && change.after && change.before.serviceId !== change.after.serviceId) {
    add('compare.service', change.before.serviceId, change.after.serviceId);
  }
  const names = after ? afterName : beforeName;
  if (change.collection === 'edges') {
    const edge = change.after ?? change.before!;
    const endpoint = (value: typeof edge.source, lookup: typeof names) =>
      value.kind === 'attached' ? lookup(value.objectId) : t('compare.free');
    if (change.before && change.after) {
      for (const key of ['source', 'target'] as const) {
        const old = change.before[key];
        const next = change.after[key];
        if (old.kind !== next.kind || (old.kind === 'attached' && next.kind === 'attached' && old.objectId !== next.objectId)) {
          add(`compare.${key}`, endpoint(old, beforeName), endpoint(next, afterName));
        }
      }
      if (change.before.style.arrow !== change.after.style.arrow) {
        add('compare.direction', t(`compare.arrow.${change.before.style.arrow}`), t(`compare.arrow.${change.after.style.arrow}`));
      }
    }
    return [edge.label || `${endpoint(edge.source, names)} → ${endpoint(edge.target, names)}`, details] as const;
  }
  if (change.collection === 'annotations' && change.before && change.after && change.before.text !== change.after.text) {
    details.push(`${change.before.text} → ${change.after.text}`);
  }
  return [names(id), details] as const;
}

export function ComparisonDialog({ before, after, fileName, appearance, theme, t, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [showLayout, setShowLayout] = useState(false);
  const [version, setVersion] = useState<'before' | 'after'>('after');
  const [focused, setFocused] = useState<Id | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const rows = useMemo(() => {
    const beforeName = nameLookup(before);
    const afterName = nameLookup(after);
    return architectureDiff(before, after).map(({ change, layoutOnly }) => ({
      id: change.collection === 'title' ? null : change.id,
      status: comparisonStatus(change),
      layoutOnly,
      description: describe(change, beforeName, afterName, t),
    }));
  }, [before, after, t]);
  const scenes = useMemo(() => ({ before: computeScene(before, appearance), after: computeScene(after, appearance) }), [before, after, appearance]);
  const scene = scenes[version];
  const markup = useMemo(() => renderSceneBody(scene, theme), [scene, theme]);
  const visibleRows = rows.filter((row) => showLayout || !row.layoutOnly);
  const statuses = new Map(visibleRows.flatMap(({ id, status }) =>
    id && (version === 'after' ? status !== 'removed' : status !== 'added') ? [[id, status] as const] : []));
  const focusedBounds = focused ? objectBounds(scene, [focused]) : null;
  const overview = union([scenes.before.bounds, scenes.after.bounds].filter((bounds) => bounds !== null));
  const bounds = inflate(focusedBounds ?? overview ?? { x: 0, y: 0, width: 360, height: 220 }, 30);

  return (
    <dialog ref={ref} className="dialog comparison" aria-labelledby="comparison-title" onCancel={onClose} data-testid="comparison">
      <div className="comparison-header">
        <div><h2 id="comparison-title">{t('compare.title')}</h2><p className="hint">{fileName} → {after.title}</p></div>
        <button type="button" className="chip-button" onClick={onClose}>{t('compare.close')}</button>
      </div>
      <div className="comparison-body">
        <aside className="comparison-changes">
          <label className="check"><input type="checkbox" checked={showLayout} onChange={(e) => { setShowLayout(e.target.checked); setFocused(null); }} />{t('compare.layout')}</label>
          {!visibleRows.length && <p className="hint" role="status">{t('compare.empty')}</p>}
          <ul>
            {visibleRows.map(({ id, status, description: [name, details] }) => (
              <li key={id === null ? 'title' : `object-${id}`}>
                <button type="button" data-change={status} aria-pressed={focused !== null && focused === id}
                  onClick={() => { setVersion(status === 'removed' ? 'before' : 'after'); setFocused(id); }}>
                  <span className="comparison-status" data-status={status}>{t(`compare.${status}`)}</span>
                  <strong>{name}</strong>
                  {details.map((detail, index) => <span className="comparison-detail" key={index}>{detail}</span>)}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="comparison-preview">
          <div className="comparison-controls">
            <div className="comparison-versions">
              {(['before', 'after'] as const).map((value) => (
                <button key={value} type="button" className="chip-button" aria-pressed={version === value}
                  onClick={() => { setVersion(value); if (focused && !objectBounds(scenes[value], [focused])) setFocused(null); }}>
                  {t(`compare.${value}`)}
                </button>
              ))}
            </div>
            <button type="button" className="chip-button" disabled={!focused} onClick={() => setFocused(null)}>{t('compare.overview')}</button>
          </div>
          <svg role="img" aria-label={t(`compare.${version}`)} viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} style={{ background: theme.background }}>
            <g dangerouslySetInnerHTML={{ __html: markup }} />
            <g className="comparison-marks" aria-hidden="true">
              {[...scene.containers, ...scene.nodes, ...scene.annotations].filter(({ id }) => statuses.has(id)).map(({ id, rect }) => (
                <rect key={id} {...inflate(rect, 4)} rx={4} data-status={statuses.get(id)} data-focused={id === focused} vectorEffect="non-scaling-stroke" />
              ))}
              {scene.edges.filter(({ id }) => statuses.has(id)).map(({ id, points }) => (
                <polyline key={id} points={points.map(({ x, y }) => `${x},${y}`).join(' ')} data-status={statuses.get(id)} data-focused={id === focused} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          </svg>
        </div>
      </div>
    </dialog>
  );
}
