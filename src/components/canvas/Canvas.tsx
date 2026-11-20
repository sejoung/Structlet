import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import type { Editor, SessionSnapshot } from '../../application';
import { indexDocument, type Id, type Point } from '../../domain';
import { polylineMidpoint, renderSceneBody, screenToWorld, worldToScreen, zoomAt, type DiagramTheme, type Scene, type Viewport } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { SERVICE_DRAG_TYPE } from '../sidebar/types';
import type { ViewMode } from '../Toolbar';
import { Handles } from './Handles';
import { IsometricView } from './IsometricView';
import { Minimap } from './Minimap';
import { ZoomBar } from './ZoomBar';
import { ToolBar } from './ToolBar';
import { useGestures, type CanvasTool } from './use-gestures';

interface CanvasProps {
  t: Translate;
  editor: Editor;
  snapshot: SessionSnapshot;
  scene: Scene;
  viewport: Viewport;
  setViewport(v: Viewport): void;
  onResize(size: { width: number; height: number }): void;
  onDropService(serviceId: string, world: Point): void;
  onOpenSample(): void;
  editing: Id | null;
  setEditing(id: Id | null): void;
  theme: DiagramTheme;
  view: ViewMode;
  onFit(): void;
  tool: CanvasTool;
  onTool(tool: CanvasTool): void;
  /** View mode: no editing handles and no tool switch. */
  presenting: boolean;
}

/** Objects in reading order for keyboard navigation. */
function tabOrder(scene: Scene): Id[] {
  return [...scene.containers.map((c) => c.id), ...scene.nodes.map((n) => n.id), ...scene.edges.map((e) => e.id), ...scene.annotations.map((a) => a.id)];
}

export function Canvas(props: CanvasProps) {
  const { t, editor, snapshot, scene, viewport, setViewport } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);
  const [panning, setPanning] = useState(false);
  const latest = useRef({ viewport, setViewport });
  latest.current = { viewport, setViewport };
  const tool: CanvasTool = props.presenting ? 'hand' : props.tool;
  const gestures = useGestures({ svgRef, editor, snapshot, scene, viewport, setViewport, spaceDown, tool });
  const markup = useMemo(() => renderSceneBody(scene, props.theme), [scene, props.theme]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [presentHint, setPresentHint] = useState(false);
  useEffect(() => {
    setPresentHint(props.presenting);
    if (!props.presenting) return;
    const timer = setTimeout(() => setPresentHint(false), 4000);
    return () => clearTimeout(timer);
  }, [props.presenting]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      props.onResize(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.view]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { viewport: v, setViewport: set } = latest.current;
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) set(zoomAt(v, p, Math.exp(-e.deltaY * 0.01)));
      else set({ ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [props.view]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        spaceDown.current = true;
        setPanning(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        setPanning(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onDoubleClick = (e: MouseEvent) => {
    if (tool !== 'select') return;
    // Pointer capture retargets dblclick to the <svg>, so look up what is under the pointer.
    const under = document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);
    const el = under.closest('[data-hit]') as SVGElement | null;
    const kind = el?.dataset.hit;
    const id = el?.dataset.id;
    if (!kind || !id) return;
    if (kind === 'waypoint') {
      const edge = indexDocument(snapshot.committed).edges.get(id);
      if (edge) editor.setRoute(id, edge.waypoints.filter((_, i) => i !== Number(el.dataset.index)));
      return;
    }
    if (kind === 'box' || kind === 'annotation' || kind === 'edge') {
      const isStep = indexDocument(snapshot.committed).annotations.get(id)?.kind === 'step';
      if (!isStep || kind === 'annotation') props.setEditing(id);
    }
  };

  const onDrop = (e: DragEvent) => {
    const serviceId = e.dataTransfer.getData(SERVICE_DRAG_TYPE);
    if (!serviceId) return;
    e.preventDefault();
    const r = svgRef.current!.getBoundingClientRect();
    props.onDropService(serviceId, screenToWorld(viewport, { x: e.clientX - r.left, y: e.clientY - r.top }));
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    // Show the focus ring only for keyboard use; pointer use clears it.
    e.currentTarget.dataset.keyboard = 'true';
    if (e.key !== 'Tab') return;
    const order = tabOrder(scene);
    if (order.length === 0) return;
    e.preventDefault();
    const current = snapshot.selection.length === 1 ? order.indexOf(snapshot.selection[0]!) : -1;
    const next = current < 0 ? (e.shiftKey ? order.length - 1 : 0) : (current + (e.shiftKey ? -1 : 1) + order.length) % order.length;
    editor.session.select([order[next]!]);
    const r = scene.rects.get(order[next]!) ?? scene.annotations.find((a) => a.id === order[next])?.rect;
    if (r) {
      const p = worldToScreen(viewport, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
      if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height) setViewport({ ...viewport, panX: viewport.panX + size.width / 2 - p.x, panY: viewport.panY + size.height / 2 - p.y });
    }
  };

  const announcement = useMemo(() => {
    if (snapshot.selection.length !== 1) return '';
    const id = snapshot.selection[0]!;
    const index = indexDocument(snapshot.document);
    const kind = index.nodes.has(id) ? t('props.node') : index.containers.has(id) ? t('props.area') : index.edges.has(id) ? t('props.edge') : t('props.annotation');
    const o = index.nodes.get(id) ?? index.containers.get(id) ?? index.edges.get(id);
    const label = (o ? o.label : (index.annotations.get(id)?.text ?? '')).replace(/\n/g, ' ');
    return t('canvas.selected', { kind, label });
  }, [snapshot.selection, snapshot.document, t]);

  if (props.view === 'isometric') {
    return (
      <div ref={wrapRef} className="canvas">
        <IsometricView scene={scene} theme={props.theme} notice={t('canvas.readonly')} />
      </div>
    );
  }

  const empty = snapshot.document.nodes.length === 0 && snapshot.document.containers.length === 0 && snapshot.document.annotations.length === 0;
  const grid = 16 * viewport.zoom;
  const z = viewport.zoom;

  return (
    <div
      ref={wrapRef}
      className={`canvas tool-${tool}${panning ? ' panning' : ''}`}
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${viewport.panX}px ${viewport.panY}px` }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(SERVICE_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
    >
      <svg
        ref={svgRef}
        className="canvas-svg"
        data-testid="canvas"
        tabIndex={0}
        role="application"
        aria-label={t('canvas.label')}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          delete e.currentTarget.dataset.keyboard;
          gestures.onPointerDown(e);
        }}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.onPointerUp}
        onPointerCancel={gestures.onPointerCancel}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${viewport.panX} ${viewport.panY}) scale(${z})`}>
          <g className="diagram" dangerouslySetInnerHTML={{ __html: markup }} />
          <g className="hits">
            {scene.containers.map((c) => (
              <rect key={c.id} data-hit="box" data-id={c.id} className="hit-area" x={c.rect.x} y={c.rect.y} width={c.rect.width} height={c.rect.height} />
            ))}
            {scene.edges.map((e) => (
              <path key={e.id} data-hit="edge" data-id={e.id} className="hit-edge" d={e.points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} strokeWidth={12 / z} />
            ))}
            {scene.nodes.map((n) => (
              <g key={n.id} data-hit="box" data-id={n.id} data-testid={`node-${n.id}`}>
                <rect className="hit-area" x={n.rect.x} y={n.rect.y} width={n.rect.width} height={n.rect.height} />
                {n.labelBox && <rect className="hit-area" x={n.labelBox.x} y={n.labelBox.y} width={n.labelBox.width} height={n.labelBox.height} />}
              </g>
            ))}
            {scene.edges.map((e) =>
              e.labelBox ? <rect key={`l-${e.id}`} data-hit="edge" data-id={e.id} className="hit-area" x={e.labelBox.x} y={e.labelBox.y} width={e.labelBox.width} height={e.labelBox.height} /> : null,
            )}
            {scene.annotations.map((a) => (
              <rect key={a.id} data-hit="annotation" data-id={a.id} className="hit-area" x={a.rect.x} y={a.rect.y} width={a.rect.width} height={a.rect.height} />
            ))}
          </g>
          {tool !== 'hand' && <Handles scene={scene} selection={snapshot.selection} hover={tool === 'select' ? gestures.hover : null} zoom={z} overlay={gestures.overlay} connecting={!!gestures.overlay.connect} />}
        </g>
      </svg>
      {!props.presenting && <ToolBar t={t} tool={props.tool} onTool={props.onTool} />}
      {!props.presenting && props.tool === 'connect' && <div className="tool-hint" role="status">{t('tool.connectHint')}</div>}
      {presentHint && <div className="tool-hint present" role="status">{t('view.hint')}</div>}
      <div className="canvas-corner">
        <ZoomBar t={t} viewport={viewport} size={size} setViewport={setViewport} onFit={props.onFit} />
        <Minimap scene={scene} viewport={viewport} size={size} setViewport={setViewport} label={t('minimap')} />
      </div>
      <div className="sr-only" aria-live="polite" data-testid="announcer">{announcement}</div>
      {props.editing && <InlineEditor key={props.editing} id={props.editing} {...props} />}
      {empty && !props.presenting && (
        <div className="empty-state">
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.body')}</p>
          <button type="button" onClick={props.onOpenSample}>{t('empty.sample')}</button>
        </div>
      )}
    </div>
  );
}

function InlineEditor({ id, editor, snapshot, scene, viewport, setEditing }: CanvasProps & { id: Id }) {
  const index = indexDocument(snapshot.committed);
  const node = index.nodes.get(id);
  const container = index.containers.get(id);
  const edge = index.edges.get(id);
  const annotation = index.annotations.get(id);
  const initial = node?.label ?? container?.label ?? edge?.label ?? annotation?.text ?? '';
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  let world: { x: number; y: number; width: number } | null = null;
  const r = scene.rects.get(id);
  if (node && r) world = { x: r.x + r.width / 2 - 80, y: r.y + r.height + 4, width: 160 };
  if (container && r) world = { x: r.x + 26, y: r.y + 1, width: Math.min(Math.max(r.width - 34, 120), 320) };
  const se = scene.edges.find((e) => e.id === id);
  if (se) {
    const m = polylineMidpoint(se.points).point;
    world = { x: m.x - 80, y: m.y - 12, width: 160 };
  }
  const sa = scene.annotations.find((a) => a.id === id);
  if (sa) world = { x: sa.rect.x, y: sa.rect.y, width: Math.max(sa.rect.width + 24, 200) };
  if (!world) return null;
  const p = worldToScreen(viewport, world);

  const commit = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    if (value !== null && value !== initial) editor.rename(id, value);
    editor.session.breakCoalescing();
    setEditing(null);
  };

  return (
    <textarea
      ref={ref}
      className="inline-editor"
      aria-label="label"
      defaultValue={initial}
      rows={Math.max(1, initial.split('\n').length)}
      style={{ left: p.x, top: p.y, width: world.width * viewport.zoom, fontSize: Math.max(11, 12 * viewport.zoom) }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit(e.currentTarget.value);
        }
        if (e.key === 'Escape') commit(null);
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  );
}
