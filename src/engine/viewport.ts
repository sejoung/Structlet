import type { Point, Rect } from '../domain';

export interface Viewport {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;
export const DEFAULT_VIEWPORT: Viewport = { panX: 80, panY: 60, zoom: 1 };

export function screenToWorld(v: Viewport, p: Point): Point {
  return { x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom };
}

export function worldToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
}

export function zoomAt(v: Viewport, anchor: Point, factor: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(Math.min(MIN_ZOOM, v.zoom), v.zoom * factor));
  const w = screenToWorld(v, anchor);
  return { zoom, panX: anchor.x - w.x * zoom, panY: anchor.y - w.y * zoom };
}

export function fitView(bounds: Rect | null, size: { width: number; height: number }, padding = 48, maximum = 1.5): Viewport {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return DEFAULT_VIEWPORT;
  const width = Math.max(1, size.width - padding * 2);
  const height = Math.max(1, size.height - padding * 2);
  const zoom = Math.min(maximum, width / bounds.width, height / bounds.height);
  return {
    zoom,
    panX: (size.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    panY: (size.height - bounds.height * zoom) / 2 - bounds.y * zoom,
  };
}
