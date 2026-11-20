import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { Editor, SessionSnapshot } from '../../application';
import { indexDocument, type Id, type Point } from '../../domain';
import { polylineMidpoint, renderSceneBody, screenToWorld, worldToScreen, zoomAt, type Scene, type Viewport } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { SERVICE_DRAG_TYPE } from '../Palette';
import { Handles } from './Handles';
import { useGestures } from './use-gestures';

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
}

export function Canvas(props: CanvasProps) {
  const { t, editor, snapshot, scene, viewport, setViewport } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);
  const [panning, setPanning] = useState(false);
  const latest = useRef({ viewport, setViewport });
  latest.current = { viewport, setViewport };
  const gestures = useGestures({ svgRef, editor, snapshot, scene, viewport, setViewport, spaceDown });
  const markup = useMemo(() => renderSceneBody(scene), [scene]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && props.onResize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  }, []);

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

  const empty = snapshot.document.nodes.length === 0 && snapshot.document.containers.length === 0 && snapshot.document.annotations.length === 0;
  const grid = 16 * viewport.zoom;
  const z = viewport.zoom;

  return (
    <div
      ref={wrapRef}
      className={`canvas${panning ? ' panning' : ''}`}
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
        onPointerDown={gestures.onPointerDown}
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
          <Handles scene={scene} selection={snapshot.selection} hover={gestures.hover} zoom={z} overlay={gestures.overlay} connecting={!!gestures.overlay.connect} />
        </g>
      </svg>
      {props.editing && <InlineEditor key={props.editing} id={props.editing} {...props} />}
      {empty && (
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
