import { useEffect, useMemo, useState } from 'react';
import { ancestors, type Document, type Id } from '../../domain';
import { indexIsometricFlow, planIsometricFlow, topIsometricFlowSource, type FlowWave, type Scene } from '../../engine';

const WAVE_MS = 950;

interface Playback {
  readonly plan: readonly FlowWave[];
  readonly step: number;
  readonly progress: number;
  readonly playing: boolean;
}

export function useIsometricFlow(scene: Scene, doc: Document) {
  const [source, setSource] = useState<{ id: Id; docId: Id; rotation?: number } | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const graph = useMemo(() => indexIsometricFlow(scene), [scene]);
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
    if (visible && graph.has(visible)) return planIsometricFlow(graph, visible);
    const fallback = source.rotation === undefined ? null : topIsometricFlowSource(scene, graph, source.rotation);
    return fallback ? planIsometricFlow(graph, fallback) : [];
  }, [scene, doc, source, graph]);
  const current: Playback = playback?.plan === plan ? playback : { plan, step: 0, progress: 0, playing: playback?.playing ?? false };
  const playing = plan.length > 0 && current.playing;

  const start = (id: Id, rotation?: number) => {
    setSource({ id, docId: doc.id, rotation });
    setPlayback({ plan: [], step: 0, progress: 0, playing: true });
  };

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous: number | undefined;
    const tick = (now: number) => {
      const elapsed = previous === undefined ? 0 : now - previous;
      previous = now;
      setPlayback((prior) => {
        const state: Playback = prior?.plan === plan ? prior : { plan, step: 0, progress: 0, playing: true };
        if (!state.playing || elapsed === 0) return state;
        const progress = state.progress + elapsed / WAVE_MS;
        return { ...state, step: (state.step + Math.floor(progress)) % plan.length, progress: progress % 1 };
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
    reduced,
    available: graph.size > 0,
    canStart: (id: Id) => graph.has(id),
    start,
    startFromTop(rotation: number) {
      const id = topIsometricFlowSource(scene, graph, rotation);
      if (id) start(id, rotation);
    },
    toggle() {
      setPlayback({ ...current, playing: !playing });
    },
    next() {
      const step = current.progress === 1 ? (current.step + 1) % plan.length : current.step;
      setPlayback({ plan, step, progress: 1, playing: false });
    },
    stop() {
      setSource(null);
      setPlayback(null);
    },
  };
}
