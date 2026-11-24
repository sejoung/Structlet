import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type Ref } from 'react';
import type { Editor, SessionSnapshot } from '../../application';
import { getBox, indexDocument, type Id, type Point, type Rect } from '../../domain';
import { fitView, groupBounds, MAX_ZOOM, objectBounds, polylineMidpoint, renderSceneBody, screenToWorld, worldToScreen, zoomAt, type DiagramTheme, type IsometricOptions, type Scene, type Viewport } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { SERVICE_DRAG_TYPE } from '../sidebar/types';
import { InfrastructureDialog } from '../properties/InfrastructureDetails';
import type { ViewMode } from '../Toolbar';
import { ContextMenu, type ContextActions, type ContextRequest } from './ContextMenu';
import { FoldControls } from './FoldControls';
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
  focusObjects: Ref<(ids: readonly Id[]) => void>;
  onResize(size: { width: number; height: number }): void;
  onDropService(serviceId: string, world: Point): void;
  summary: boolean;
  context: ContextActions;
  onToggleArea(id: Id): void;
  editing: Id | null;
  setEditing(id: Id | null): void;
  theme: DiagramTheme;
  view: ViewMode;
  isoView: Required<IsometricOptions>;
  onIsoView(view: Required<IsometricOptions>): void;
  onFit(): void;
  tool: CanvasTool;
  onTool(tool: CanvasTool): void;
  presenting: boolean;
}

function tabOrder(scene: Scene): Id[] {
  return [...scene.containers.map((c) => c.id), ...scene.nodes.map((n) => n.id), ...scene.edges.map((e) => e.id), ...scene.annotations.map((a) => a.id)];
}

export function Canvas(props: CanvasProps) {
  const { t, editor, snapshot, scene, viewport, setViewport } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isoFocus = useRef<(ids: readonly Id[]) => void>(null);
  const showBounds = (bounds: Rect | null, maximum?: number) => {
    const size = svgRef.current?.getBoundingClientRect();
    if (bounds && size?.width && size.height) setViewport(fitView(bounds, size, 48, maximum));
  };
  useImperativeHandle(props.focusObjects, () => (ids) => {
    if (props.view === 'isometric') isoFocus.current?.(ids);
    else showBounds(objectBounds(scene, ids));
  });
  const [detail, setDetail] = useState<{ docId: Id; objectId: Id } | null>(null);
  const inspected = detail?.docId === snapshot.document.id ? getBox(snapshot.document, detail.objectId) : undefined;
  const inspect = (id: Id) => {
    if (scene.rects.has(id) && getBox(snapshot.document, id)?.infrastructure) {
      setDetail({ docId: snapshot.document.id, objectId: id });
    }
  };
  const details = inspected?.infrastructure && <InfrastructureDialog target={inspected} t={t} onClose={() => setDetail(null)} />;
  const readPointer = useRef<(Point & { id: Id }) | null>(null);
  const [menu, setMenu] = useState<ContextRequest | null>(null);
  const dismissMenu = useCallback((restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) svgRef.current?.focus({ preventScroll: true });
  }, []);
  const spaceDown = useRef(false);
  const [panning, setPanning] = useState(false);
  const latest = useRef({ viewport, setViewport });
  latest.current = { viewport, setViewport };
  const tool: CanvasTool = props.presenting || props.summary ? 'hand' : props.tool;
  const gestures = useGestures({ svgRef, editor, snapshot, scene, viewport, setViewport, spaceDown, tool, summary: props.summary && !props.presenting });
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
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.closest?.('button, dialog, input, textarea, select, [contenteditable="true"]');
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
    if (!serviceId || props.summary) return;
    e.preventDefault();
    const r = svgRef.current!.getBoundingClientRect();
    props.onDropService(serviceId, screenToWorld(viewport, { x: e.clientX - r.left, y: e.clientY - r.top }));
  };

  const showMenu = (screen: Point, ids: readonly Id[]) => {
    const box = svgRef.current!.getBoundingClientRect();
    const world = screenToWorld(viewport, { x: screen.x - box.left, y: screen.y - box.top });
    editor.session.select(ids);
    setMenu({ screen, world, ids, docId: snapshot.document.id });
  };

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (target.closest('textarea, input, select, .canvas-context-menu')) return;
    e.preventDefault();
    if (props.presenting) return;
    const id = target.closest<SVGElement | HTMLElement>('[data-hit], [data-fold-id]')?.dataset;
    const object = id?.id ?? id?.foldId;
    const ids = object ? (snapshot.selection.includes(object) ? snapshot.selection : [object]) : [];
    showMenu({ x: e.clientX, y: e.clientY }, ids);
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    e.currentTarget.dataset.keyboard = 'true';
    if (!props.presenting && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      e.preventDefault();
      const visible = new Set(tabOrder(scene));
      const selected = snapshot.selection.filter((id) => visible.has(id));
      const id = selected[0];
      const rect = id ? scene.rects.get(id) ?? scene.annotations.find((a) => a.id === id)?.rect : undefined;
      const edge = id ? scene.edges.find((edge) => edge.id === id) : undefined;
      const box = e.currentTarget.getBoundingClientRect();
      const point = rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        : edge ? polylineMidpoint(edge.points).point : null;
      const p = point ? worldToScreen(viewport, point) : { x: box.width / 2, y: box.height / 2 };
      showMenu({ x: box.left + Math.max(0, Math.min(box.width, p.x)), y: box.top + Math.max(0, Math.min(box.height, p.y)) }, selected);
      return;
    }
    if (e.key === 'Enter' && (props.presenting || props.summary) && snapshot.selection.length === 1) {
      inspect(snapshot.selection[0]!);
      return;
    }
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
        <IsometricView t={t} scene={scene} theme={props.theme} options={props.isoView} onOptions={props.onIsoView}
          doc={snapshot.document} editor={editor} context={props.context} toggle={props.onToggleArea} presenting={props.presenting} focusObjects={isoFocus} inspect={inspect} />
        {details}
      </div>
    );
  }

  const empty = snapshot.document.nodes.length === 0 && snapshot.document.containers.length === 0 && snapshot.document.annotations.length === 0;
  const fitGroup = (id: Id) => showBounds(groupBounds(snapshot.document, scene, id), MAX_ZOOM);
  const grid = 16 * viewport.zoom;
  const z = viewport.zoom;

  return (
    <div
      ref={wrapRef}
      className={`canvas tool-${tool}${panning ? ' panning' : ''}`}
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${viewport.panX}px ${viewport.panY}px` }}
      onDragOver={(e) => {
        if (!props.summary && e.dataTransfer.types.includes(SERVICE_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
    >
      {!props.presenting && <FoldControls t={t} doc={snapshot.document} scene={scene} viewport={viewport} size={size} onToggle={props.onToggleArea} />}
      <svg
        ref={svgRef}
        className="canvas-svg"
        data-testid="canvas"
        tabIndex={0}
        role="application"
        aria-label={t('canvas.label')}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          const id = (e.target as Element).closest('[data-hit="box"]')?.getAttribute('data-id');
          readPointer.current = (props.presenting || props.summary) && e.isPrimary && e.button === 0 && id
            ? { x: e.clientX, y: e.clientY, id } : null;
          delete e.currentTarget.dataset.keyboard;
          gestures.onPointerDown(e);
        }}
        onPointerMove={(e) => {
          const p = readPointer.current;
          if (p && (!e.isPrimary || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5)) readPointer.current = null;
          gestures.onPointerMove(e);
        }}
        onPointerUp={(e) => {
          const p = readPointer.current;
          readPointer.current = null;
          gestures.onPointerUp(e);
          if (p && e.isPrimary && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 5) inspect(p.id);
        }}
        onPointerCancel={(e) => {
          readPointer.current = null;
          gestures.onPointerCancel(e);
        }}
        onDoubleClick={onDoubleClick}
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
                {n.specCaption && <rect className="hit-area" {...n.specCaption.box} />}
              </g>
            ))}
            {scene.edges.map((e) =>
              e.labelBox ? <rect key={`l-${e.id}`} data-hit="edge" data-id={e.id} className="hit-area" x={e.labelBox.x} y={e.labelBox.y} width={e.labelBox.width} height={e.labelBox.height} /> : null,
            )}
            {scene.annotations.map((a) => (
              <rect key={a.id} data-hit="annotation" data-id={a.id} className="hit-area" x={a.rect.x} y={a.rect.y} width={a.rect.width} height={a.rect.height} />
            ))}
          </g>
          {(tool !== 'hand' || (props.summary && !props.presenting)) && <Handles readOnly={props.summary} scene={scene} selection={snapshot.selection} hover={tool === 'select' ? gestures.hover : null} zoom={z} overlay={gestures.overlay} connecting={!!gestures.overlay.connect} />}
        </g>
      </svg>
      {props.summary && !props.presenting && <div className="tool-hint present" role="status">{t(props.context.diagram.content === 'all' ? 'summary.hint' : 'diagramContent.hint')}</div>}
      {!props.presenting && !props.summary && <ToolBar t={t} tool={props.tool} onTool={props.onTool} />}
      {!props.presenting && !props.summary && props.tool === 'connect' && <div className="tool-hint" role="status">{t('tool.connectHint')}</div>}
      {presentHint && <div className="tool-hint present" role="status">{t('view.hint')}</div>}
      {menu?.docId === snapshot.document.id && !props.presenting && <ContextMenu {...props.context} t={t} doc={snapshot.document} scene={scene} editor={editor} request={menu} fit={props.onFit} fitGroup={fitGroup} edit={props.setEditing} inspect={inspect} toggle={props.onToggleArea} dismiss={dismissMenu} />}
      {details}
      <div className="canvas-corner">
        <ZoomBar t={t} viewport={viewport} size={size} setViewport={setViewport} onFit={props.onFit} />
        <Minimap scene={scene} viewport={viewport} size={size} setViewport={setViewport} label={t('minimap')} />
      </div>
      <div className="sr-only" aria-live="polite" data-testid="announcer">{announcement}</div>
      {!props.summary && props.editing && <InlineEditor key={props.editing} id={props.editing} {...props} />}
      {empty && !props.presenting && (
        <div className="empty-state">
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.body')}</p>
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
