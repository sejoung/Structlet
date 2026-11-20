import { describe, expect, it } from 'vitest';
import { createAppearance, searchServices, SERVICES } from '../../../src/adapters/catalog/services';
import { exportSvg } from '../../../src/adapters/export/image-export';
import { computeScene, pathData, renderSceneBody } from '../../../src/engine';
import { sampleDocument } from '../fixtures';

const look = createAppearance('ko');

describe('SVG export', () => {
  it('uses the same paths, labels and icons as the canvas', () => {
    const doc = sampleDocument();
    const svg = exportSvg(doc, look);
    const scene = computeScene(doc, look);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain(renderSceneBody(scene));
    for (const e of scene.edges) expect(svg).toContain(`d="${pathData(e.points)}"`);
    for (const label of ['고객', '애플리케이션', '주문 DB', 'Aurora PostgreSQL', '서울 리전 (ap-northeast-2)', 'HTTPS']) expect(svg).toContain(label);
  });

  it('escapes text', () => {
    const doc = sampleDocument();
    const svg = exportSvg({ ...doc, nodes: doc.nodes.map((n, i) => (i === 0 ? { ...n, label: '<b>&"x"' } : n)) }, look);
    expect(svg).toContain('&lt;b&gt;&amp;&quot;x&quot;');
    expect(svg).not.toContain('<b>');
  });

  it('is cropped to the diagram with padding', () => {
    const svg = exportSvg(sampleDocument(), look);
    const viewBox = /viewBox="([-\d. ]+)"/.exec(svg)![1]!.split(' ').map(Number);
    expect(viewBox[0]).toBeLessThan(40);
    expect(viewBox[2]).toBeGreaterThan(1400);
  });
});

describe('service catalog', () => {
  it('has unique ids and searches in Korean and English', () => {
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(SERVICES.length);
    expect(searchServices('로드밸런서').map((s) => s.id)).toContain('load-balancer');
    expect(searchServices('redis').map((s) => s.id)).toEqual(expect.arrayContaining(['cache', 'aws.elasticache']));
    expect(searchServices('db')[0]!.id).toBe('database');
  });
});
