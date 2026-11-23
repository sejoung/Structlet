import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { parseStructlet } from '../../../src/adapters/format/structlet-format';
import { ancestors, validateDocument, type Point, type Rect } from '../../../src/domain';
import { computeDiagramView, computeScene, containsRect, intersects, layoutDocument, LAYOUT_MODES, polylineLength, routeClears, type Scene } from '../../../src/engine';

const sample = new URL('../../../samples/polar-observatory.structlet', import.meta.url);
const parsed = parseStructlet(readFileSync(sample, 'utf8'));
if (!parsed.ok) throw new Error(parsed.errors.join(' · '));
const document = parsed.document;
const appearance = createAppearance('en');
const source = computeScene(document, appearance);

function formsCross(a: Point, b: Point, p: Point, q: Point): boolean {
  if (a.y === b.y && p.x === q.x) {
    return p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x) && a.y > Math.min(p.y, q.y) && a.y < Math.max(p.y, q.y);
  }
  return a.x === b.x && p.y === q.y && formsCross(p, q, a, b);
}

function crossingCount(scene: Scene): number {
  const earlier: [Point, Point][] = [];
  let count = 0;
  for (const { points } of scene.edges) {
    const segments = points.slice(1).map((point, i): [Point, Point] => [points[i]!, point]);
    for (const [a, b] of segments) for (const [p, q] of earlier) if (formsCross(a, b, p, q)) count++;
    earlier.push(...segments);
  }
  return count;
}

const wireLength = (scene: Scene) => scene.edges.reduce((sum, edge) => sum + polylineLength(edge.points), 0);

describe('large nested architecture', () => {
  it.each(LAYOUT_MODES)('keeps the synthetic observatory readable in %s mode', (mode) => {
    expect(document.nodes).toHaveLength(70);
    expect(document.containers).toHaveLength(28);
    expect(document.edges).toHaveLength(100);
    const arranged = layoutDocument(document, mode);
    expect(validateDocument(arranged)).toEqual([]);
    expect(arranged.nodes.map(({ id, parentId }) => [id, parentId])).toEqual(document.nodes.map(({ id, parentId }) => [id, parentId]));
    expect(arranged.edges).toEqual(document.edges);
    expect(layoutDocument(arranged, mode)).toEqual(arranged);

    const scene = computeScene(arranged, appearance);
    const peers = new Map<string | null, Rect[]>();
    for (const box of [...arranged.containers, ...arranged.nodes]) {
      const rect = scene.rects.get(box.id)!;
      const parent = box.parentId ? scene.rects.get(box.parentId)! : scene.bounds!;
      const node = scene.nodes.find(({ id }) => id === box.id);
      const bounds = [rect, node?.labelBox, node?.specCaption?.box].filter((part): part is Rect => !!part);
      const siblings = peers.get(box.parentId) ?? [];
      expect(bounds.every((part) => containsRect(parent, part)), box.id).toBe(true);
      expect(bounds.some((part) => siblings.some((other) => intersects(part, other))), box.id).toBe(false);
      peers.set(box.parentId, [...siblings, ...bounds]);
    }

    const notes = scene.annotations.map(({ rect }) => rect);
    const labels = scene.edges.flatMap(({ labelBox }) => labelBox ? [labelBox] : []);
    for (const [i, label] of labels.entries()) {
      expect([...notes, ...labels.slice(i + 1)].some((other) => intersects(other, label))).toBe(false);
    }
    let unrelatedAreaHits = 0;
    for (const edge of scene.edges) {
      expect(edge.points.slice(1).every((point, i) => point.x === edge.points[i]!.x || point.y === edge.points[i]!.y), edge.id).toBe(true);
      const remaining = scene.nodes.filter(({ id }) => id !== edge.sourceId && id !== edge.targetId)
        .flatMap((node) => [node.rect, ...(node.labelBox ? [node.labelBox] : []), ...(node.specCaption ? [node.specCaption.box] : [])]);
      expect(routeClears(edge.points, [...remaining, ...notes]), edge.id).toBe(true);
      const related = new Set([edge.sourceId, edge.targetId].flatMap((id) => id ? [id, ...ancestors(arranged, id)] : []));
      unrelatedAreaHits += scene.containers.filter(({ id, rect }) => !related.has(id) && !routeClears(edge.points, [rect])).length;
    }
    expect(unrelatedAreaHits).toBeLessThanOrEqual(2);
    expect(crossingCount(scene)).toBeLessThan(crossingCount(source) * 0.86);
    expect(wireLength(scene)).toBeLessThan(wireLength(source) * 0.8);
  });

  it('can collapse the same large diagram into a small connected summary', () => {
    const folded = new Set(document.containers.filter(({ parentId }) => parentId === null).map(({ id }) => id));
    const scene = computeDiagramView(document, appearance, { folded, layout: 'grid', label: (area, count) => [area.label, `${count} services`] });
    expect(scene.nodes).toHaveLength(9);
    expect(scene.edges.length).toBeLessThan(45);
    expect(scene.edges.length).toBeGreaterThan(10);
    expect(document.nodes).toHaveLength(70);
  });
});
