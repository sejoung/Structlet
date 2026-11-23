import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { emptyDocument, type Document, type Edge, type Node } from '../../../src/domain';
import { autoSide, computeScene, inflate, intersects, renderIsometricSvg, renderSceneBody, renderStandaloneSvg, routeManual, segmentHitsRect, DARK_THEME, type PortFrame } from '../../../src/engine';
import { sampleDocument } from '../fixtures';

const look = createAppearance('en');
const frame = (x: number, y: number, w = 64, h = 64): PortFrame => ({ left: x, right: x + w, top: y, bottom: y + h, sideTop: y, sideBottom: y + h });
const node = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({ id, serviceId: 'server', label: id, parentId: null, x, y, width: 64, height: 64, locked: false, variant: 'icon', ...extra });
const edge = (id: string, from: string, to: string, label = ''): Edge => ({
  id,
  source: { kind: 'attached', objectId: from, side: 'auto', offset: null },
  target: { kind: 'attached', objectId: to, side: 'auto', offset: null },
  label,
  style: { dashed: false, arrow: 'end', shape: 'orthogonal' },
  routingMode: 'auto',
  waypoints: [],
});

describe('edge quality', () => {
  it('avoids a side that has a box right in front of it', () => {
    const f = frame(0, 0);
    const blocker = { id: 'b', rect: { x: 70, y: 0, width: 64, height: 64 } };
    expect(autoSide(f, { x: 400, y: 200 }, 'a', 'z', [])).toBe('right');
    expect(autoSide(f, { x: 400, y: 200 }, 'a', 'z', [blocker])).toBe('bottom');
    expect(autoSide(f, { x: 400, y: 32 }, 'a', 'b', [blocker])).toBe('right');
  });

  it('manual routes keep the user points but detour around boxes between them', () => {
    const source = { point: { x: 64, y: 32 }, side: 'right' as const, objectId: 'a' };
    const target = { point: { x: 500, y: 232 }, side: 'left' as const, objectId: 'b' };
    const wp = [{ x: 120, y: 300 }, { x: 420, y: 300 }];
    const box = { x: 220, y: 270, width: 64, height: 64 };
    const plain = routeManual(source, target, wp);
    expect(plain.some((p, i) => i > 0 && segmentHitsRect(plain[i - 1]!, p, box))).toBe(true);
    const avoided = routeManual(source, target, wp, [box]);
    expect(avoided.some((p, i) => i > 0 && segmentHitsRect(avoided[i - 1]!, p, inflate(box, 4)))).toBe(false);
    for (const w of wp) expect(avoided).toContainEqual(w);
  });

  it('moves edge labels off boxes and other labels', () => {
    let doc: Document = emptyDocument('d', 't');
    doc = { ...doc, nodes: [node('a', 0, 0), node('b', 400, 0), node('mid', 168, -100, { label: '' })], edges: [edge('e1', 'a', 'b', 'first label'), edge('e2', 'a', 'b', 'second label')] };
    const scene = computeScene(doc, look);
    const [l1, l2] = scene.edges.map((e) => e.labelBox!);
    expect(intersects(l1!, l2!)).toBe(false);
    for (const n of scene.nodes) expect(intersects(n.rect, l1!)).toBe(false);
  });

  it('computes a large diagram quickly (400 nodes, 300 edges)', () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 400; i++) nodes.push(node(`n${i}`, (i % 20) * 160, Math.floor(i / 20) * 140));
    const edges: Edge[] = [];
    for (let i = 0; i < 300; i++) edges.push(edge(`e${i}`, `n${i}`, `n${(i * 7 + 23) % 400}`));
    const doc = { ...emptyDocument('big', 'big'), nodes, edges };
    const start = performance.now();
    const scene = computeScene(doc, look);
    const ms = performance.now() - start;
    expect(scene.edges).toHaveLength(300);
    expect(ms).toBeLessThan(4000);
  });
});

describe('rendering variants', () => {
  it('draws box nodes with the name inside and ports on the box', () => {
    const doc = { ...emptyDocument('d', 't'), nodes: [node('a', 0, 0, { variant: 'box', width: 184, height: 60, label: 'Orders API' }), node('b', 400, 0)], edges: [edge('e', 'a', 'b')] };
    const scene = computeScene(doc, look);
    const a = scene.nodes.find((n) => n.id === 'a')!;
    expect(a.labelBox).toBeNull();
    expect(scene.edges[0]!.points[0]).toEqual({ x: 184, y: 30 });
    expect(renderSceneBody(scene)).toContain('>Orders API<');
  });

  it('renders legend swatches and line samples, and dark theme colors', () => {
    const doc = { ...sampleDocument(), annotations: [{ id: 'l', kind: 'legend' as const, x: 0, y: 0, text: 'Legend\n#ed7100 Compute\n--- Call\n- - Message', targetId: null }] };
    const scene = computeScene(doc, look);
    const svg = renderSceneBody(scene);
    expect(svg).toContain('fill="#ed7100"');
    expect(svg).toContain('stroke-dasharray="5 3"');
    expect(svg).toContain('>Compute<');
    expect(renderStandaloneSvg(scene, { theme: DARK_THEME }).svg).toContain(DARK_THEME.background);
  });

  it('renders an isometric view with blocks and the same labels', () => {
    const scene = computeScene(sampleDocument(), look);
    const { svg, box } = renderIsometricSvg(scene, { title: 't' });
    expect(svg).toContain('<polygon');
    expect(svg).toContain('matrix(');
    expect(svg).toContain('Aurora PostgreSQL');
    expect(box.width).toBeGreaterThan(500);
  });
});

describe('edge label surface', () => {
  it('fills label boxes with the color behind them instead of white', async () => {
    const { labelSurface, mixColor, onSurface, LIGHT_THEME } = await import('../../../src/engine');
    const scene = computeScene(sampleDocument(), look);
    const sql = scene.edges.find((e) => e.id === 'e-api-db')!;
    const https = scene.edges.find((e) => e.id === 'e-user-alb')!;
    expect(sql.labelTints).toEqual(['#147eba']);
    expect(labelSurface(sql, LIGHT_THEME)).toBe(mixColor('#ffffff', '#147eba', LIGHT_THEME.areaFillOpacity));
    expect(labelSurface(https, LIGHT_THEME)).toBe('#ffffff');
    const canvas = onSurface(LIGHT_THEME, '#f6f7f9');
    expect(labelSurface(https, canvas)).toBe('#f6f7f9');
    expect(renderSceneBody(scene, canvas)).not.toContain('fill-opacity="0.94"');
  });
});
