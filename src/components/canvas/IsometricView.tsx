import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Editor } from '../../application';
import type { Document, Id, Point } from '../../domain';
import { computeIsometricLayout, fitView, renderIsometricLayers, zoomAt, type DiagramTheme, type IsometricOptions, type IsometricRotation, type Scene, type Viewport } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { IconButton, Segmented } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { ContextMenu, type ContextActions, type ContextRequest } from './ContextMenu';
import { FlowControls, FlowFocus, FlowPaths } from './IsometricFlow';
import { useIsometricFlow } from './use-isometric-flow';
import { ZoomBar } from './ZoomBar';

interface Props {
  t: Translate;
  scene: Scene;
  theme: DiagramTheme;
  options: Required<IsometricOptions>;
  onOptions(options: Required<IsometricOptions>): void;
  doc: Document;
  editor: Editor;
  context: ContextActions;
  toggle(id: Id): void;
  presenting: boolean;
}

function objectAt(target: EventTarget) {
  return (target as Element).closest('[data-iso-object]')?.getAttribute('data-iso-object') ?? null;
}

export function IsometricView({ t, scene, theme, options, onOptions, doc, editor, context, toggle, presenting }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const layout = useMemo(() => computeIsometricLayout(scene, options), [scene, options]);
  const markup = useMemo(() => {
    const { floor, blocks, labels } = renderIsometricLayers(scene, theme, layout);
    return { floor: { __html: floor }, blocks: { __html: blocks }, labels: { __html: labels } };
  }, [scene, theme, layout]);
  const flow = useIsometricFlow(scene, doc);
  const launch = useRef<HTMLButtonElement>(null);
  const [pickingIn, setPickingIn] = useState<Id | null>(null);
  const picking = pickingIn === doc.id && flow.available;
  const [view, setView] = useState<Viewport | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const latest = useRef(view);
  latest.current = view;
  const drag = useRef<{ x: number; y: number; from: Viewport; source: Id | null } | null>(null);
  const [menu, setMenu] = useState<ContextRequest | null>(null);
  const activeObject = useRef<Id | null>(null);
  const fit = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const next = { width: r.width, height: r.height };
    setSize(next);
    setView(fitView(layout.bounds, next));
  }, [layout.bounds]);
  const rotate = (step: -1 | 1) => onOptions({ ...options, rotation: ((options.rotation + step + 4) % 4) as IsometricRotation });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = latest.current;
      if (!v) return;
      const box = el.getBoundingClientRect();
      const p = { x: e.clientX - box.left, y: e.clientY - box.top };
      setView(e.ctrlKey || e.metaKey ? zoomAt(v, p, Math.exp(-e.deltaY * 0.01)) : { ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const dismiss = useCallback((restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) ref.current?.focus({ preventScroll: true });
  }, []);
  const showMenu = (screen: Point, id: Id | null) => {
    activeObject.current = id;
    setMenu({ screen, ids: id ? [id] : [], world: { x: 0, y: 0 }, docId: doc.id });
  };
  const startFlow = (id: Id) => {
    activeObject.current = id;
    setPickingIn(null);
    flow.start(id);
  };
  const onContextMenu = (event: MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (presenting) return;
    showMenu({ x: event.clientX, y: event.clientY }, objectAt(event.target));
  };

  return (
    <>
      <svg
        ref={ref}
        className="canvas-svg isometric"
        data-testid="isometric"
        data-rotation={options.rotation}
        data-picking-flow={picking || undefined}
        role="application"
        aria-label={t('iso.canvas')}
        tabIndex={0}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => {
          if (picking && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setPickingIn(null);
            launch.current?.focus();
            return;
          }
          if (!presenting && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
            e.preventDefault();
            const box = e.currentTarget.getBoundingClientRect();
            const id = activeObject.current ?? editor.session.selected[0];
            showMenu({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, id && scene.rects.has(id) ? id : null);
          }
          if ((e.ctrlKey || e.metaKey) && ['0', '+', '=', '-', '_'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === '0') fit();
            else setView((v) => v ? zoomAt(v, { x: size.width / 2, y: size.height / 2 }, e.key === '-' || e.key === '_' ? 1 / 1.2 : 1.2) : v);
          }
        }}
        onPointerDown={(e) => {
          if (!view || e.button === 2) return;
          const id = picking && e.button === 0 ? objectAt(e.target) : null;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, from: view, source: id && flow.canStart(id) ? id : null };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (d.source && Math.hypot(dx, dy) < 5) return;
          d.source = null;
          setView({ ...d.from, panX: d.from.panX + dx, panY: d.from.panY + dy });
        }}
        onPointerUp={() => {
          const id = drag.current?.source;
          drag.current = null;
          if (picking && id && flow.canStart(id)) startFlow(id);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {view && (
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
            <g dangerouslySetInnerHTML={markup.floor} />
            <FlowPaths flow={flow} rotation={layout.rotation} zoom={view.zoom} />
            <g dangerouslySetInnerHTML={markup.blocks} />
            <FlowFocus flow={flow} scene={scene} rotation={layout.rotation} />
            <g dangerouslySetInnerHTML={markup.labels} />
          </g>
        )}
      </svg>
      {menu?.docId === doc.id && !presenting && (
        <ContextMenu {...context} t={t} doc={doc} scene={scene} editor={editor} request={menu} fit={fit}
          toggle={toggle} dismiss={dismiss} readOnly rotate={rotate} flow={{ canStart: flow.canStart, start: startFlow }} />
      )}
      <div className="readonly-note" role="status">{t('canvas.readonly')}</div>
      {picking && <div className="tool-hint" role="status">{t('flow.pickSource')}</div>}
      {view && (
        <div className="canvas-corner">
          {flow.active && <FlowControls t={t} flow={flow} />}
          <div className="iso-controls">
            <button type="button" ref={launch} className="chip-button iso-flow-launch" aria-pressed={picking}
              disabled={!flow.available} title={flow.available ? undefined : t('flow.noSource')}
              onClick={() => {
                setPickingIn(picking ? null : doc.id);
                if (!picking) ref.current?.focus({ preventScroll: true });
              }}>
              <Icon name="play" size={14} />{t('flow.launch')}
            </button>
            <Segmented label={t('iso.labels')} value={options.labels} onChange={(labels) => onOptions({ ...options, labels })}
              options={(['compact', 'full'] as const).map((value) => ({ value, label: t(`iso.${value}`) }))} />
            <div className="zoombar">
              <IconButton icon="rotateLeft" label={t('iso.rotateLeft')} onClick={() => rotate(-1)} />
              <span className="iso-angle" aria-label={t('iso.angle', { degrees: options.rotation * 90 })}>{options.rotation * 90}°</span>
              <IconButton icon="rotateRight" label={t('iso.rotateRight')} onClick={() => rotate(1)} />
            </div>
          </div>
          <ZoomBar t={t} viewport={view} size={size} setViewport={setView} onFit={fit} />
        </div>
      )}
    </>
  );
}
