import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { parseStructlet } from '../../../src/adapters/format/structlet-format';
import { adjacentIsoPreset, center, computeIsometricLayout, computeScene, containsRect, intersects, isoBlockHeight, layoutDocument, projectIso, renderIsometricSvg, union, normalizeIsoAngle } from '../../../src/engine';

const appearance = createAppearance('en');
const rotations = [0, 37, 45, 90, 135, 180, 224, 270, 358];

function sceneFor(name: string) {
  const result = parseStructlet(readFileSync(new URL(`../../../samples/${name}.structlet`, import.meta.url), 'utf8'));
  if (!result.ok) throw new Error(result.errors.join(', '));
  return computeScene(layoutDocument(result.document, 'grid'), appearance);
}

describe('isometric layout', () => {
  it('moves toward the adjacent cardinal angle from free, exact, and wrapping rotations', () => {
    const angles = [0, 37, 90, 178, 180, 270, 355];
    expect(angles.map((angle) => adjacentIsoPreset(angle, -1))).toEqual([-90, 0, 0, 90, 90, 180, 270]);
    expect(angles.map((angle) => adjacentIsoPreset(angle, 1))).toEqual([90, 90, 180, 180, 270, 360, 360]);
  });

  it('reserves clear label offsets during a turn and repositions only conflicting labels', () => {
    const base = sceneFor('gpu-training');
    const node = base.nodes[0]!;
    const origin = center(node.rect);
    const rect = { ...origin, width: 24, height: 24 };
    const scene = { ...base, nodes: [node], containers: [], edges: [], annotations: [
      { id: 'step-1', kind: 'step' as const, rect, lines: ['1'] },
      { id: 'step-2', kind: 'step' as const, rect, lines: ['2'] },
    ] };
    const offset = { x: 90, y: -100 };
    const initial = computeIsometricLayout(scene, { rotation: 37, labelOffsets: new Map([['step-1', offset], ['step-2', offset]]) });
    expect(initial.labelOffsets.get('step-1')).toEqual(offset);
    expect(initial.labelOffsets.get('step-2')).not.toEqual(offset);

    const next = computeIsometricLayout(scene, { rotation: 38, labelOffsets: initial.labelOffsets });
    expect(next.labelOffsets).toEqual(initial.labelOffsets);
    for (const [i, { box }] of next.labels.entries()) {
      expect(next.labels.slice(i + 1).some((label) => intersects(box, label.box))).toBe(false);
    }
    expect(computeIsometricLayout(scene, { rotation: 38, labelOffsets: next.labelOffsets }).labels).toEqual(next.labels);
  });

  it('projects the full horizontal turn and exports the actual free rotation angle', () => {
    const scene = sceneFor('gpu-training');
    const point = { x: 100, y: 0 };
    const projected = projectIso(point, 45);
    expect(projected.x).toBeCloseTo(0);
    expect(projected.y).toBeCloseTo(100 / Math.sqrt(2));
    expect(normalizeIsoAngle(397)).toBe(37);
    expect(normalizeIsoAngle(-37)).toBe(323);
    const layout = computeIsometricLayout(scene, { rotation: 397 });
    expect(layout).toEqual(computeIsometricLayout(scene, { rotation: 37 }));
    expect(renderIsometricSvg(scene, { rotation: 397 }).svg).toContain('rotate(37)');
  });

  it.each(['gpu-training', 'commerce-and-ml'])('avoids collisions and includes every label in the image bounds for %s', (name) => {
    const scene = sceneFor(name);
    const original = JSON.stringify(scene);
    for (const rotation of rotations) {
      const layout = computeIsometricLayout(scene, { rotation, labels: 'full' });
      const blocks = scene.nodes.map((node) => {
        const { x, y, width, height } = node.rect;
        const floor = union([
          { x, y }, { x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height },
        ].map((point) => ({ ...projectIso(point, rotation), width: 0, height: 0 })))!;
        return { ...floor, y: floor.y - isoBlockHeight(node), height: floor.height + isoBlockHeight(node) };
      });
      for (const [i, { id, box }] of layout.labels.entries()) {
        expect(containsRect(layout.bounds, box), id).toBe(true);
        expect(blocks.some((block) => intersects(box, block)), id).toBe(false);
        expect(layout.labels.slice(i + 1).some((label) => intersects(box, label.box)), id).toBe(false);
      }
      expect(layout.labels.filter((label) => label.kind === 'node')).toHaveLength(scene.nodes.length);
      expect(layout.labels.filter((label) => label.kind === 'edge')).toHaveLength(scene.edges.length);
      expect(layout.labels.some((label) => label.leader)).toBe(true);
      expect(containsRect(renderIsometricSvg(scene, { rotation }).box, layout.bounds)).toBe(true);
    }
    expect(JSON.stringify(scene)).toBe(original);
  });

  it('shows summary labels and step numbers in compact view and preserves larger typography and legends in full view', () => {
    const scene = sceneFor('gpu-training');
    const docScene = { ...scene, annotations: [
      ...scene.annotations,
      { id: 'step', kind: 'step' as const, rect: { x: 40, y: 40, width: 24, height: 24 }, lines: ['1'] },
      { id: 'legend', kind: 'legend' as const, rect: { x: 20, y: 80, width: 24, height: 24 }, lines: ['Legend', '#ed7100 GPU'] },
    ] };
    const full = computeIsometricLayout(docScene);
    const compact = computeIsometricLayout(docScene, { labels: 'compact' });
    expect(compact.labels.every((label) => ['area', 'node', 'step'].includes(label.kind))).toBe(true);
    expect(compact.labels.some((label) => label.id === 'step')).toBe(true);
    expect(full.labels.find((label) => label.id === 'legend')?.lines[1]?.marker).toEqual({ kind: 'swatch', color: '#ed7100' });
    expect(full.labels.find((label) => label.kind === 'area')).toMatchObject({ size: 19, weight: 650 });
    expect(full.labels.find((label) => label.kind === 'text')).toMatchObject({ size: 16, weight: 400 });
    expect(renderIsometricSvg(docScene, { labels: 'compact', rotation: 270 }).svg).toContain('rotate(270)');
  });
});
