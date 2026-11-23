import { useRef, type PointerEvent } from 'react';
import { AREA_STROKE, screenToWorld, union, type Scene, type Viewport } from '../../engine';

const W = 180;
const H = 120;

export function Minimap({ scene, viewport, size, setViewport, label }: { scene: Scene; viewport: Viewport; size: { width: number; height: number }; setViewport(v: Viewport): void; label: string }) {
  const dragging = useRef(false);
  if (!scene.bounds || size.width === 0) return null;
  const tl = screenToWorld(viewport, { x: 0, y: 0 });
  const br = screenToWorld(viewport, { x: size.width, y: size.height });
  const view = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  const world = union([scene.bounds, view])!;
  const scale = Math.min((W - 8) / world.width, (H - 8) / world.height);
  const ox = (W - world.width * scale) / 2 - world.x * scale;
  const oy = (H - world.height * scale) / 2 - world.y * scale;
  const moveTo = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left - ox) / scale;
    const wy = (e.clientY - r.top - oy) / scale;
    setViewport({ ...viewport, panX: size.width / 2 - wx * viewport.zoom, panY: size.height / 2 - wy * viewport.zoom });
  };
  return (
    <svg
      className="minimap"
      width={W}
      height={H}
      role="img"
      aria-label={label}
      data-testid="minimap"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => dragging.current && moveTo(e)}
      onPointerUp={() => (dragging.current = false)}
    >
      <g transform={`translate(${ox} ${oy}) scale(${scale})`}>
        {scene.containers.map((c) => (
          <rect key={c.id} x={c.rect.x} y={c.rect.y} width={c.rect.width} height={c.rect.height} fill="none" stroke={AREA_STROKE[c.style.color]} strokeWidth={1 / scale} />
        ))}
        {scene.nodes.map((n) => (
          <rect key={n.id} x={n.rect.x} y={n.rect.y} width={n.rect.width} height={n.rect.height} fill={n.color} />
        ))}
        <rect className="minimap-view" x={view.x} y={view.y} width={view.width} height={view.height} strokeWidth={1.5 / scale} />
      </g>
    </svg>
  );
}
