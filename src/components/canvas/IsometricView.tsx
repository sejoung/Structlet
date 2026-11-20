import { useEffect, useMemo, useRef, useState } from 'react';
import { isometricBounds, renderIsometricBody, zoomAt, type DiagramTheme, type Scene, type Viewport } from '../../engine';

/** Read-only isometric view of the scene with its own pan and zoom. */
export function IsometricView({ scene, theme, notice }: { scene: Scene; theme: DiagramTheme; notice: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const markup = useMemo(() => renderIsometricBody(scene, theme), [scene, theme]);
  const [view, setView] = useState<Viewport | null>(null);
  const latest = useRef(view);
  latest.current = view;
  const drag = useRef<{ x: number; y: number; from: Viewport } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = isometricBounds(scene);
    const zoom = Math.min(1.4, Math.max(0.2, Math.min((r.width - 96) / b.width, (r.height - 96) / b.height)));
    setView({ zoom, panX: (r.width - b.width * zoom) / 2 - b.x * zoom, panY: (r.height - b.height * zoom) / 2 - b.y * zoom });
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

  return (
    <>
      <svg
        ref={ref}
        className="canvas-svg isometric"
        data-testid="isometric"
        onPointerDown={(e) => {
          if (!view) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, from: view };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setView({ ...d.from, panX: d.from.panX + e.clientX - d.x, panY: d.from.panY + e.clientY - d.y });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {view && <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`} dangerouslySetInnerHTML={{ __html: markup }} />}
      </svg>
      <div className="readonly-note" role="status">{notice}</div>
    </>
  );
}
