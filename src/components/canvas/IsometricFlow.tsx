import { useMemo } from 'react';
import { flowPoint, isoBlockHeight, pathData, projectIso, type IsometricRotation, type Scene } from '../../engine';
import type { Translate } from '../../i18n/messages';
import type { useIsometricFlow } from './use-isometric-flow';

type Flow = ReturnType<typeof useIsometricFlow>;

export function FlowPaths({ flow, rotation, zoom }: { flow: Flow; rotation: IsometricRotation; zoom: number }) {
  const links = useMemo(() => flow.wave?.links.map(({ id, kind, points }) => {
    const projected = points.map((point) => projectIso(point, rotation));
    return { id, kind, points: projected, path: pathData(projected) };
  }), [flow.wave, rotation]);
  if (!links) return null;
  return (
    <g className="iso-flow-paths" aria-hidden="true" pointerEvents="none">
      {links.map(({ id, kind, path }) => (
        <path key={id} d={path} className="iso-flow-line" data-flow-edge={id} data-flow-kind={kind}
          strokeDasharray={kind === 'undirected' ? '5 4' : undefined} />
      ))}
      {!flow.reduced && links.filter(({ kind }) => kind !== 'undirected').map(({ id, points }) => {
        const { x, y } = flowPoint(points, flow.progress);
        return <circle key={id} className="iso-flow-dot" data-flow-dot={id} cx={x} cy={y} r={4.5 / zoom} />;
      })}
    </g>
  );
}

export function FlowFocus({ flow, scene, rotation }: { flow: Flow; scene: Scene; rotation: IsometricRotation }) {
  const { wave } = flow;
  const showArrivals = flow.progress >= (flow.reduced ? 1 : 0.85);
  const shapes = useMemo(() => {
    if (!wave) return [];
    const ids = new Set(wave.sources);
    const arrivals = new Set(showArrivals ? wave.arrivals : []);
    arrivals.forEach((id) => ids.add(id));
    return [...ids].flatMap((id) => {
      const rect = scene.rects.get(id);
      if (!rect) return [];
      const { x, y, width, height } = rect;
      const node = scene.nodes.find((item) => item.id === id);
      const rise = node ? isoBlockHeight(node) : 0;
      const points = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
      const path = pathData(points.map((point) => {
        const projected = projectIso(point, rotation);
        return { x: projected.x, y: projected.y - rise };
      })) + 'Z';
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

export function FlowControls({ t, flow }: { t: Translate; flow: Flow }) {
  const playbackLabel = flow.playing ? 'flow.pause' : flow.complete ? 'flow.replay' : 'flow.play';
  return (
    <div className="flow-player" role="group" aria-label={t('flow.title')}>
      <span className="flow-progress" role="status">{t('flow.step', { current: flow.step + 1, total: flow.count })}</span>
      <button type="button" className="chip-button" onClick={flow.toggle}>{t(playbackLabel)}</button>
      <button type="button" className="chip-button" onClick={flow.next} disabled={flow.complete}>{t('flow.next')}</button>
      <button type="button" className="chip-button" onClick={flow.stop}>{t('flow.stop')}</button>
    </div>
  );
}
