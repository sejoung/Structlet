import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { CONTAINER_PRESETS, DEFAULT_EDGE_STYLE, emptyDocument, type ArrowHeads, type Document, type Edge, type Endpoint, type Node } from '../../../src/domain';
import { computeDiagramView, computeScene, flowPoint, indexIsometricFlow, planIsometricFlow, topIsometricFlowSource } from '../../../src/engine';

const appearance = createAppearance('en');

function node(id: string, x: number, y: number): Node {
  return { id, x, y, width: 64, height: 64, label: id, serviceId: 'server', parentId: null, variant: 'icon', locked: false };
}

function edge(id: string, from: string, to: string | Endpoint, arrow: ArrowHeads = 'end'): Edge {
  const attached = (objectId: string): Endpoint => ({ kind: 'attached', objectId, side: 'auto', offset: null });
  return {
    id, label: '', source: attached(from), target: typeof to === 'string' ? attached(to) : to,
    style: { ...DEFAULT_EDGE_STYLE, arrow }, routingMode: 'auto', waypoints: [],
  };
}

function diagram(edges: Edge[]): Document {
  return { ...emptyDocument('flow', 'Flow'), nodes: [node('a', 100, 120), node('b', 340, 20), node('c', 340, 260), node('d', 590, 120), node('e', 850, 80)], edges };
}

describe('isometric flow', () => {
  it('starts at the highest directed entry from the current view angle, ahead of intermediate services', () => {
    const doc = diagram([edge('da', 'd', 'a'), edge('ab', 'a', 'b'), edge('cb', 'c', 'b'), edge('unrelated', 'e', 'b', 'none')]);
    const scene = computeScene(doc, appearance);
    const graph = indexIsometricFlow(scene);
    expect(topIsometricFlowSource(scene, graph, 0)).toBe('c');
    expect(topIsometricFlowSource(scene, graph, 180)).toBe('d');
    expect(planIsometricFlow(graph, 'c')[0]?.links.map(({ id }) => id)).toEqual(['cb']);
  });

  it('uses the highest directed connection when all services form a cycle and can start on an undirected diagram', () => {
    const cycle = computeScene(diagram([edge('bc', 'b', 'c'), edge('cb', 'c', 'b'), edge('ab', 'a', 'b', 'none')]), appearance);
    expect(topIsometricFlowSource(cycle, indexIsometricFlow(cycle), 0)).toBe('b');
    const undirected = computeScene(diagram([edge('nvlink', 'b', 'a', 'none')]), appearance);
    expect(topIsometricFlowSource(undirected, indexIsometricFlow(undirected), 0)).toBe('a');
    const empty = computeScene(diagram([]), appearance);
    expect(topIsometricFlowSource(empty, indexIsometricFlow(empty), 0)).toBeNull();
  });

  it('plays branches and converging routes in waves and visits each edge in a cycle once', () => {
    const doc = diagram([
      edge('ab', 'a', 'b'), edge('ac', 'a', 'c'), edge('bd', 'b', 'd'),
      edge('cd', 'c', 'd'), edge('da', 'd', 'a'), edge('incoming', 'e', 'a'),
    ]);
    const scene = computeScene(doc, appearance);
    const waves = planIsometricFlow(indexIsometricFlow(scene), 'a');
    expect(waves.map(({ sources, links, arrivals }) => [sources, links.map(({ id }) => id), arrivals])).toEqual([
      [['a'], ['ab', 'ac'], ['b', 'c']],
      [['b', 'c'], ['bd', 'cd'], ['d']],
      [['d'], ['da'], ['a']],
    ]);
    expect(waves[0]?.links[0]?.points).toEqual(scene.edges[0]?.points);
  });

  it('follows start and both-ended arrows with the correct path orientation and supports free endpoints', () => {
    const doc = diagram([
      edge('start', 'a', 'b', 'start'), edge('both', 'a', 'c', 'both'),
      edge('both-reverse', 'd', 'c', 'both'), edge('free', 'd', { kind: 'free', x: 720, y: 180 }),
    ]);
    const scene = computeScene(doc, appearance);
    const waves = planIsometricFlow(indexIsometricFlow(scene), 'b');
    expect(waves.map(({ links }) => links.map(({ id, kind, to }) => [id, kind, to]))).toEqual([
      [['start', 'reverse', 'a']], [['both', 'forward', 'c']],
      [['both-reverse', 'reverse', 'd']], [['free', 'forward', null]],
    ]);
    expect(waves[0]?.links[0]?.points).toEqual(scene.edges[0]?.points.slice().reverse());
    expect(waves[2]?.links[0]?.points).toEqual(scene.edges[2]?.points.slice().reverse());
    expect(waves[3]?.links[0]?.points.at(-1)).toEqual({ x: 720, y: 180 });
    expect(waves[3]?.arrivals).toEqual([]);
  });

  it('highlights an undirected link from either end without propagating across it', () => {
    const scene = computeScene(diagram([edge('nvlink', 'a', 'b', 'none'), edge('bc', 'b', 'c')]), appearance);
    const fromA = planIsometricFlow(indexIsometricFlow(scene), 'a');
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.links.map(({ id, kind }) => [id, kind])).toEqual([['nvlink', 'undirected']]);
    expect(fromA[0]?.arrivals).toEqual([]);
    const fromB = planIsometricFlow(indexIsometricFlow(scene), 'b');
    expect(fromB[0]?.links.map(({ id }) => id)).toEqual(['nvlink', 'bc']);
    expect(fromB[0]?.arrivals).toEqual(['c']);
    expect(planIsometricFlow(indexIsometricFlow(scene), 'e')).toEqual([]);
  });

  it('routes through a folded summary tile using the visible connections and excludes hidden internal edges', () => {
    const base = diagram([edge('internal', 'a', 'b'), edge('external', 'b', 'c'), edge('next', 'c', 'd')]);
    const doc: Document = {
      ...base,
      nodes: base.nodes.map((entry) => ['a', 'b'].includes(entry.id) ? { ...entry, parentId: 'group' } : entry),
      containers: [{ id: 'group', label: 'Group', kind: 'custom', parentId: null, x: 0, y: 0, width: 430, height: 220, locked: false, style: CONTAINER_PRESETS.custom }],
    };
    const scene = computeDiagramView(doc, appearance, { folded: new Set(['group']), layout: null, label: () => ['Group', '2 services'] });
    const waves = planIsometricFlow(indexIsometricFlow(scene), 'group');
    expect(waves.map(({ links }) => links.map(({ id, from, to }) => [id, from, to]))).toEqual([
      [['external', 'group', 'c']], [['next', 'c', 'd']],
    ]);
    expect(waves[0]?.links[0]?.points).toEqual(scene.edges.find(({ id }) => id === 'external')?.points);
    expect(planIsometricFlow(indexIsometricFlow(scene), 'a')).toEqual([]);
    expect(doc.edges.map(({ id }) => id)).toEqual(['internal', 'external', 'next']);
  });

  it('moves by distance along the whole path, including bends and repeated points', () => {
    const points = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }];
    expect(flowPoint(points, -0.1)).toEqual(points[0]);
    expect(flowPoint(points, 0.5)).toEqual({ x: 20, y: 0 });
    expect(flowPoint(points, 0.75)).toEqual({ x: 30, y: 0 });
    expect(flowPoint(points, 0.875)).toEqual({ x: 30, y: 5 });
    expect(flowPoint(points, 1.1)).toEqual(points.at(-1));
  });
});
