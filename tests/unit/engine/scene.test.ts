import { describe, expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { applyPatch, moveBy } from '../../../src/domain';
import { computeScene, inflate, segmentHitsRect, wrapText, measureText } from '../../../src/engine';
import { sampleDocument } from '../fixtures';

const look = createAppearance('ko');

describe('scene', () => {
  it('places nested objects in world coordinates and orders areas by depth', () => {
    const scene = computeScene(sampleDocument(), look);
    expect(scene.containers.map((c) => c.id)).toEqual(['cloud', 'region', 'vpc', 'public', 'private']);
    // api: cloud(160,40) + region(180,50) + vpc(40,50) + private(300,60) + (60,60)
    expect(scene.nodes.find((n) => n.id === 'api')!.rect).toMatchObject({ x: 740, y: 260 });
  });

  it('routes every sample edge without crossing other service tiles', () => {
    const doc = sampleDocument();
    const scene = computeScene(doc, look);
    expect(scene.edges).toHaveLength(doc.edges.length);
    for (const e of scene.edges) {
      const edge = doc.edges.find((x) => x.id === e.id)!;
      const ends = [edge.source, edge.target].map((p) => (p.kind === 'attached' ? p.objectId : ''));
      for (const n of scene.nodes) {
        if (ends.includes(n.id)) continue;
        const hit = e.points.some((p, i) => i > 0 && segmentHitsRect(e.points[i - 1]!, p, inflate(n.rect, 2)));
        expect(hit, `${e.id} crosses ${n.id}`).toBe(false);
      }
    }
  });

  it('shows unknown services with the generic icon and keeps the label', () => {
    const doc = sampleDocument();
    const odd = { ...doc, nodes: doc.nodes.map((n) => (n.id === 'api' ? { ...n, serviceId: 'vendor.mystery' } : n)) };
    const node = computeScene(odd, look).nodes.find((n) => n.id === 'api')!;
    expect(node.knownService).toBe(false);
    expect(node.glyph).toBe(look.fallback.glyph);
    expect(node.label[0]).toBe('주문 API');
  });

  it('moves edges with their area', () => {
    const doc = sampleDocument();
    const before = computeScene(doc, look).edges.find((e) => e.id === 'e-api-db')!;
    const moved = applyPatch(doc, moveBy(doc, ['vpc'], 40, 20));
    const after = computeScene(moved, look).edges.find((e) => e.id === 'e-api-db')!;
    expect(after.points).toEqual(before.points.map((p) => ({ x: p.x + 40, y: p.y + 20 })));
  });
});

describe('text', () => {
  it('keeps Korean words whole and wraps long names', () => {
    const lines = wrapText('애플리케이션 로드밸런서', 90, 12);
    expect(lines).toEqual(['애플리케이션', '로드밸런서']);
    const long = wrapText('주문처리마이크로서비스오케스트레이터', 80, 12);
    expect(long.length).toBeGreaterThan(1);
    for (const l of long) expect(measureText(l, 12)).toBeLessThanOrEqual(80);
  });
});
