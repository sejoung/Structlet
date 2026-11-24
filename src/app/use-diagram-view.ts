import { useCallback, useMemo, useRef, useState } from 'react';
import type { Document, Id } from '../domain';
import { availableDiagramContents, computeDiagramView, computeIsometricLayout, DIAGRAM_CONTENTS, LAYOUT_MODES, projectDiagramContent, recommendDiagramSummary, summaryGroups, type Appearance, type DiagramContent, type DiagramView, type IsometricOptions, type LayoutMode } from '../engine';
import type { Translate } from '../i18n/messages';
import { store } from './preferences';

type Settings = { folded: readonly Id[]; layout: LayoutMode | null; content: DiagramContent };
const EMPTY: Settings = { folded: [], layout: null, content: 'all' };
const key = (id: Id) => `structlet:diagram-view:${id}`;

function read(id: Id): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(key(id)) ?? 'null');
    if (!Array.isArray(value?.folded)) return EMPTY;
    return {
      folded: value.folded.filter((id: unknown) => typeof id === 'string'),
      layout: LAYOUT_MODES.includes(value.layout) ? value.layout : null,
      content: DIAGRAM_CONTENTS.includes(value.content) ? value.content : 'all',
    };
  } catch {
    return EMPTY;
  }
}

export function useDiagramView(doc: Document, appearance: Appearance, t: Translate) {
  const [changed, setChanged] = useState<{ id: Id; value: Settings }>();
  const stored = useMemo(() => read(doc.id), [doc.id]);
  const settings = changed?.id === doc.id ? changed.value : stored;
  const availableContents = useMemo(() => availableDiagramContents(doc), [doc]);
  const content = availableContents.includes(settings.content) ? settings.content : 'all';
  const fitPending = useRef(false);
  const optionsFor = useCallback((target: Document): DiagramView => {
    const current = target.id === doc.id ? settings : read(target.id);
    const mode = target.id === doc.id ? content : availableDiagramContents(target).includes(current.content) ? current.content : 'all';
    return {
      content: mode, folded: new Set(current.folded), layout: current.layout,
      label: (area, services) => [area.label || t(`area.${area.kind}`), t('summary.services', { count: services })],
    };
  }, [doc.id, settings, content, t]);
  const scene = useMemo(() => computeDiagramView(doc, appearance, optionsFor(doc)), [doc, appearance, optionsFor]);
  const { top, middle, hasMiddle } = useMemo(() => summaryGroups(projectDiagramContent(doc, content)), [doc, content]);
  const hasFolds = scene.nodes.some((node) => node.summary);
  const active = hasFolds || content !== 'all';
  const update = (value: Settings, fit = false) => {
    fitPending.current = fit;
    store(key(doc.id), value);
    setChanged({ id: doc.id, value });
  };
  return {
    scene, active, hasFolds, content, availableContents, optionsFor, fitPending, layout: settings.layout,
    canFoldTop: top.length > 0, canFoldMiddle: hasMiddle,
    setContent(next: DiagramContent) {
      if (next === content || !availableContents.includes(next)) return;
      update({ ...settings, content: next, layout: settings.layout ?? (next === 'all' ? null : 'flow') }, true);
    },
    recommend(size: { width: number; height: number }, isometric?: IsometricOptions) {
      const recommendation = recommendDiagramSummary(doc, appearance, optionsFor(doc), size,
        isometric ? (scene) => computeIsometricLayout(scene, { ...isometric, labelOffsets: null }).bounds : undefined);
      update({ ...settings, ...recommendation }, true);
      return t(recommendation.folded.length ? 'diagramSummary.applied' : 'diagramSummary.expanded');
    },
    toggle(id: Id) {
      update({
        ...settings,
        folded: settings.folded.includes(id) ? settings.folded.filter((folded) => folded !== id) : [...settings.folded, id],
      });
    },
    foldTop: () => update({ ...settings, folded: [...new Set([...settings.folded, ...top])] }, true),
    foldMiddle: () => update({ ...settings, folded: middle }, true),
    expandAll: () => update({ ...settings, folded: [], layout: content === 'all' ? null : settings.layout }, true),
    arrange: (mode: LayoutMode | null) => update({ ...settings, layout: mode }, true),
  };
}
