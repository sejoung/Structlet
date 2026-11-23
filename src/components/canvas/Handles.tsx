import type { ReactNode } from 'react';
import { SIDES, type Id } from '../../domain';
import { inflate, pathData, pointOnSide, type Scene } from '../../engine';
import type { CanvasOverlay } from './use-gestures';
import type { ResizeHandle } from './endpoints';

const ACCENT = '#2563eb';
const RESIZE: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface HandlesProps {
  scene: Scene;
  selection: readonly Id[];
  hover: Id | null;
  zoom: number;
  overlay: CanvasOverlay;
  connecting: boolean;
  readOnly?: boolean;
}

export function Handles({ scene, selection, hover, zoom, overlay, connecting, readOnly }: HandlesProps) {
  const px = (v: number) => v / zoom;
  const selected = new Set(selection);
  const single = selection.length === 1 ? selection[0]! : null;
  const out: ReactNode[] = [];

  for (const c of scene.containers) {
    if (!selected.has(c.id)) continue;
    const r = inflate(c.rect, px(2));
    out.push(<rect key={`sel-${c.id}`} className="sel-outline" x={r.x} y={r.y} width={r.width} height={r.height} />);
  }
  for (const n of scene.nodes) {
    if (!selected.has(n.id)) continue;
    const r = inflate(n.rect, px(4));
    out.push(<rect key={`sel-${n.id}`} className="sel-outline" x={r.x} y={r.y} width={r.width} height={r.height} rx={px(4)} />);
  }
  for (const a of scene.annotations) {
    if (!selected.has(a.id)) continue;
    const r = inflate(a.rect, px(4));
    out.push(<rect key={`sel-${a.id}`} className="sel-outline" x={r.x} y={r.y} width={r.width} height={r.height} />);
  }
  for (const e of scene.edges) {
    if (!selected.has(e.id)) continue;
    out.push(<path key={`sel-${e.id}`} className="sel-edge" d={pathData(e.points)} />);
  }

  if (readOnly) return <g className="handles">{out}</g>;

  for (const box of [...scene.nodes, ...scene.containers]) {
    if (!box.locked || !selected.has(box.id)) continue;
    out.push(<text key={`lock-${box.id}`} x={box.rect.x + box.rect.width - px(2)} y={box.rect.y - px(6)} fontSize={px(11)} textAnchor="end" fill={ACCENT}>🔒</text>);
  }

  const container = single ? scene.containers.find((c) => c.id === single) : undefined;
  if (container && !container.locked) {
    const r = container.rect;
    const s = px(8);
    for (const h of RESIZE) {
      const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.width : r.x + r.width / 2;
      const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.height : r.y + r.height / 2;
      out.push(<rect key={`rz-${h}`} data-hit="resize" data-id={container.id} data-handle={h} className={`handle resize-${h}`} x={x - s / 2} y={y - s / 2} width={s} height={s} />);
    }
  }

  const connectable = new Set<Id>();
  if (hover && scene.frames.has(hover)) connectable.add(hover);
  if (single && scene.frames.has(single)) connectable.add(single);
  if (!connecting) {
    for (const id of connectable) {
      const frame = scene.frames.get(id)!;
      for (const side of SIDES) {
        const p = pointOnSide(frame, side, 0.5);
        out.push(<circle key={`cn-${id}-${side}`} data-hit="connect" data-id={id} data-side={side} data-x={p.x} data-y={p.y} className="handle connect" cx={p.x} cy={p.y} r={px(5)} />);
      }
    }
  }

  const edge = single ? scene.edges.find((e) => e.id === single) : undefined;
  if (edge) {
    const pts = edge.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < px(18)) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = px(9);
      out.push(<rect key={`sg-${i}`} data-hit="segment" data-id={edge.id} data-index={i} className="handle segment" x={m.x - s / 2} y={m.y - s / 2} width={s} height={s} rx={px(2)} />);
    }
    if (edge.style.shape === 'straight') {
      pts.slice(1, -1).forEach((p, i) => {
        out.push(<circle key={`wp-${i}`} data-hit="waypoint" data-id={edge.id} data-index={i} className="handle waypoint" cx={p.x} cy={p.y} r={px(5)} />);
      });
    }
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    out.push(<circle key="ep-s" data-hit="endpoint" data-id={edge.id} data-which="source" className="handle endpoint" cx={first.x} cy={first.y} r={px(6)} />);
    out.push(<circle key="ep-t" data-hit="endpoint" data-id={edge.id} data-which="target" className="handle endpoint" cx={last.x} cy={last.y} r={px(6)} />);
  }

  for (const [i, g] of overlay.guides.entries()) {
    out.push(
      g.axis === 'x' ? <line key={`gd-${i}`} className="guide" x1={g.at} x2={g.at} y1={g.from} y2={g.to} /> : <line key={`gd-${i}`} className="guide" x1={g.from} x2={g.to} y1={g.at} y2={g.at} />,
    );
  }
  if (overlay.marquee) {
    const m = overlay.marquee;
    out.push(<rect key="marquee" className="marquee" x={m.x} y={m.y} width={m.width} height={m.height} />);
  }
  if (overlay.connect) {
    const { from, to, target } = overlay.connect;
    const r = target ? scene.rects.get(target) : undefined;
    if (r) out.push(<rect key="ct" className="connect-target" x={r.x - px(4)} y={r.y - px(4)} width={r.width + px(8)} height={r.height + px(8)} rx={px(6)} />);
    out.push(<line key="cl" className="connect-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />);
  }
  return <g className="handles">{out}</g>;
}
