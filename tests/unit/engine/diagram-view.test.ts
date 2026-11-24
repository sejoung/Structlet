import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { parseStructlet } from '../../../src/adapters/format/structlet-format';
import { applyPatch, getBox, indexDocument, moveBy, worldRect, type Document, type Edge } from '../../../src/domain';
import { availableDiagramContents, computeDiagramView, computeScene, intersects, layoutDocument, LAYOUT_MODES, recommendDiagramSummary, summaryGroups, type DiagramView } from '../../../src/engine';
import { newEditor } from '../fixtures';

const appearance = createAppearance('en');
function sample(name = 'commerce-and-ml'): Document {
  const parsed = parseStructlet(readFileSync(new URL(`../../../samples/${name}.structlet`, import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error(parsed.errors.join(', '));
  return parsed.document;
}
const view = (folded: string[], layout: DiagramView['layout'] = null): DiagramView => ({
  folded: new Set(folded), layout, label: (area, count) => [area.label, `${count} services`],
});

describe('diagram summary', () => {
  it('maps nested endpoints to the outermost visible tile and restores each inner fold independently', () => {
    const doc = sample();
    const folded = computeDiagramView(doc, appearance, view(['ml', 'ml-gpu']));
    expect(folded.nodes.find((node) => node.id === 'ml')?.label).toEqual(['ML inference', '4 services']);
    expect(folded.rects.has('ml-gpu')).toBe(false);
    expect(folded.rects.has('mig-a')).toBe(false);
    expect(folded.edges.some((edge) => edge.id === 'fraud-to-mig-a')).toBe(false);
    const inner = computeDiagramView(doc, appearance, view(['ml-gpu']));
    expect(inner.rects.has('ml')).toBe(true);
    expect(inner.nodes.find((node) => node.id === 'ml-gpu')?.summary).toBe(true);
    expect(inner.edges.some((edge) => edge.id === 'fraud-to-mig-a')).toBe(true);
    expect(computeDiagramView(doc, appearance, view([]))).toEqual(computeScene(doc, appearance));
  });

  it('bundles matching links but separates directions, styles, labels, and distinct free endpoints', () => {
    const doc = sample();
    const first = doc.edges.find((edge) => edge.id === 'gateway-to-checkout')!;
    const variants: Edge[] = [
      { ...first, id: 'reverse', source: first.target, target: first.source },
      { ...first, id: 'dashed', style: { ...first.style, dashed: true } },
      { ...first, id: 'grpc', label: 'gRPC' },
      { ...first, id: 'free-a', target: { kind: 'free', x: 45, y: 65 } },
      { ...first, id: 'free-b', target: { kind: 'free', x: 45, y: 95 } },
    ];
    const scene = computeDiagramView({ ...doc, edges: [...doc.edges, ...variants] }, appearance, view(['entry', 'app', 'ml', 'data', 'ops']));
    expect(scene.edges.find((edge) => edge.id === first.id)?.label).toEqual(['HTTPS × 2']);
    expect(scene.edges.find((edge) => edge.id === 'checkout-to-orders-db')?.label).toEqual(['SQL × 3']);
    expect(scene.edges.map((edge) => edge.id)).toEqual(expect.arrayContaining(variants.map((edge) => edge.id)));
  });

  it('hides notes attached to hidden services and keeps notes attached to visible groups', () => {
    const doc: Document = { ...sample(), annotations: [
      { kind: 'text', id: 'inner-note', x: 1100, y: 420, text: 'Instance detail', targetId: 'mig-a' },
      { kind: 'text', id: 'group-note', x: 1090, y: 60, text: 'Group context', targetId: 'ml' },
    ] };
    const scene = computeDiagramView(doc, appearance, view(['ml']));
    expect(scene.annotations.map((note) => note.id)).toEqual(['group-note']);
    expect(computeDiagramView(doc, appearance, view([])).annotations).toHaveLength(2);
  });

  it('arranges only the projection in each mode and keeps original coordinates and manual routes', () => {
    const base = sample();
    const manual: Edge = { ...base.edges[0]!, routingMode: 'manual', waypoints: [{ x: 250, y: 330 }] };
    const doc = { ...base, edges: [manual, ...base.edges.slice(1)] };
    const original = JSON.stringify(doc);
    const ids = ['entry', 'app', 'ml', 'data', 'ops'];
    const unarranged = computeDiagramView(doc, appearance, view(ids));
    for (const mode of LAYOUT_MODES) {
      const arranged = computeDiagramView(doc, appearance, view(ids, mode));
      expect(arranged.nodes).toHaveLength(5);
      expect(arranged.rects.get('ml')).not.toEqual(unarranged.rects.get('ml'));
      expect(arranged.nodes.every((node, i) => arranged.nodes.slice(i + 1).every((other) => !intersects(node.rect, other.rect)))).toBe(true);
    }
    expect(JSON.stringify(doc)).toBe(original);
    expect(computeDiagramView(doc, appearance, view([])).edges.find((edge) => edge.id === manual.id)?.manual).toBe(true);
  });

  it('reflects document edits on top of an arranged summary without shifting its other tiles', () => {
    const doc = sample();
    const folded = view(['entry', 'app', 'ml', 'data', 'ops'], 'grid');
    const before = computeDiagramView(doc, appearance, folded);
    const origin = indexDocument(doc).containers.get('ml')!;
    const shift = { x: 97, y: -34 };
    const moved = applyPatch(doc, moveBy(doc, ['ml'], shift.x, shift.y));
    const after = computeDiagramView(moved, appearance, { ...folded, layoutOrigins: new Map([['ml', origin]]) });
    const tile = before.rects.get('ml')!;
    expect(after.rects.get('ml')).toEqual({ ...tile, x: tile.x + shift.x, y: tile.y + shift.y });
    expect(after.rects.get('entry')).toEqual(before.rects.get('entry'));
    expect(after.rects.has('mig-a')).toBe(false);
  });
});

describe('diagram content', () => {
  it('keeps traffic, configuration, ancestors, and attached notes in their respective projections', () => {
    const base = sample();
    const pool = { ...base.nodes[0]!, id: 'pool', label: 'Node pool', parentId: 'ops' };
    const edge = base.edges[0]!;
    const config: Edge = {
      ...edge, id: 'placement', label: 'Placement', relationship: true, style: { ...edge.style, dashed: true },
      source: { kind: 'attached', objectId: 'checkout', side: 'auto', offset: null },
      target: { kind: 'attached', objectId: pool.id, side: 'auto', offset: null },
    };
    const asyncTraffic = { ...edge, style: { ...edge.style, dashed: true } };
    const notes = ['pool', 'placement', edge.id].map((targetId) => ({ kind: 'text' as const, id: `note-${targetId}`, text: targetId, targetId, x: 40, y: 100 }));
    const doc = { ...base, nodes: [...base.nodes, pool], edges: [asyncTraffic, ...base.edges.slice(1), config], annotations: notes };
    const original = JSON.stringify(doc);
    const flow = computeDiagramView(doc, appearance, { ...view([]), content: 'flow' });
    expect(flow.edges.map(({ id }) => id)).toEqual(base.edges.map(({ id }) => id));
    expect(flow.edges[0]?.style.dashed).toBe(true);
    expect(flow.rects.has(pool.id)).toBe(false);
    expect(flow.annotations.map(({ id }) => id)).toEqual([`note-${edge.id}`]);

    const operations = computeDiagramView(doc, appearance, { ...view([]), content: 'operations' });
    expect(operations.edges.map(({ id }) => id)).toEqual([config.id]);
    expect(operations.nodes.map(({ id }) => id)).toEqual(['checkout', 'pool']);
    expect(operations.containers.map(({ id }) => id)).toEqual(expect.arrayContaining(['app', 'ops']));
    expect(operations.annotations.map(({ id }) => id)).toEqual(['note-pool', 'note-placement']);
    expect(availableDiagramContents(base)).toEqual(['all']);
    expect(availableDiagramContents(doc)).toEqual(['all', 'flow', 'operations']);
    expect(availableDiagramContents({ ...doc, edges: [config] })).toEqual(['all', 'operations']);
    expect(computeDiagramView(doc, appearance, view([]))).toEqual(computeScene(doc, appearance));
    expect(JSON.stringify(doc)).toBe(original);
  });
});

describe('summary recommendation', () => {
  const size = { width: 1216, height: 856 };

  it('leaves a readable small diagram expanded and keeps GPU hosts and their network visible', () => {
    const basic = sample('three-tier');
    expect(recommendDiagramSummary(basic, appearance, view([]), size)).toEqual({ folded: [], layout: null });
    const training = sample('gpu-training');
    const recommendation = recommendDiagramSummary(training, appearance, view([]), size);
    expect(recommendation.folded).toEqual(['host-1', 'host-2']);
    const scene = computeDiagramView(training, appearance, view([...recommendation.folded], recommendation.layout));
    expect(scene.nodes.map(({ id }) => id)).toEqual(['fabric-switch', 'host-1', 'host-2']);
    expect(scene.edges).toHaveLength(2);
    expect(scene.edges.every(({ sourceId, targetId }) => [sourceId, targetId].includes('fabric-switch'))).toBe(true);
  });

  it('chooses top-level tiles and a grid for the large observatory diagram', () => {
    const doc = sample('polar-observatory');
    const recommendation = recommendDiagramSummary(doc, appearance, view([]), size);
    expect(recommendation).toEqual({ folded: summaryGroups(doc).top, layout: 'grid' });
    const scene = computeDiagramView(doc, appearance, view([...recommendation.folded], recommendation.layout));
    expect(scene.nodes).toHaveLength(9);
    expect(scene.edges).toHaveLength(28);
  });
});

describe('whole diagram layout', () => {
  it('lays out collapsed groups as units and translates internal routes and notes with the group', () => {
    const base = sample();
    const edge = base.edges.find((line) => line.id === 'fraud-to-mig-a')!;
    const manual: Edge = { ...edge, routingMode: 'manual', waypoints: [{ x: 1220, y: 350 }] };
    const note = { id: 'folded-note', kind: 'text' as const, targetId: 'mig-a', text: 'GPU target', x: 1200, y: 480 };
    const doc = { ...base, edges: base.edges.map((line) => line.id === edge.id ? manual : line), annotations: [note] };
    const laidOut = layoutDocument(doc, 'grid', new Set(['ml', 'ml-gpu']));
    const before = indexDocument(doc);
    const after = indexDocument(laidOut);
    const prior = before.containers.get('ml')!;
    const next = after.containers.get('ml')!;
    const dx = next.x - prior.x;
    const dy = next.y - prior.y;
    expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
    expect(after.containers.get('ml-gpu')).toEqual(before.containers.get('ml-gpu'));
    expect(after.nodes.get('mig-a')).toEqual(before.nodes.get('mig-a'));
    expect(after.edges.get(edge.id)).toEqual({ ...manual, waypoints: [{ x: 1220 + dx, y: 350 + dy }] });
    expect(after.annotations.get(note.id)).toEqual({ ...note, x: note.x + dx, y: note.y + dy });
  });

  it('arranges nested siblings without overlaps and preserves locked positions and hierarchy', () => {
    const base = sample();
    const doc = { ...base, nodes: base.nodes.map((node) => node.id === 'mig-a' ? { ...node, locked: true } : node) };
    const next = layoutDocument(doc, 'grid');
    expect(worldRect(next, getBox(next, 'mig-a')!)).toEqual(worldRect(doc, getBox(doc, 'mig-a')!));
    const lookup = indexDocument(next);
    for (const ids of lookup.children.values()) {
      const peers = ids.map((id) => worldRect(next, getBox(next, id)!));
      expect(peers.every((rect, i) => peers.slice(i + 1).every((other) => !intersects(rect, other)))).toBe(true);
    }
    expect(next.nodes.map((node) => node.parentId)).toEqual(doc.nodes.map((node) => node.parentId));
    expect(next.nodes).not.toEqual(doc.nodes);
  });

  it('keeps an entire locked area in place, including its internal manual links', () => {
    const base = sample();
    const edge = base.edges.find((edge) => edge.id === 'checkout-to-orders-queue')!;
    const manual: Edge = { ...edge, routingMode: 'manual', waypoints: [{ x: 530, y: 350 }] };
    const doc = {
      ...base,
      containers: base.containers.map((area) => area.id === 'app' ? { ...area, locked: true } : area),
      edges: base.edges.map((line) => line.id === edge.id ? manual : line),
    };
    const next = layoutDocument(doc, 'flow');
    for (const id of ['app', 'app-api', 'checkout', 'orders-queue']) {
      expect(worldRect(next, getBox(next, id)!)).toEqual(worldRect(doc, getBox(doc, id)!));
    }
    expect(indexDocument(next).edges.get(edge.id)).toEqual(manual);
  });

  it('reroutes incompatible manual paths and restores the complete document with one undo', () => {
    const base = sample();
    const edge = base.edges.find((edge) => edge.id === 'gateway-to-checkout')!;
    const doc: Document = { ...base, edges: base.edges.map((line) => line.id === edge.id ? { ...line, routingMode: 'manual', waypoints: [{ x: 399, y: 355 }] } : line) };
    const editor = newEditor(doc);
    editor.applyDocumentLayout(layoutDocument(doc, 'flow-down'));
    expect(indexDocument(editor.session.committedDocument).edges.get(edge.id)).toMatchObject({ routingMode: 'auto', waypoints: [] });
    expect(editor.undo()).toBe(true);
    expect(editor.session.committedDocument).toEqual(doc);
    expect(editor.undo()).toBe(false);
  });
});
