import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent, type Ref } from 'react';
import type { Editor } from '../../application';
import type { Document, Id, Point, Rect } from '../../domain';
import { adjacentIsoPreset, center, computeIsometricLayout, fitView, groupBounds, MAX_ZOOM, normalizeIsoAngle, objectBounds, projectIso, renderIsometricLayers, zoomAt, type DiagramTheme, type IsometricOptions, type Scene, type Viewport } from '../../engine';
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
  focusObjects: Ref<(ids: readonly Id[]) => void>;
  presenting: boolean;
}

type Drag = { x: number; y: number; from: Viewport } & (
  { kind: 'pan' } | { kind: 'orbit'; start: number; angle: number }
);
type Preview = Pick<Required<IsometricOptions>, 'rotation' | 'labelOffsets'>;

const ORBIT_DEGREES_PER_PIXEL = 0.4;
const ROTATION_MS = 200;

function orbitView(view: Viewport, pivot: Point, from: number, to: number): Viewport {
  const before = projectIso(pivot, from);
  const after = projectIso(pivot, to);
  return { ...view, panX: view.panX + (before.x - after.x) * view.zoom, panY: view.panY + (before.y - after.y) * view.zoom };
}

export function IsometricView({ t, scene, theme, options, onOptions, doc, editor, context, toggle, presenting, focusObjects }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const orbitButton = useRef<HTMLButtonElement>(null);
  const [orbiting, setOrbiting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const angle = preview?.rotation ?? options.rotation;
  const angleDisplay = normalizeIsoAngle(Math.round(angle));
  const labelOffsets = preview?.labelOffsets ?? options.labelOffsets;
  const layout = useMemo(() => computeIsometricLayout(scene, { labels: options.labels, rotation: angle, labelOffsets }), [scene, options.labels, angle, labelOffsets]);
  const markup = useMemo(() => {
    const { floor, blocks, labels } = renderIsometricLayers(scene, theme, layout);
    return { floor: { __html: floor }, blocks: { __html: blocks }, labels: { __html: labels } };
  }, [scene, theme, layout]);
  const flow = useIsometricFlow(scene, doc);
  const [view, setView] = useState<Viewport | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const latest = useRef(view);
  latest.current = view;
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const latestLayout = useRef(layout);
  latestLayout.current = layout;
  const turnFrame = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const [menu, setMenu] = useState<ContextRequest | null>(null);
  const activeObject = useRef<Id | null>(null);
  const focusedBounds = useRef<Rect | null>(null);
  const pivotBounds = focusedBounds.current ?? scene.bounds;
  const pivot = pivotBounds ? center(pivotBounds) : { x: 0, y: 0 };
  const fit = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const next = { width: r.width, height: r.height };
    focusedBounds.current = null;
    setSize(next);
    setView(fitView(latestLayout.current.bounds, next));
  }, []);
  const showBounds = (bounds: Rect | null, world: Rect | null, maximum?: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!bounds || !r?.width || !r.height) return;
    focusedBounds.current = world;
    setView(fitView(bounds, r, 48, maximum));
  };
  const fitGroup = (id: Id) => showBounds(groupBounds(doc, scene, id, layout), scene.rects.get(id) ?? null, MAX_ZOOM);
  useImperativeHandle(focusObjects, () => (ids) => showBounds(objectBounds(scene, ids, layout), objectBounds(scene, ids)));
  const commitRotation = (rotation: number, keepLabels = true) => {
    setPreview(null);
    onOptions({ ...latestOptions.current, rotation, labelOffsets: keepLabels ? latestLayout.current.labelOffsets : null });
  };
  const cancelTurn = () => {
    if (turnFrame.current !== null) cancelAnimationFrame(turnFrame.current);
    turnFrame.current = null;
  };
  const turnTo = (target: number, { reset = false, animate = true } = {}) => {
    cancelTurn();
    drag.current = null;
    const end = normalizeIsoAngle(target);
    let shown = angle;
    const moveTo = (next: number) => {
      const before = shown;
      shown = next;
      setView((v) => v ? orbitView(v, pivot, before, next) : v);
    };
    if (!animate || flow.reduced || angle === end) {
      if (angle !== end) moveTo(end);
      commitRotation(end, !reset);
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / ROTATION_MS);
      if (progress === 1) {
        turnFrame.current = null;
        moveTo(end);
        commitRotation(end, !reset);
        return;
      }
      const eased = progress * progress * (3 - 2 * progress);
      const next = normalizeIsoAngle(angle + (target - angle) * eased);
      moveTo(next);
      setPreview({ rotation: next, labelOffsets: latestLayout.current.labelOffsets });
      turnFrame.current = requestAnimationFrame(tick);
    };
    turnFrame.current = requestAnimationFrame(tick);
  };
  const rotate = (direction: -1 | 1) => turnTo(adjacentIsoPreset(angle, direction));
  const resetRotation = () => turnTo(angle > 180 ? 360 : 0, { reset: true });

  useEffect(() => () => {
    if (turnFrame.current !== null) cancelAnimationFrame(turnFrame.current);
  }, []);
  useEffect(fit, [fit, doc.id, scene, options.labels]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
  const onContextMenu = (event: MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (presenting) return;
    const object = (event.target as Element).closest('[data-iso-object]')?.getAttribute('data-iso-object') ?? null;
    showMenu({ x: event.clientX, y: event.clientY }, object);
  };
  const finishDrag = () => {
    const current = drag.current;
    drag.current = null;
    if (current?.kind !== 'orbit') return;
    if (current.angle !== current.start || preview) commitRotation(current.angle);
  };

  return (
    <>
      <svg
        ref={ref}
        className="canvas-svg isometric"
        data-testid="isometric"
        data-rotation={angle}
        data-orbiting={orbiting || undefined}
        data-flow-active={flow.active || undefined}
        role="application"
        aria-label={t('iso.canvas')}
        tabIndex={0}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => {
          if (orbiting && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finishDrag();
            setOrbiting(false);
            orbitButton.current?.focus();
            return;
          }
          if (orbiting && view && ['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Home') resetRotation();
            else turnTo(angle + (e.key === 'ArrowLeft' ? -5 : 5), { animate: false });
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
          if (!view || e.button === 2 || !e.isPrimary) return;
          if (turnFrame.current !== null) {
            cancelTurn();
            commitRotation(angle);
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          const from = { x: e.clientX, y: e.clientY, from: view };
          drag.current = orbiting && e.button === 0 ? { ...from, kind: 'orbit', start: angle, angle } : { ...from, kind: 'pan' };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !e.isPrimary) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (d.kind === 'orbit') {
            const next = normalizeIsoAngle(d.start + Math.round(dx * ORBIT_DEGREES_PER_PIXEL));
            if (next === d.angle) return;
            d.angle = next;
            setPreview({ rotation: next, labelOffsets: latestLayout.current.labelOffsets });
            setView(orbitView(d.from, pivot, d.start, next));
            return;
          }
          setView({ ...d.from, panX: d.from.panX + dx, panY: d.from.panY + dy });
        }}
        onPointerUp={(e) => { if (e.isPrimary) finishDrag(); }}
        onPointerCancel={(e) => { if (e.isPrimary) finishDrag(); }}
        onLostPointerCapture={(e) => { if (e.isPrimary) finishDrag(); }}
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
        <ContextMenu {...context} t={t} doc={doc} scene={scene} editor={editor} request={menu} fit={fit} fitGroup={fitGroup}
          toggle={toggle} dismiss={dismiss} readOnly rotate={rotate} flow={flow} />
      )}
      <div className="iso-toolbar">
        {view && (
          <div className="iso-controls" role="toolbar" aria-label={t('tool.label')}>
            <div className="zoombar iso-rotation" role="group" aria-label={t('iso.orbit')}>
              <button type="button" ref={orbitButton} className="chip-button iso-orbit-toggle" aria-pressed={orbiting} onClick={() => {
                setOrbiting(!orbiting);
                if (!orbiting) ref.current?.focus({ preventScroll: true });
              }}>
                <Icon name="rotateRight" size={14} />{t('iso.orbit')}
              </button>
              <IconButton icon="rotateLeft" label={t('iso.rotateLeft')} onClick={() => rotate(-1)} />
              <span className="iso-angle" aria-label={t('iso.angle', { degrees: angleDisplay })}>{angleDisplay}°</span>
              <IconButton icon="rotateRight" label={t('iso.rotateRight')} onClick={() => rotate(1)} />
              <button type="button" className="chip-button" onClick={resetRotation}>{t('iso.home')}</button>
            </div>
            <Segmented label={t('iso.labels')} value={options.labels} onChange={(labels) => {
              cancelTurn();
              setPreview(null);
              onOptions({ labels, rotation: angle, labelOffsets: null });
            }}
              options={(['compact', 'full'] as const).map((value) => ({ value, label: t(`iso.${value}`) }))} />
            <FlowControls t={t} flow={flow} rotation={angle} />
          </div>
        )}
        <div className="iso-view-note" role="status">{t('canvas.readonly')}</div>
        {orbiting && <div className="iso-view-note" role="status">{t('iso.orbitHint')}</div>}
      </div>
      {view && (
        <div className="canvas-corner">
          <ZoomBar t={t} viewport={view} size={size} setViewport={setView} onFit={fit} />
        </div>
      )}
    </>
  );
}
