import { expect, test } from '@playwright/test';
import { center, drag, freshApp, openSample } from './helpers';

test('dragging an area moves its children and edges; one undo restores', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const before = await center(page, 'node-api');
  const edgeBefore = await page.locator('.diagram path[data-edge="e-api-db"]').getAttribute('d');

  // Grab the VPC by its header and drag it.
  const vpc = await page.locator('[data-hit="box"][data-id="vpc"]').boundingBox();
  const grab = { x: vpc!.x + 120, y: vpc!.y + 10 };
  await drag(page, grab, { x: grab.x + 80, y: grab.y + 40 });

  const after = await center(page, 'node-api');
  expect(after.x - before.x).toBeGreaterThan(60);
  expect(after.y - before.y).toBeGreaterThan(25);
  expect(await page.locator('.diagram path[data-edge="e-api-db"]').getAttribute('d')).not.toBe(edgeBefore);

  await page.keyboard.press('ControlOrMeta+z');
  const undone = await center(page, 'node-api');
  expect(Math.abs(undone.x - before.x)).toBeLessThan(0.5);
  expect(await page.locator('.diagram path[data-edge="e-api-db"]').getAttribute('d')).toBe(edgeBefore);
});

test('dropping a node into another area changes its parent', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const payment = await center(page, 'node-payment');
  const subnet = await page.locator('[data-hit="box"][data-id="public"]').boundingBox();
  await drag(page, payment, { x: subnet!.x + subnet!.width / 2, y: subnet!.y + subnet!.height - 60 });
  await expect(page.getByTestId('prop-parent')).toHaveValue('public');
  await page.keyboard.press('ControlOrMeta+z');
  await page.locator('[data-testid="node-payment"] rect').first().click();
  await expect(page.getByTestId('prop-parent')).toHaveValue('');
});

test('wrapping selected nodes in a new area', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.locator('[data-testid="node-queue"] rect').first().click();
  await page.locator('[data-testid="node-worker"] rect').first().click({ modifiers: ['Shift'] });
  await page.getByTestId('wrap-selected').click();
  await expect(page.locator('.diagram [data-container]')).toHaveCount(6);
  await page.locator('[data-testid="node-queue"] rect').first().click();
  const parent = await page.getByTestId('prop-parent').inputValue();
  expect(parent).not.toBe('region');
  expect(parent).toMatch(/^a-/);
});

test('manual route edits survive moving a node and can be reset', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  // Select the worker → payment edge by clicking its label.
  await page.locator('[data-hit="edge"][data-id="e-worker-payment"]').last().click();
  await expect(page.getByTestId('prop-routing')).toHaveText('Automatic');
  const segments = page.locator('[data-hit="segment"][data-id="e-worker-payment"]');
  const count = await segments.count();
  expect(count).toBeGreaterThan(0);
  const s = await segments.nth(Math.floor(count / 2)).boundingBox();
  const from = { x: s!.x + s!.width / 2, y: s!.y + s!.height / 2 };
  await drag(page, from, { x: from.x + 40, y: from.y + 60 });
  await expect(page.getByTestId('prop-routing')).toContainText('Manual');
  const manual = await page.locator('.diagram path[data-edge="e-worker-payment"]').getAttribute('d');

  const stored = async () => {
    await page.waitForTimeout(500);
    const doc = await page.evaluate(() => JSON.parse(localStorage.getItem('structlet:autosave:v1') ?? 'null'));
    return doc.edges.find((e: { id: string }) => e.id === 'e-worker-payment');
  };
  const edited = await stored();
  expect(edited.routingMode).toBe('manual');
  expect(edited.waypoints.length).toBeGreaterThan(0);

  // Move the payment node: the path changes but the user's waypoints are kept.
  const p = await center(page, 'node-payment');
  await drag(page, p, { x: p.x + 60, y: p.y + 80 });
  const moved = await page.locator('.diagram path[data-edge="e-worker-payment"]').getAttribute('d');
  expect(moved).not.toBe(manual);
  expect((await stored()).waypoints).toEqual(edited.waypoints);

  // Undo the node move, then reset the route.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.locator('.diagram path[data-edge="e-worker-payment"]').getAttribute('d')).toBe(manual);
  await page.locator('[data-hit="edge"][data-id="e-worker-payment"]').last().click();
  await page.getByRole('button', { name: 'Reset route' }).click();
  await expect(page.getByTestId('prop-routing')).toHaveText('Automatic');
});

test('reattaching an edge end to another node', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.locator('[data-hit="edge"][data-id="e-api-db"]').last().click();
  const end = await page.locator('[data-hit="endpoint"][data-which="target"]').boundingBox();
  const cache = await center(page, 'node-cache');
  await drag(page, { x: end!.x + end!.width / 2, y: end!.y + end!.height / 2 }, cache);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tb-save').click()]);
  const { readFileSync } = await import('node:fs');
  const doc = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(doc.edges.find((e: { id: string }) => e.id === 'e-api-db').target.objectId).toBe('cache');
});

test('inline rename with a long Korean name', async ({ page }) => {
  await freshApp(page, 'ko');
  await openSample(page);
  await page.locator('[data-testid="node-api"] rect').first().dblclick();
  const input = page.locator('.inline-editor');
  await input.fill('주문 처리 마이크로서비스 오케스트레이터');
  await input.press('Enter');
  await expect(page.locator('.diagram')).toContainText('오케스트레이터');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.diagram')).not.toContainText('오케스트레이터');
});
