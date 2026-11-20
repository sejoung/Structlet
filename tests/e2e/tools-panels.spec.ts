import { expect, test } from '@playwright/test';
import { center, drag, freshApp, openSample } from './helpers';

const transform = (page: import('@playwright/test').Page) => page.locator('.canvas-svg > g').first().getAttribute('transform');
const saved = async (page: import('@playwright/test').Page) => {
  await page.waitForTimeout(500);
  return page.evaluate(() => JSON.parse(localStorage.getItem('structlet:autosave:v1') ?? 'null'));
};

test('panels fold away and come back, and the choice is remembered', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  // Clicking the open rail tab again folds the left panel.
  await page.getByTestId('rail-services').click();
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await page.getByTestId('rail-layers').click();
  await expect(page.getByTestId('layers')).toBeVisible();
  // The right panel hides and returns from the same top-bar button, which shows its state.
  await page.getByTestId('toggle-right').click();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('toggle-right').click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-pressed', 'true');
  // The left toggle sits beside it and works the same way.
  await page.getByTestId('toggle-left').click();
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await page.getByTestId('toggle-left').click();
  await expect(page.locator('#sidebar-panel')).toBeVisible();
  // ⌘\ hides both; the state survives a reload.
  await page.locator('body').press('ControlOrMeta+Backslash');
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.locator('body').press('ControlOrMeta+Backslash');
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('#sidebar-panel')).toBeVisible();
});

test('hand tool only moves the view', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const before = await saved(page);
  await page.keyboard.press('h');
  await expect(page.getByTestId('tool-hand')).toHaveAttribute('aria-pressed', 'true');
  const t0 = await transform(page);
  const api = await center(page, 'node-api');
  await drag(page, api, { x: api.x + 120, y: api.y + 60 });
  expect(await transform(page)).not.toBe(t0);
  const after = await saved(page);
  expect(after.nodes).toEqual(before.nodes);
  expect(await page.locator('.sel-outline').count()).toBe(0);
  // Double-click does not start editing with the hand tool.
  await page.mouse.dblclick(api.x + 120, api.y + 60);
  await expect(page.locator('.inline-editor')).toHaveCount(0);
  await page.getByTestId('tool-select').click();
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
});

test('connect tool draws lines from box to box until Esc', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const count = (await saved(page)).edges.length;
  await page.getByTestId('tool-connect').click();
  await expect(page.getByRole('status').filter({ hasText: 'Drag from one box' })).toBeVisible();
  await drag(page, await center(page, 'node-auth'), await center(page, 'node-db'));
  await drag(page, await center(page, 'node-mail'), await center(page, 'node-payment'));
  const after = await saved(page);
  expect(after.edges).toHaveLength(count + 2);
  expect(after.edges.at(-2)).toMatchObject({ source: { objectId: 'auth' }, target: { objectId: 'db' } });
  // Dropping on empty canvas makes nothing; dragging empty space pans.
  const t0 = await transform(page);
  await drag(page, { x: 700, y: 820 }, { x: 760, y: 840 });
  expect(await transform(page)).not.toBe(t0);
  expect((await saved(page)).edges).toHaveLength(count + 2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
});

test('view mode hides panels and editing, Esc returns', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.locator('[data-testid="node-api"] rect').first().click();
  await page.locator('body').press('ControlOrMeta+Period');
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await expect(page.getByTestId('tools')).toHaveCount(0);
  await expect(page.locator('.sel-outline')).toHaveCount(0);
  const t0 = await transform(page);
  const api = await center(page, 'node-api');
  await drag(page, api, { x: api.x - 100, y: api.y });
  expect(await transform(page)).not.toBe(t0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.getByTestId('tools')).toBeVisible();
  // The exit button works too.
  await page.getByTestId('tb-present').click();
  await page.getByTestId('exit-present').click();
  await expect(page.getByTestId('tools')).toBeVisible();
});

test('one button hides both panels; the canvas takes all of the space and the diagram stays centered', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const canvasBox = async () => (await page.locator('.canvas').boundingBox())!;
  const offset = async () => {
    const c = await canvasBox();
    const n = await center(page, 'node-api');
    return { x: n.x - (c.x + c.width / 2), y: n.y - (c.y + c.height / 2) };
  };
  const before = await offset();

  await page.getByTestId('toggle-panels').click();
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.getByTestId('toggle-left')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-pressed', 'false');
  // No leftover strip: the canvas reaches the window's right edge.
  const c = await canvasBox();
  expect(Math.round(c.x + c.width)).toBe(page.viewportSize()!.width);
  const after = await offset();
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);

  await page.getByTestId('toggle-panels').click();
  await expect(page.locator('#sidebar-panel')).toBeVisible();
  await expect(page.locator('.inspector')).toBeVisible();
  const back = await offset();
  expect(Math.abs(back.x - before.x)).toBeLessThan(2);
});

test('panel toggles keep their place in every state', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const ids = ['toggle-left', 'toggle-right', 'toggle-panels', 'tb-shortcuts', 'menu-settings', 'menu-export'];
  const where = async () => Promise.all(ids.map(async (id) => Math.round((await page.getByTestId(id).boundingBox())!.x)));
  const start = await where();
  for (const id of ['toggle-right', 'toggle-left', 'toggle-right', 'toggle-panels', 'toggle-panels']) {
    await page.getByTestId(id).click();
    expect(await where()).toEqual(start);
  }
});
