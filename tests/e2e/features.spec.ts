import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { act, center, drag, freshApp, openSample } from './helpers';

const click = (page: import('@playwright/test').Page, id: string, shift = false) => page.locator(`[data-testid="node-${id}"] rect`).first().click(shift ? { modifiers: ['Shift'] } : {});
const autosaved = async (page: import('@playwright/test').Page) => {
  await page.waitForTimeout(500);
  return page.evaluate(() => JSON.parse(localStorage.getItem('structlet:autosave:v1') ?? 'null'));
};

test('auto layout of a selection is one undo step', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const before = await Promise.all(['queue', 'worker', 'mail'].map((id) => center(page, `node-${id}`)));
  await click(page, 'queue');
  await click(page, 'worker', true);
  await click(page, 'mail', true);
  await page.getByTestId('layout-flow').click();
  const after = await Promise.all(['queue', 'worker', 'mail'].map((id) => center(page, `node-${id}`)));
  expect(after[0]!.x).toBeLessThan(after[1]!.x);
  expect(Math.abs(after[0]!.y - after[1]!.y)).toBeLessThan(60);
  await page.keyboard.press('ControlOrMeta+z');
  const undone = await Promise.all(['queue', 'worker', 'mail'].map((id) => center(page, `node-${id}`)));
  undone.forEach((p, i) => expect(Math.abs(p.x - before[i]!.x)).toBeLessThan(0.5));
});

test('importing a draft keeps existing positions and adds new objects; a broken draft changes nothing', async ({ page }, info) => {
  await freshApp(page);
  await openSample(page);
  const base = await autosaved(page);
  const draft = info.outputPath('change.json');
  writeFileSync(draft, JSON.stringify({ format: 'structlet-draft', nodes: [{ id: 'cdn', service: 'cdn', label: 'CDN' }, { id: 'api', label: 'Orders API v2' }], edges: [{ from: 'user', to: 'cdn', label: 'static' }] }));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await chooser.setFiles(draft);
  await expect(page.getByRole('alert')).toContainText('Imported 2 new objects');
  await expect(page.locator('[data-testid="node-cdn"]')).toHaveCount(1);
  const merged = await autosaved(page);
  for (const n of base.nodes) {
    const m = merged.nodes.find((x: { id: string }) => x.id === n.id);
    expect([m.x, m.y, m.parentId]).toEqual([n.x, n.y, n.parentId]);
  }
  expect(merged.nodes.find((n: { id: string }) => n.id === 'api').label).toBe('Orders API v2');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-testid="node-cdn"]')).toHaveCount(0);

  const bad = info.outputPath('bad.json');
  writeFileSync(bad, JSON.stringify({ edges: [{ from: 'api', to: 'nowhere' }] }));
  const [c2] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await c2.setFiles(bad);
  await expect(page.getByRole('alert')).toContainText('nowhere');
  expect((await autosaved(page)).edges).toHaveLength(base.edges.length);
});

test('importing docker-compose into an empty diagram', async ({ page }) => {
  await freshApp(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await chooser.setFiles('tests/unit/adapters/fixtures/docker-compose.yml');
  await expect(page.locator('[data-testid="node-svc-api"]')).toHaveCount(1);
  await expect(page.locator('.diagram [data-container]')).toHaveCount(3);
});

test('copy and paste through the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await freshApp(page);
  await openSample(page);
  await page.locator('[data-hit="box"][data-id="private"]').click({ position: { x: 100, y: 8 } });
  await page.keyboard.press('ControlOrMeta+c');
  await page.locator('[data-hit="box"][data-id="cloud"]').click({ position: { x: 300, y: 6 } });
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(15);
  await expect(page.locator('.diagram [data-container]')).toHaveCount(6);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);
});

test('isometric view and export', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  await expect(page.getByTestId('isometric').locator('polygon').first()).toBeVisible();
  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  expect(svg.suggestedFilename()).toContain('isometric');
  expect(readFileSync((await svg.path())!, 'utf8')).toContain('<polygon');
  await page.locator('[data-testid="tb-view"] [data-value="2d"]').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
});

test('dark theme, box nodes, legend, checks, minimap and keyboard navigation', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await act(page, 'tb-theme-dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('.diagram').innerHTML()).toContain('#9aa4b2');

  await click(page, 'api');
  await page.locator('[data-testid="prop-variant"] [data-value="box"]').click();
  await expect(page.locator('.diagram [data-node="api"] rect').first()).toHaveAttribute('width', '184');

  await page.keyboard.press('Escape');
  await page.getByTestId('rail-notes').click();
  await page.locator('[data-note="legend"]').click();
  await expect(page.locator('.diagram')).toContainText('Compute');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('checks')).toBeVisible();

  const transform = () => page.locator('.canvas-svg > g').first().getAttribute('transform');
  const t0 = await transform();
  const mm = await page.getByTestId('minimap').boundingBox();
  await page.mouse.click(mm!.x + 10, mm!.y + 10);
  expect(await transform()).not.toBe(t0);

  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('announcer')).toContainText('selected');
});

test('touch: one finger pans, two fingers zoom', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const zoomText = () => page.getByTestId('zoom-level').textContent();
  const before = await zoomText();
  const fire = (type: string, id: number, x: number, y: number) =>
    page.getByTestId('canvas').dispatchEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: box.x + x, clientY: box.y + y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
  const transform = () => page.locator('.canvas-svg > g').first().getAttribute('transform');
  const t0 = await transform();
  await fire('pointerdown', 1, 20, 20);
  await fire('pointermove', 1, 80, 60);
  await fire('pointerup', 1, 80, 60);
  expect(await transform()).not.toBe(t0);
  await fire('pointerdown', 1, 300, 300);
  await fire('pointerdown', 2, 400, 300);
  await fire('pointermove', 2, 560, 300);
  await fire('pointerup', 2, 560, 300);
  await fire('pointerup', 1, 300, 300);
  expect(await zoomText()).not.toBe(before);
});

test('box drag still snaps to other boxes', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const p = await center(page, 'node-payment');
  await drag(page, p, { x: p.x + 3, y: p.y + 40 });
  await expect(page.locator('[data-testid="node-payment"]')).toHaveCount(1);
});
