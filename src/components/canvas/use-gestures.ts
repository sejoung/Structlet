import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Editor, SessionSnapshot } from '../../application';
import { indexDocument, type Endpoint, type Id, type Point, type Rect } from '../../domain';
import { dragSegment, edgeAt, idsInRect, MAX_ZOOM, MIN_ZOOM, screenToWorld, snapMove, snapToGrid, type Guide, type Scene, type Viewport } from '../../engine';
import { dropParents, endpointAt, movableIds, movingRect, movingSet, resizeRect, type ResizeHandle } from './endpoints';

type Gesture =
  | { type: 'pan'; start: Point; from: Viewport }
  | { type: 'pinch'; distance: number; mid: Point; from: Viewport }
  | { type: 'marquee'; start: Point; additive: boolean; base: readonly Id[] }
  | { type: 'move'; ids: Id[]; start: Point; startScreen: Point; pressed: Id; moved: boolean; shift: boolean; delta: Point; base: Rect | null; others: Rect[] }
  | { type: 'resize'; id: Id; handle: ResizeHandle; start: Point; rect: Rect; current: Rect | null }
  | { type: 'connect'; from: Id; start: Point }
  | { type: 'endpoint'; edgeId: Id; which: 'source' | 'target'; current: Endpoint | null }
  | { type: 'segment'; edgeId: Id; index: number; start: Point; startScreen: Point; path: readonly Point[]; waypoints: Point[] | null }
  | { type: 'waypoint'; edgeId: Id; index: number; waypoints: Point[]; moved: boolean; insert: boolean };

export interface CanvasOverlay {
  marquee: Rect | null;
  guides: readonly Guide[];
  connect: { from: Point; to: Point; target: Id | null } | null;
}

const EMPTY_OVERLAY: CanvasOverlay = { marquee: null, guides: [], connect: null };

/** `select` edits; `hand` only moves the view; `connect` draws a line from box to box. */
export type CanvasTool = 'select' | 'hand' | 'connect';

interface GestureDeps {
  svgRef: RefObject<SVGSVGElement | null>;
  editor: Editor;
  snapshot: SessionSnapshot;
  scene: Scene;
  viewport: Viewport;
  setViewport(v: Viewport): void;
  spaceDown: RefObject<boolean>;
  tool: CanvasTool;
}

function hitOf(target: EventTarget | null): { kind: string; id: string; data: DOMStringMap } | null {
  const el = (target as Element | null)?.closest?.('[data-hit]') as (HTMLElement | SVGElement) | null;
  if (!el) return null;
  return { kind: el.dataset.hit ?? '', id: el.dataset.id ?? '', data: el.dataset };
}

export function useGestures(deps: GestureDeps) {
  const latest = useRef(deps);
  latest.current = deps;
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const [overlay, setOverlay] = useState<CanvasOverlay>(EMPTY_OVERLAY);
  const [hover, setHover] = useState<Id | null>(null);

  const screenOf = (e: { clientX: number; clientY: number }): Point => {
    const r = latest.current.svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldOf = (e: { clientX: number; clientY: number }) => screenToWorld(latest.current.viewport, screenOf(e));

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const { editor, snapshot, scene, viewport, spaceDown, tool } = latest.current;
    if (e.button === 2) return;
    const world = worldOf(e);
    const hit = hitOf(e.target);
    const selection = snapshot.selection;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is no longer active (e.g. already lifted); the gesture still works without capture.
    }
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, screenOf(e));
      if (touches.current.size === 2) {
        editor.cancelPreview();
        const [a, b] = [...touches.current.values()] as [Point, Point];
        gesture.current = { type: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, from: viewport };
        return;
      }
      if (!hit) {
        gesture.current = { type: 'pan', start: screenOf(e), from: viewport };
        return;
      }
    }
    if (e.button === 1 || spaceDown.current || tool === 'hand') {
      gesture.current = { type: 'pan', start: screenOf(e), from: viewport };
      return;
    }
    if (tool === 'connect') {
      // Any box starts a line; empty space moves the view.
      const from = hit?.kind === 'box' || hit?.kind === 'connect' ? hit.id : null;
      if (from) {
        const r = scene.rects.get(from);
        gesture.current = { type: 'connect', from, start: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : world };
        setOverlay({ ...EMPTY_OVERLAY, connect: { from: gesture.current.start, to: world, target: null } });
      } else if (hit?.kind === 'edge') {
        editor.session.select([hit.id]);
      } else {
        gesture.current = { type: 'pan', start: screenOf(e), from: viewport };
      }
      return;
    }
    const doc = snapshot.document;
    const edge = (id: Id) => indexDocument(doc).edges.get(id);
    switch (hit?.kind) {
      case 'connect': {
        gesture.current = { type: 'connect', from: hit.id, start: { x: Number(hit.data.x), y: Number(hit.data.y) } };
        return;
      }
      case 'resize': {
        const rect = scene.rects.get(hit.id);
        if (rect) gesture.current = { type: 'resize', id: hit.id, handle: hit.data.handle as ResizeHandle, start: world, rect, current: null };
        return;
      }
      case 'endpoint': {
        gesture.current = { type: 'endpoint', edgeId: hit.id, which: hit.data.which as 'source' | 'target', current: null };
        return;
      }
      case 'segment': {
        const e2 = scene.edges.find((x) => x.id === hit.id);
        const model = edge(hit.id);
        if (!e2 || !model) return;
        const index = Number(hit.data.index);
        if (model.style.shape === 'straight') {
          const wps = [...model.waypoints];
          const at = { x: Math.round(world.x), y: Math.round(world.y) };
          wps.splice(index, 0, at);
          gesture.current = { type: 'waypoint', edgeId: hit.id, index, waypoints: wps, moved: false, insert: true };
        } else gesture.current = { type: 'segment', edgeId: hit.id, index, start: world, startScreen: screenOf(e), path: e2.points, waypoints: null };
        return;
      }
      case 'waypoint': {
        const model = edge(hit.id);
        if (model) gesture.current = { type: 'waypoint', edgeId: hit.id, index: Number(hit.data.index), waypoints: [...model.waypoints], moved: false, insert: false };
        return;
      }
      case 'edge': {
        editor.session.select(e.shiftKey ? toggle(selection, hit.id) : [hit.id]);
        const e2 = scene.edges.find((x) => x.id === hit.id);
        const model = edge(hit.id);
        const near = edgeAt(scene, world, 8 / viewport.zoom);
        if (e2 && model && model.style.shape === 'orthogonal' && near && near.id === hit.id && !e.shiftKey) {
          gesture.current = { type: 'segment', edgeId: hit.id, index: near.segment, start: world, startScreen: screenOf(e), path: e2.points, waypoints: null };
        }
        return;
      }
      case 'box':
      case 'annotation': {
        const isContainer = indexDocument(doc).containers.has(hit.id);
        if (isContainer && e.altKey) break;
        let next = selection;
        if (e.shiftKey) next = toggle(selection, hit.id);
        else if (!selection.includes(hit.id)) next = [hit.id];
        editor.session.select(next);
        const ids = movableIds(doc, next.includes(hit.id) ? next : [...next, hit.id]);
        const exclude = movingSet(doc, ids);
        const others = [...scene.rects].filter(([id]) => !exclude.has(id)).map(([, r]) => r);
        gesture.current = { type: 'move', ids, start: world, startScreen: screenOf(e), pressed: hit.id, moved: false, shift: e.shiftKey, delta: { x: 0, y: 0 }, base: movingRect(scene, ids), others };
        return;
      }
      default:
        break;
    }
    if (!e.shiftKey) editor.session.select([]);
    gesture.current = { type: 'marquee', start: world, additive: e.shiftKey, base: e.shiftKey ? selection : [] };
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const { editor, scene, viewport, setViewport, tool } = latest.current;
    const g = gesture.current;
    if (!g) {
      if (tool === 'hand') return;
      const hit = hitOf(e.target);
      const id = hit && (hit.kind === 'box' || hit.kind === 'connect') ? hit.id : null;
      if (id !== hover) setHover(id);
      return;
    }
    const world = worldOf(e);
    const screen = screenOf(e);
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, screen);
    switch (g.type) {
      case 'pinch': {
        const pts = [...touches.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts as [Point, Point];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.from.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.distance)));
        const anchor = { x: (g.mid.x - g.from.panX) / g.from.zoom, y: (g.mid.y - g.from.panY) / g.from.zoom };
        setViewport({ zoom, panX: mid.x - anchor.x * zoom, panY: mid.y - anchor.y * zoom });
        return;
      }
      case 'pan':
        setViewport({ ...g.from, panX: g.from.panX + screen.x - g.start.x, panY: g.from.panY + screen.y - g.start.y });
        return;
      case 'marquee':
        setOverlay({ ...EMPTY_OVERLAY, marquee: normalizeRect(g.start, world) });
        return;
      case 'move': {
        if (!g.moved && Math.hypot(screen.x - g.startScreen.x, screen.y - g.startScreen.y) < 3) return;
        g.moved = true;
        const dx = world.x - g.start.x;
        const dy = world.y - g.start.y;
        let delta = { x: Math.round(dx), y: Math.round(dy) };
        let guides: readonly Guide[] = [];
        if (g.base && !e.altKey) {
          const snapped = snapMove(g.base, dx, dy, g.others, 6 / viewport.zoom);
          delta = { x: Math.round(snapped.dx), y: Math.round(snapped.dy) };
          guides = snapped.guides;
        }
        g.delta = delta;
        editor.previewMove(g.ids, delta);
        setOverlay({ ...EMPTY_OVERLAY, guides });
        return;
      }
      case 'resize': {
        g.current = resizeRect(g.rect, g.handle, world.x - g.start.x, world.y - g.start.y);
        editor.previewBounds(g.id, g.current);
        return;
      }
      case 'connect': {
        const target = endpointAt(scene, world, new Set([g.from]), viewport.zoom);
        setOverlay({ ...EMPTY_OVERLAY, connect: { from: g.start, to: world, target: target.kind === 'attached' ? target.objectId : null } });
        return;
      }
      case 'endpoint': {
        g.current = endpointAt(scene, world, new Set(), viewport.zoom);
        editor.previewUpdate('edges', g.edgeId, { [g.which]: g.current });
        return;
      }
      case 'segment': {
        if (!g.waypoints && Math.hypot(screen.x - g.startScreen.x, screen.y - g.startScreen.y) < 3) return;
        const a = g.path[g.index];
        const b = g.path[g.index + 1];
        if (!a || !b) return;
        const horizontal = Math.abs(a.y - b.y) < 0.5;
        const delta = horizontal ? { x: 0, y: snapToGrid(a.y + world.y - g.start.y) - a.y } : { x: snapToGrid(a.x + world.x - g.start.x) - a.x, y: 0 };
        g.waypoints = dragSegment(g.path, g.index, delta);
        editor.previewUpdate('edges', g.edgeId, { routingMode: 'manual', waypoints: g.waypoints });
        return;
      }
      case 'waypoint': {
        g.moved = true;
        g.waypoints[g.index] = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
        editor.previewUpdate('edges', g.edgeId, { routingMode: 'manual', waypoints: [...g.waypoints] });
        return;
      }
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    const { editor, scene, viewport, snapshot } = latest.current;
    touches.current.delete(e.pointerId);
    if (gesture.current?.type === 'pinch') {
      if (touches.current.size === 0) gesture.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setOverlay(EMPTY_OVERLAY);
    if (!g) return;
    const world = worldOf(e);
    switch (g.type) {
      case 'marquee': {
        const r = normalizeRect(g.start, world);
        if (r.width < 2 && r.height < 2) return;
        const ids = idsInRect(scene, r);
        editor.session.select(g.additive ? [...new Set([...g.base, ...ids])] : ids);
        return;
      }
      case 'move': {
        if (!g.moved) {
          editor.cancelPreview();
          if (!g.shift && snapshot.selection.length > 1) editor.session.select([g.pressed]);
          return;
        }
        editor.move(g.ids, g.delta, dropParents(snapshot.document, scene, g.ids));
        return;
      }
      case 'resize':
        if (g.current) editor.setBounds(g.id, g.current);
        else editor.cancelPreview();
        return;
      case 'connect': {
        const target = endpointAt(scene, world, new Set([g.from]), viewport.zoom);
        if (target.kind === 'attached') editor.connect({ kind: 'attached', objectId: g.from, side: 'auto', offset: null }, target);
        return;
      }
      case 'endpoint':
        if (g.current) editor.update('edges', g.edgeId, { [g.which]: g.current });
        else editor.cancelPreview();
        return;
      case 'segment':
        if (g.waypoints) editor.setRoute(g.edgeId, g.waypoints);
        else editor.cancelPreview();
        return;
      case 'waypoint':
        if (g.moved || g.insert) editor.setRoute(g.edgeId, g.waypoints);
        else editor.cancelPreview();
        return;
      case 'pan':
        return;
    }
  }

  function onPointerCancel(e: ReactPointerEvent<SVGSVGElement>) {
    touches.current.delete(e.pointerId);
    gesture.current = null;
    setOverlay(EMPTY_OVERLAY);
    latest.current.editor.cancelPreview();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, overlay, hover, worldOf };
}

function toggle(list: readonly Id[], id: Id): Id[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

