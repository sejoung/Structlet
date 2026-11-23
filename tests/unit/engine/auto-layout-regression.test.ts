import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { parseStructlet } from '../../../src/adapters/format/structlet-format';
import { applyPatch, getBox, moveEach, validateDocument, worldRect, type Document } from '../../../src/domain';
import { arrange, computeScene, containsRect, fitView, intersects, layoutDocument, layoutSelection, LAYOUT_MODES, polylineLength, routeAuto, segmentHitsRect, union, worldToScreen, zoomAt } from '../../../src/engine';

function readSample(name: string) {
  const result = parseStructlet(readFileSync(new URL(`../../../samples/${name}.structlet`, import.meta.url), 'utf8'));
  if (!result.ok) throw new Error(result.errors.join(', '));
  return result.document;
}

const look = createAppearance('en');
const attachment = (e: Document['edges'][number]['source']) => e.kind === 'attached' ? e.objectId : e;

describe('auto-layout regressions', () => {
  it('reserves equipment captions for icon and box nodes inside nested groups in every layout mode', () => {
    const base = readSample('commerce-and-ml');
    const doc: Document = { ...base, nodes: base.nodes.map((node) => node.parentId === 'app-api' ? {
      ...node, variant: node.id === 'checkout' ? 'box' : 'icon',
      specs: { instanceType: 't4g.small', vcpus: 2, memoryGiB: 2, diskGiB: 80, showDetails: true },
    } : node) };
    for (const mode of LAYOUT_MODES) {
      const next = layoutDocument(doc, mode);
      const scene = computeScene(next, look);
      const group = scene.rects.get('app-api')!;
      const children = scene.nodes.filter((node) => next.nodes.find((item) => item.id === node.id)?.parentId === 'app-api');
      expect(children).toHaveLength(2);
      const footprints = children.map((node) => {
        expect(node.specCaption?.lines).toContain('2 vCPU · 2 GiB RAM');
        const bounds = union([node.rect, node.specCaption!.box])!;
        expect(containsRect(group, bounds), mode).toBe(true);
        expect(containsRect(scene.bounds!, bounds), mode).toBe(true);
        return bounds;
      });
      expect(intersects(footprints[0]!, footprints[1]!), mode).toBe(false);
    }
  });

  it.each(LAYOUT_MODES)('keeps NVIDIA annotation clear and orthogonal links out of boxes in %s mode', (mode) => {
    const doc = readSample('gpu-training');
    const next = layoutDocument(doc, mode);
    const scene = computeScene(next, look);
    const boundary = scene.rects.get('training-cluster')!;
    const note = scene.annotations.find((a) => a.id === 'training-notes')!;
    expect(note.rect.y).toBeGreaterThan(boundary.y + boundary.height);
    for (const node of scene.nodes) expect(containsRect(boundary, node.rect)).toBe(true);
    for (const line of scene.edges) {
      expect(intersects(line.labelBox!, note.rect), line.id).toBe(false);
      const unrelated = scene.nodes.filter((node) => !line.id.startsWith(`${node.id}-to-`) && !line.id.endsWith(`-to-${node.id}`));
      for (const obstacle of [...unrelated.map((node) => node.rect), note.rect]) {
        expect(line.points.slice(1).some((point, i) => segmentHitsRect(line.points[i]!, point, obstacle)), line.id).toBe(false);
      }
    }
    expect(next.edges.map(({ source, target }) => [attachment(source), attachment(target)])).toEqual(
      doc.edges.map(({ source, target }) => [attachment(source), attachment(target)]),
    );
    expect(layoutDocument(next, mode)).toEqual(next);
  });

  it.each(LAYOUT_MODES)('fits multiple notes and long labels inside nested areas in %s mode', (mode) => {
    const base = readSample('commerce-and-ml');
    const doc: Document = {
      ...base,
      nodes: base.nodes.map((node) => node.id === 'fraud' ? {
        ...node, width: 76, height: 28, label: '실시간 구매 패턴 분석 서비스\nFraud detection with a deliberately long label for nested layout',
      } : node),
      annotations: [
        { id: 'floating', kind: 'text', text: 'Free note inferred inside GPU area', x: 1110, y: 360, targetId: null },
        { id: 'attached', kind: 'text', text: 'Serving workload note\nKeep every line visible', x: 1110, y: 200, targetId: 'fraud' },
        { id: 'legend', kind: 'legend', text: 'Legend\n#ed7100 NVIDIA\n--- calls', x: 1110, y: 200, targetId: 'ml-serving' },
      ],
    };
    const next = layoutDocument(doc, mode);
    expect(validateDocument(next)).toEqual([]);
    const scene = computeScene(next, look);
    for (const box of [...next.nodes, ...next.containers]) {
      if (!box.parentId) continue;
      expect(containsRect(scene.rects.get(box.parentId)!, scene.rects.get(box.id)!), box.id).toBe(true);
    }
    const serving = scene.rects.get('ml-serving')!;
    const gpu = scene.rects.get('ml-gpu')!;
    for (const [i, note] of scene.annotations.entries()) {
      expect(containsRect(note.id === 'floating' ? gpu : serving, note.rect), note.id).toBe(true);
      expect(scene.annotations.slice(i + 1).some((other) => intersects(note.rect, other.rect))).toBe(false);
      expect(scene.nodes.some((node) => intersects(node.rect, note.rect))).toBe(false);
    }
    const fraud = scene.nodes.find((n) => n.id === 'fraud')!;
    expect(fraud.label.join(' ')).toContain('nested layout');
    expect(next.annotations.map(({ id, targetId }) => [id, targetId])).toEqual(doc.annotations.map(({ id, targetId }) => [id, targetId]));
    const labels = scene.edges.flatMap((edge) => edge.labelBox ? [edge.labelBox] : []);
    for (const [i, label] of labels.entries()) {
      expect(labels.slice(i + 1).some((other) => intersects(label, other))).toBe(false);
      expect(scene.annotations.some((note) => intersects(label, note.rect))).toBe(false);
      expect(scene.nodes.some((node) => intersects(label, node.rect))).toBe(false);
    }
  });

  it('fits wide diagrams below the usual zoom floor and zooms back in gradually', () => {
    const view = fitView({ x: 0, y: 0, width: 30_000, height: 1400 }, { width: 940, height: 760 });
    expect(view.zoom).toBeLessThan(0.2);
    expect(worldToScreen(view, { x: 0, y: 0 }).x).toBeCloseTo(48);
    expect(worldToScreen(view, { x: 30_000, y: 1400 }).x).toBeCloseTo(892);
    expect(zoomAt(view, { x: 470, y: 380 }, 1.2).zoom).toBeCloseTo(view.zoom * 1.2);
  });

  it('pulls connected grid items closer than document order while keeping a grid', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => ({ id, width: 100, height: 60 }));
    const links = [{ from: 'a', to: 'i' }, { from: 'c', to: 'g' }, { from: 'b', to: 'h' }];
    const before = arrange(items, [], 'grid');
    const after = arrange(items, links, 'grid');
    const length = (pos: typeof before) => links.reduce((sum, { from, to }) => sum + polylineLength([pos.get(from)!, pos.get(to)!]), 0);
    expect(length(after)).toBeLessThan(length(before));
    expect(after).toEqual(arrange(items, links, 'grid'));
    expect(new Set([...after.values()].map((point) => point.x)).size).toBe(3);
  });

  it('finds an outside lane when a dense group exceeds the path search budget', () => {
    const obstacles = Array.from({ length: 70 }, (_, i) => ({
      x: 140 + (i % 10) * 65, y: -58 + Math.floor(i / 10) * 24, width: 36, height: 20,
    }));
    const points = routeAuto(
      { point: { x: 64, y: 32 }, side: 'right', objectId: 'source' },
      { point: { x: 850, y: 32 }, side: 'left', objectId: 'target' }, obstacles,
    );
    expect(points.length).toBeGreaterThan(2);
    expect(points.slice(1).some((point, i) => obstacles.some((rect) => segmentHitsRect(points[i]!, point, rect)))).toBe(false);
  });

  it('places a crowded connection label beside its line instead of covering a note', () => {
    const base = readSample('gpu-training');
    const doc: Document = {
      ...base, containers: [], nodes: [],
      edges: [{
        ...base.edges[0]!, style: { dashed: false, arrow: 'none', shape: 'straight' },
        source: { kind: 'free', x: 40, y: 52 }, target: { kind: 'free', x: 195, y: 52 },
      }],
      annotations: [{ id: 'note', kind: 'text', text: 'This note covers the full line. '.repeat(3), x: 0, y: 30, targetId: null }],
    };
    const scene = computeScene(doc, look);
    expect(scene.edges[0]?.labelAnchor).toBeTruthy();
    expect(intersects(scene.edges[0]!.labelBox!, scene.annotations[0]!.rect)).toBe(false);
  });

  it('keeps pinned port offsets and leaves selected siblings clear of unselected notes and nodes', () => {
    const base = readSample('gpu-training');
    const pinned = { kind: 'attached' as const, objectId: 'host-1-gpu-a', side: 'bottom' as const, offset: 0.25 };
    const doc: Document = { ...base, edges: [{ ...base.edges[0]!, source: pinned }, ...base.edges.slice(1)],
      annotations: [...base.annotations, { id: 'note', kind: 'text', text: 'Keep this clear', x: 320, y: 235, targetId: null }],
    };
    const arranged = layoutDocument(doc, 'flow-down');
    expect(arranged.edges[0]?.source).toEqual(pinned);
    expect(arranged.edges[0]?.target).toMatchObject({ side: 'auto' });

    const chosen = ['host-1-gpu-a', 'host-1-gpu-b'];
    const { moves } = layoutSelection(doc, chosen, 'flow');
    const moved = applyPatch(doc, moveEach(doc, moves));
    const scene = computeScene(moved, look);
    const sibling = 'host-1-nvlink';
    const note = scene.annotations.find((item) => item.id === 'note')!;
    expect(worldRect(moved, getBox(moved, sibling)!)).toEqual(worldRect(doc, getBox(doc, sibling)!));
    for (const id of chosen) {
      const rect = scene.rects.get(id)!;
      expect(intersects(rect, scene.rects.get(sibling)!)).toBe(false);
      expect(intersects(rect, note.rect)).toBe(false);
    }
  });
});
