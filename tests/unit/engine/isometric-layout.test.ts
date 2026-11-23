import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { parseStructlet } from '../../../src/adapters/format/structlet-format';
import { computeIsometricLayout, computeScene, containsRect, intersects, isoBlockHeight, layoutDocument, projectIso, renderIsometricSvg, union, type IsometricRotation } from '../../../src/engine';

const appearance = createAppearance('en');
const rotations: IsometricRotation[] = [0, 1, 2, 3];

function sceneFor(name: string) {
  const result = parseStructlet(readFileSync(new URL(`../../../samples/${name}.structlet`, import.meta.url), 'utf8'));
  if (!result.ok) throw new Error(result.errors.join(', '));
  return computeScene(layoutDocument(result.document, 'grid'), appearance);
}

describe('isometric layout', () => {
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
    expect(renderIsometricSvg(docScene, { labels: 'compact', rotation: 3 }).svg).toContain('rotate(270)');
  });
});
