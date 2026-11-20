import { describe, expect, it } from 'vitest';
import type { Edge, Point, Rect } from '../../../src/domain';
import { dragSegment, inflate, interiorPoints, resolveEndpoints, routeAuto, routeManual, segmentHitsRect, type PortFrame, type ResolvedEnd } from '../../../src/engine';

const frame = (r: Rect): PortFrame => ({ left: r.x, right: r.x + r.width, top: r.y, bottom: r.y + r.height, sideTop: r.y, sideBottom: r.y + r.height });
const end = (point: Point, side: ResolvedEnd['side']): ResolvedEnd => ({ point, side, objectId: 'x' });

function orthogonal(points: readonly Point[]): boolean {
  return points.every((p, i) => i === 0 || p.x === points[i - 1]!.x || p.y === points[i - 1]!.y);
}

function crosses(points: readonly Point[], r: Rect): boolean {
  return points.some((p, i) => i > 0 && segmentHitsRect(points[i - 1]!, p, r));
}

describe('automatic routing', () => {
  it('keeps the plain shape when nothing is in the way', () => {
    const path = routeAuto(end({ x: 64, y: 32 }, 'right'), end({ x: 300, y: 132 }, 'left'), []);
    expect(path).toEqual([{ x: 64, y: 32 }, { x: 182, y: 32 }, { x: 182, y: 132 }, { x: 300, y: 132 }]);
  });

  it('goes around a box that sits on the straight line', () => {
    const blocker: Rect = { x: 150, y: 0, width: 64, height: 64 };
    const path = routeAuto(end({ x: 64, y: 32 }, 'right'), end({ x: 300, y: 32 }, 'left'), [blocker]);
    expect(orthogonal(path)).toBe(true);
    expect(crosses(path, inflate(blocker, 4))).toBe(false);
    expect(path[0]).toEqual({ x: 64, y: 32 });
    expect(path[path.length - 1]).toEqual({ x: 300, y: 32 });
  });
});

describe('manual routing', () => {
  it('reproduces an edited path and keeps waypoints after an endpoint moves', () => {
    const source = end({ x: 64, y: 32 }, 'right');
    const target = end({ x: 400, y: 232 }, 'left');
    const auto = routeAuto(source, target, []);
    // Drag the vertical middle segment 60px to the right.
    const vertical = auto.findIndex((p, i) => i > 0 && p.x === auto[i - 1]!.x) - 1;
    const waypoints = dragSegment(auto, vertical, { x: 60, y: 999 });
    const edited = routeManual(source, target, waypoints);
    expect(edited.some((p) => p.x === auto[vertical]!.x + 60)).toBe(true);
    expect(interiorPoints(edited)).toEqual(waypoints);

    // Move the target down: the user's waypoints stay on the path.
    const moved = routeManual(source, end({ x: 400, y: 300 }, 'left'), waypoints);
    expect(orthogonal(moved)).toBe(true);
    for (const w of waypoints) expect(moved).toContainEqual(w);
  });

  it('dragging the only segment of a straight run creates a detour with stubs', () => {
    const path = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const w = dragSegment(path, 0, { x: 0, y: 40 });
    expect(w).toEqual([{ x: 20, y: 0 }, { x: 20, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 0 }]);
  });
});

describe('ports', () => {
  const edge = (id: string, target: string): Edge => ({
    id,
    source: { kind: 'attached', objectId: 'a', side: 'auto', offset: null },
    target: { kind: 'attached', objectId: target, side: 'auto', offset: null },
    label: '',
    style: { dashed: false, arrow: 'end', shape: 'orthogonal' },
    routingMode: 'auto',
    waypoints: [],
  });

  it('faces the other end and spreads edges that share a side in order', () => {
    const frames = new Map([
      ['a', frame({ x: 0, y: 100, width: 64, height: 64 })],
      ['up', frame({ x: 300, y: 0, width: 64, height: 64 })],
      ['down', frame({ x: 300, y: 200, width: 64, height: 64 })],
    ]);
    const ends = resolveEndpoints([edge('e2', 'down'), edge('e1', 'up')], frames);
    const s1 = ends.get('e1')!.source;
    const s2 = ends.get('e2')!.source;
    expect(s1.side).toBe('right');
    expect(s2.side).toBe('right');
    expect(s1.point.y).toBeLessThan(s2.point.y);
    expect(s2.point.y - s1.point.y).toBe(16);
    expect(ends.get('e1')!.target.side).toBe('left');
  });

  it('uses a fixed side and offset when set', () => {
    const frames = new Map([
      ['a', frame({ x: 0, y: 0, width: 100, height: 50 })],
      ['b', frame({ x: 300, y: 0, width: 64, height: 64 })],
    ]);
    const e: Edge = { ...edge('e', 'b'), source: { kind: 'attached', objectId: 'a', side: 'bottom', offset: 0.25 } };
    expect(resolveEndpoints([e], frames).get('e')!.source).toMatchObject({ side: 'bottom', point: { x: 25, y: 50 } });
  });
});
