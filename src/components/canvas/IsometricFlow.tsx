import { useId, useMemo, useRef } from 'react';
import { flowPoint, isoBlockHeight, pathData, projectIso, projectIsoRect, type Scene } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { Icon } from '../ui/Icon';
import type { useIsometricFlow } from './use-isometric-flow';

type Flow = ReturnType<typeof useIsometricFlow>;

export function FlowPaths({ flow, rotation, zoom }: { flow: Flow; rotation: number; zoom: number }) {
  const arrowId = useId();
  const links = useMemo(() => flow.wave?.links.map(({ id, kind, points }) => {
    const projected = points.map((point) => projectIso(point, rotation));
    return { id, kind, points: projected, path: pathData(projected) };
  }), [flow.wave, rotation]);
  if (!links) return null;
  return (
    <g aria-hidden="true" pointerEvents="none">
      <defs>
        <marker id={arrowId} viewBox="0 0 12 12" markerUnits="userSpaceOnUse" markerWidth={15 / zoom} markerHeight={15 / zoom} refX="11" refY="6" orient="auto">
          <path className="iso-flow-arrow" d="M1 1 L11 6 L1 11Z" />
        </marker>
      </defs>
      {links.map(({ id, kind, path }) => {
        const dash = kind === 'undirected' ? '10 7' : undefined;
        return (
          <g key={id}>
            <path d={path} className="iso-flow-halo" strokeDasharray={dash} />
            <path d={path} className="iso-flow-line" data-flow-edge={id} data-flow-kind={kind}
              strokeDasharray={dash} markerEnd={dash ? undefined : `url(#${arrowId})`} />
          </g>
        );
      })}
      {!flow.reduced && links.filter(({ kind }) => kind !== 'undirected').map(({ id, points }) => {
        const { x, y } = flowPoint(points, flow.progress);
        return <circle key={id} className="iso-flow-dot" data-flow-dot={id} cx={x} cy={y} r={6.5 / zoom} />;
      })}
    </g>
  );
}

export function FlowFocus({ flow, scene, rotation }: { flow: Flow; scene: Scene; rotation: number }) {
  const { wave } = flow;
  const showArrivals = flow.reduced || flow.progress >= 0.85;
  const shapes = useMemo(() => {
    if (!wave) return [];
    const ids = new Set(wave.sources);
    const arrivals = new Set(showArrivals ? wave.arrivals : []);
    arrivals.forEach((id) => ids.add(id));
    return [...ids].flatMap((id) => {
      const rect = scene.rects.get(id);
      if (!rect) return [];
      const node = scene.nodes.find((item) => item.id === id);
      const rise = node ? isoBlockHeight(node) : 0;
      const path = pathData(projectIsoRect(rect, rotation).map(({ x, y }) => ({ x, y: y - rise }))) + 'Z';
      return [{ id, path, arrived: arrivals.has(id) }];
    });
  }, [wave, showArrivals, scene, rotation]);
  if (!shapes.length) return null;
  return (
    <g aria-hidden="true" pointerEvents="none">
      {shapes.map(({ id, path, arrived }) => (
        <path key={id} className="iso-flow-focus" d={path} data-flow-object={id} data-flow-state={arrived ? 'arrived' : 'source'}
          strokeDasharray={arrived ? undefined : '5 4'} />
      ))}
    </g>
  );
}

export function FlowControls({ t, flow, rotation }: { t: Translate; flow: Flow; rotation: number }) {
  const play = useRef<HTMLButtonElement>(null);
  const playbackLabel = !flow.active ? 'flow.launch' : flow.playing ? 'flow.pause' : 'flow.play';
  return (
    <div className="flow-player" role="group" aria-label={t('flow.title')}>
      {flow.active && <span className="flow-progress" role="status">{t('flow.step', { current: flow.step + 1, total: flow.count })}</span>}
      <button type="button" ref={play} className="chip-button iso-flow-launch" disabled={!flow.available}
        title={flow.available ? undefined : t('flow.noSource')} onClick={() => flow.active ? flow.toggle() : flow.startFromTop(rotation)}>
        <Icon name={flow.playing ? 'pause' : 'play'} size={14} />{t(playbackLabel)}
      </button>
      {flow.active && <>
        <button type="button" className="chip-button" onClick={flow.next}>{t('flow.next')}</button>
        <button type="button" className="chip-button" onClick={() => { flow.stop(); play.current?.focus(); }}>
          <Icon name="stop" size={14} />{t('flow.stop')}
        </button>
      </>}
    </div>
  );
}
