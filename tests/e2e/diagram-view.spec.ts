import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { act, center, drag, freshApp, openManual } from './helpers';

const samplePath = 'samples/commerce-and-ml.structlet';

async function diagram(page: Page, action: string) {
  await page.getByTestId('menu-diagram').click();
  await page.getByTestId(action).click();
}

test('the bilingual manual shows separate example tabs and downloads the complex diagram', async ({ page }) => {
  await freshApp(page);
  const guide = await openManual(page);
  const manual = guide.getByRole('main', { name: 'User guide' });
  const basic = manual.getByRole('radio', { name: 'Basic example' });
  const complex = manual.getByRole('radio', { name: 'Complex example' });
  await expect(basic).toHaveAttribute('aria-checked', 'true');
  await expect(manual.getByRole('radio', { name: 'NVIDIA examples' })).toBeVisible();

  await complex.click();
  await expect(manual.getByRole('img')).toHaveCount(3);
  await expect(manual.getByRole('img').first()).toHaveAttribute('src', /manual-summary-en/);
  const [download] = await Promise.all([
    guide.waitForEvent('download'), manual.getByRole('button', { name: 'Download Commerce & ML platform (.structlet)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('commerce-and-ml.structlet');
  await guide.close();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles((await download.path())!);
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(16);

  await act(page, 'tb-lang-ko');
  const koreanGuide = await openManual(page);
  const korean = koreanGuide.getByRole('main', { name: '사용 매뉴얼' });
  await expect(korean.getByRole('radio', { name: '기본 예제' })).toBeVisible();
  await korean.getByRole('radio', { name: '복잡한 예제' }).click();
  const preview = korean.getByRole('img', { name: '쇼핑몰·ML 플랫폼의 전체 구성도를 격자로 자동 배치한 상세 화면' });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute('src', /manual-layout-ko/);
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1080);
  await expect(korean.getByRole('button', { name: '극지 관측망 다운로드 (.structlet)' })).toBeVisible();
  await korean.getByRole('radio', { name: 'NVIDIA 예제' }).click();
  await expect(korean.getByRole('img').first()).toHaveAttribute('src', /manual-training-ko/);
  await expect(korean.getByRole('button', { name: 'MIG 추론 (.structlet)' })).toBeVisible();
});

test('canvas folds keep nested state, preserve the file, and are shared by exports and isometric view', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles(samplePath);
  const area = page.getByTestId('fold-area-ml');
  const inner = page.getByTestId('fold-area-ml-gpu');
  await inner.press('Enter');
  await expect(inner).toHaveAttribute('aria-expanded', 'false');
  await area.click();
  await expect(inner).toHaveCount(0);
  await expect(page.getByTestId('node-ml')).toBeVisible();
  await area.click();
  await expect(inner).toHaveAttribute('aria-expanded', 'false');

  await diagram(page, 'fold-top');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(5);
  await expect(page.getByTestId('minimap').locator('rect')).toHaveCount(6);
  await expect(page.locator('.diagram')).toContainText('HTTPS × 2');
  await page.getByTestId('node-data').locator('rect').first().click();
  await expect(page.getByTestId('announcer')).toContainText('Data platform');
  const tile = page.getByTestId('node-ml').locator('rect').first();
  const originalX = await tile.getAttribute('x');
  await diagram(page, 'layout-summary-grid');
  await expect(tile).not.toHaveAttribute('x', originalX!);
  await page.reload();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(5);
  await expect(tile).not.toHaveAttribute('x', originalX!);
  await diagram(page, 'layout-summary-reset');
  await expect(tile).toHaveAttribute('x', originalX!);
  await diagram(page, 'layout-summary-flow');

  const route = await page.locator('.diagram path[data-edge="gateway-to-checkout"]').getAttribute('d');
  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  const svgText = readFileSync((await svg.path())!, 'utf8');
  expect(svgText).toContain('HTTPS × 2');
  expect(svgText).toContain(`d="${route}"`);
  expect(svgText).not.toContain('data-node="mig-a"');
  const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG');

  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  await expect(page.getByTestId('isometric').locator('[data-node="ml"]')).toBeVisible();
  await expect(page.getByTestId('isometric').locator('[data-node="mig-a"]')).toHaveCount(0);
  await page.locator('[data-testid="tb-view"] [data-value="2d"]').click();
  const [save] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  expect(JSON.parse(readFileSync((await save.path())!, 'utf8'))).toEqual(JSON.parse(readFileSync(samplePath, 'utf8')));

  await diagram(page, 'layout-document-grid');
  await expect(page.getByTestId('fold-area-ml')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('node-mig-a')).toHaveCount(0);
  await expect(tile).not.toHaveAttribute('x', originalX!);
  await page.getByTestId('tb-undo').click();
  await expect(tile).toHaveAttribute('x', originalX!);
  await diagram(page, 'expand-all');
  await expect(page.getByTestId('node-mig-a').locator('rect').first()).toHaveAttribute('x', String(1060 + 25 + 27));
});

test('collapsed groups can be dragged and aligned on an arranged summary and their moves can be undone', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles(samplePath);
  await diagram(page, 'fold-top');
  await diagram(page, 'layout-summary-grid');
  const tile = page.getByTestId('node-ml').locator('rect').first();
  const peer = page.getByTestId('node-entry').locator('rect').first();
  const beforeX = Number(await tile.getAttribute('x'));
  const beforeY = await tile.getAttribute('y');
  const peerX = await peer.getAttribute('x');
  const point = await center(page, 'node-ml');
  await page.keyboard.down('Alt');
  await drag(page, point, { x: point.x + 85, y: point.y }, 6);
  await page.keyboard.up('Alt');
  await expect.poll(async () => Number(await tile.getAttribute('x'))).toBeGreaterThan(beforeX);
  const dx = Number(await tile.getAttribute('x')) - beforeX;
  await expect(tile).toHaveAttribute('y', beforeY!);
  await expect(peer).toHaveAttribute('x', peerX!);
  await expect(page.getByTestId('node-mig-a')).toHaveCount(0);

  await peer.click({ modifiers: ['Shift'] });
  await peer.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Left edges', exact: true }).click();
  await expect(tile).toHaveAttribute('x', peerX!);
  await page.getByTestId('tb-undo').click();
  await expect(tile).toHaveAttribute('x', String(beforeX + dx));

  const [saved] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  const original = JSON.parse(readFileSync(samplePath, 'utf8'));
  const moved = JSON.parse(readFileSync((await saved.path())!, 'utf8'));
  expect(moved.containers).toEqual(original.containers.map((area: { id: string; x: number }) => area.id === 'ml' ? { ...area, x: area.x + dx } : area));
  expect(moved.nodes).toEqual(original.nodes);
  await page.getByTestId('tb-undo').click();
  await expect(tile).toHaveAttribute('x', String(beforeX));
  await expect(page.getByTestId('fold-area-ml')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('tb-redo').click();
  await expect(tile).toHaveAttribute('x', String(beforeX + dx));
  await expect.poll(() => page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('structlet:autosave:v1') ?? 'null');
    return doc?.containers?.find((area: { id: string }) => area.id === 'ml')?.x;
  })).toBe(1060 + dx);
  await page.reload();
  await expect(tile).toHaveAttribute('x', String(beforeX + dx));
});

test('group fold controls shrink with zoom and remain anchored and usable', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await picker.setFiles({
    name: 'zoom.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      containers: [{ id: 'pool', kind: 'cluster', label: 'Compute' }],
      nodes: [{ id: 'worker', parent: 'pool', service: 'server' }],
    })),
  });
  const fold = page.getByTestId('fold-area-pool');
  await expect(fold).toBeVisible();
  await page.getByTestId('zoom-level').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  const normal = (await fold.boundingBox())!;
  const normalGlyph = (await fold.locator('svg').boundingBox())!;

  for (let i = 0; i < 6; i++) await page.getByTestId('zoom-out').click();
  const small = (await fold.boundingBox())!;
  const smallGlyph = (await fold.locator('svg').boundingBox())!;
  const group = (await page.locator('.diagram [data-container="pool"] > rect').first().boundingBox())!;
  expect(small.width).toBeLessThan(normal.width * 0.7);
  expect(smallGlyph.width).toBeLessThan(normalGlyph.width * 0.7);
  expect(Math.abs(group.x + group.width - (small.x + small.width))).toBeLessThan(3);
  expect(Math.abs(group.y - small.y)).toBeLessThan(3);

  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.press('Enter');
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
});

test('service flow and operations share the current view across rendering and exports and remember it per file', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await picker.setFiles({
    name: 'example-cluster.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      format: 'structlet-draft', title: 'Example cluster',
      containers: [
        { id: 'cluster', kind: 'cluster', label: 'Cluster' },
        { id: 'app', parent: 'cluster', kind: 'namespace', label: 'Application' },
        { id: 'ops', parent: 'cluster', kind: 'namespace', label: 'Operations' },
      ],
      nodes: [
        { id: 'client', service: 'user' },
        { id: 'ingress', parent: 'app', service: 'k8s.ingress' },
        { id: 'workload', parent: 'app', service: 'k8s.deployment' },
        { id: 'database', service: 'database' },
        { id: 'pool', parent: 'ops', service: 'k8s.karpenter-nodepool' },
        { id: 'gitops', parent: 'ops', service: 'workflow' },
      ],
      edges: [
        { id: 'request', from: 'client', to: 'ingress', label: 'HTTPS' },
        { id: 'backend', from: 'ingress', to: 'workload' },
        { id: 'async', from: 'workload', to: 'database', dashed: true },
        { id: 'placement', from: 'workload', to: 'pool', dashed: true, relationship: true },
        { id: 'sync', from: 'gitops', to: 'cluster', dashed: true, relationship: true },
      ],
    })),
  });
  const visibleEdges = page.locator('.diagram path[data-edge]');
  await expect(visibleEdges).toHaveCount(5);
  const [original] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  const menu = page.getByTestId('menu-diagram-content');
  const choose = async (content: string) => {
    await menu.click();
    await page.getByTestId(`diagram-content-${content}`).click();
  };
  await menu.press('Enter');
  await page.getByRole('menuitemradio', { name: 'Full diagram' }).press('ArrowDown');
  const flowOption = page.getByRole('menuitemradio', { name: 'Service flow' });
  await expect(flowOption).toBeFocused();
  await flowOption.press('Enter');
  await expect(menu).toHaveText('Service flow');
  await expect(visibleEdges).toHaveCount(3);
  await expect(page.locator('.diagram [data-edge="async"]')).toHaveAttribute('stroke-dasharray', '6 4');
  await expect(page.getByTestId('node-pool')).toHaveCount(0);
  await expect(page.getByTestId('node-workload')).toBeVisible();
  const [flowSvg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  const read = async (file: typeof original) => readFileSync((await file.path())!, 'utf8');
  expect(await read(flowSvg)).toContain('data-edge="request"');
  expect(await read(flowSvg)).not.toContain('data-edge="placement"');

  await page.getByTestId('tb-view').locator('[data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  await expect(iso.locator('[data-edge="request"]')).toBeVisible();
  await expect(iso.locator('[data-edge="placement"]')).toHaveCount(0);
  await choose('operations');
  await expect(menu).toHaveText('Operations');
  await expect(iso.locator('[data-edge="placement"]')).toBeVisible();
  await expect(iso.locator('[data-node="pool"]')).toBeVisible();
  await expect(iso.locator('[data-node="client"]')).toHaveCount(0);
  const [operationsSvg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  expect(operationsSvg.suggestedFilename()).toContain('isometric');
  expect(await read(operationsSvg)).toContain('data-edge="placement"');
  expect(await read(operationsSvg)).not.toContain('data-edge="request"');
  const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG');
  const [saved] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  expect(JSON.parse(await read(saved))).toEqual(JSON.parse(await read(original)));

  await page.reload();
  await expect(menu).toHaveText('Operations');
  await expect(visibleEdges).toHaveCount(2);
  await choose('all');
  await expect(visibleEdges).toHaveCount(5);
  await expect(page.getByTestId('tools')).toBeVisible();
  await choose('operations');
  const [other] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await other.setFiles('samples/three-tier.structlet');
  await expect(menu).toHaveText('Full diagram');
  await menu.click();
  await expect(page.getByTestId('diagram-content-flow')).toBeDisabled();
  await expect(page.getByTestId('diagram-content-operations')).toBeDisabled();
  await page.keyboard.press('Escape');
  const [reopen] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await reopen.setFiles((await saved.path())!);
  await expect(menu).toHaveText('Operations');
});

test('the recommended summary preserves useful detail on small, GPU, and large diagrams', async ({ page }) => {
  await freshApp(page, 'ko', { inspector: false });
  const edges = page.locator('.diagram path[data-edge]');
  const nodes = page.locator('.diagram [data-node]');
  for (const { sample, before, after, count, layout } of [
    { sample: 'three-tier', before: 10, after: 10, count: 11, layout: null },
    { sample: 'gpu-training', before: 6, after: 2, count: 3, layout: null },
    { sample: 'polar-observatory', before: 100, after: 28, count: 9, layout: 'grid' },
  ]) {
    const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
    await picker.setFiles(`samples/${sample}.structlet`);
    await expect(edges).toHaveCount(before);
    await diagram(page, 'recommend-summary');
    await expect(edges).toHaveCount(after);
    await expect(nodes).toHaveCount(count);
    if (layout) {
      await page.getByTestId('menu-diagram').click();
      await expect(page.getByTestId(`layout-summary-${layout}`)).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');
    }
  }
  await page.reload();
  await expect(nodes).toHaveCount(9);
  await expect(edges).toHaveCount(28);
  await diagram(page, 'expand-all');
  await expect(edges).toHaveCount(100);
});
