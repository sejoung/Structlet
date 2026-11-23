import { useCallback, useMemo, useRef, useState } from 'react';
import { indexDocument, type Document, type Id } from '../domain';
import { computeDiagramView, LAYOUT_MODES, type Appearance, type DiagramView, type LayoutMode } from '../engine';
import type { Translate } from '../i18n/messages';
import { store } from './preferences';

type Settings = { folded: readonly Id[]; layout: LayoutMode | null };
const EMPTY: Settings = { folded: [], layout: null };
const key = (id: Id) => `structlet:diagram-view:${id}`;

function read(id: Id): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(key(id)) ?? 'null');
    if (!Array.isArray(value?.folded)) return EMPTY;
    return {
      folded: value.folded.filter((id: unknown) => typeof id === 'string'),
      layout: LAYOUT_MODES.includes(value.layout) ? value.layout : null,
    };
  } catch {
    return EMPTY;
  }
}

export function useDiagramView(doc: Document, appearance: Appearance, t: Translate) {
  const [changed, setChanged] = useState<{ id: Id; value: Settings }>();
  const stored = useMemo(() => read(doc.id), [doc.id]);
  const settings = changed?.id === doc.id ? changed.value : stored;
  const fitPending = useRef(false);
  const optionsFor = useCallback((target: Document): DiagramView => {
    const current = target.id === doc.id ? settings : read(target.id);
    return {
      folded: new Set(current.folded), layout: current.layout,
      label: (area, services) => [area.label || t(`area.${area.kind}`), t('summary.services', { count: services })],
    };
  }, [doc.id, settings, t]);
  const scene = useMemo(() => computeDiagramView(doc, appearance, optionsFor(doc)), [doc, appearance, optionsFor]);
  const { children, containers } = indexDocument(doc);
  const top = doc.containers.filter((area) => area.parentId === null && children.get(area.id)?.length).map((area) => area.id);
  const groupsUnder = (id: Id) => (children.get(id) ?? []).filter((child) => containers.has(child) && children.get(child)?.length);
  const middle = top.flatMap((id) => {
    const first = groupsUnder(id);
    if (!first.length) return [id];
    let next = first;
    while (next.length === 1) next = groupsUnder(next[0]!);
    return next.length ? next : first;
  });
  const active = scene.nodes.some((node) => node.summary);
  const update = (value: Settings, fit = false) => {
    fitPending.current = fit;
    store(key(doc.id), value);
    setChanged({ id: doc.id, value });
  };
  return {
    scene, active, optionsFor, fitPending, settings, canFoldTop: top.length > 0, canFoldMiddle: middle.some((id) => containers.get(id)?.parentId !== null),
    toggle(id: Id) {
      update({
        ...settings,
        folded: settings.folded.includes(id) ? settings.folded.filter((folded) => folded !== id) : [...settings.folded, id],
      });
    },
    foldTop: () => update({ ...settings, folded: [...new Set([...settings.folded, ...top])] }, true),
    foldMiddle: () => update({ ...settings, folded: middle }, true),
    expandAll: () => update(EMPTY, true),
    arrange: (mode: LayoutMode | null) => update({ ...settings, layout: mode }, true),
  };
}
