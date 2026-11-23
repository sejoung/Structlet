import { useEffect, useMemo, useState } from 'react';
import { ancestors, type Document, type Id } from '../../domain';
import { planIsometricFlow, type FlowWave, type Scene } from '../../engine';

const WAVE_MS = 950;

interface Playback {
  readonly plan: readonly FlowWave[];
  readonly step: number;
  readonly progress: number;
  readonly playing: boolean;
}

export function useIsometricFlow(scene: Scene, doc: Document) {
  const [source, setSource] = useState<{ id: Id; docId: Id } | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const sources = useMemo(() => {
    const ids = new Set<Id>();
    for (const { points, sourceId, targetId, style } of scene.edges) {
      if (points.length < 2) continue;
      if (sourceId && style.arrow !== 'start') ids.add(sourceId);
      if (targetId && style.arrow !== 'end') ids.add(targetId);
    }
    return ids;
  }, [scene]);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const plan = useMemo(() => {
    if (!source || source.docId !== doc.id) return [];
    const visible = scene.rects.has(source.id) ? source.id : ancestors(doc, source.id).find((id) => scene.nodes.some((node) => node.summary && node.id === id));
    return visible ? planIsometricFlow(scene, visible) : [];
  }, [scene, doc, source]);
  const current: Playback = playback?.plan === plan ? playback : { plan, step: 0, progress: 0, playing: playback?.playing ?? false };
  const playing = plan.length > 0 && current.playing;
  const complete = current.step === plan.length - 1 && current.progress === 1;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous: number | undefined;
    const tick = (now: number) => {
      const elapsed = previous === undefined ? 0 : now - previous;
      previous = now;
      setPlayback((prior) => {
        const state: Playback = prior?.plan === plan ? prior : { plan, step: 0, progress: 0, playing: true };
        if (!state.playing) return state;
        const next = state.progress + elapsed / WAVE_MS;
        if (next < 1) return { ...state, progress: next };
        if (state.step + 1 < plan.length) return { ...state, step: state.step + 1, progress: 0 };
        return { ...state, progress: 1, playing: false };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, plan]);

  return {
    active: source?.docId === doc.id && plan.length > 0,
    wave: plan[current.step],
    count: plan.length,
    step: current.step,
    progress: current.progress,
    playing,
    complete,
    reduced,
    available: sources.size > 0,
    canStart: (id: Id) => sources.has(id),
    start(id: Id) {
      setSource({ id, docId: doc.id });
      setPlayback({ plan: [], step: 0, progress: 0, playing: !reduced });
    },
    toggle() {
      setPlayback(complete ? { plan, step: 0, progress: 0, playing: true } : { ...current, playing: !playing });
    },
    next() {
      if (complete) return;
      const step = current.progress === 1 ? current.step + 1 : current.step;
      setPlayback({ plan, step, progress: 1, playing: false });
    },
    stop() {
      setSource(null);
      setPlayback(null);
    },
  };
}
