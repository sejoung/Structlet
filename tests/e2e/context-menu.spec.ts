import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { act, freshApp, openSample } from './helpers';

const menu = (page: Page) => page.getByRole('menu', { name: 'Canvas actions' });
const action = (page: Page, name: string) => menu(page).getByRole('menuitem', { name, exact: true });
const node = (page: Page, id: string) => page.getByTestId(`node-${id}`).locator('rect').first();

async function blankMenu(page: Page) {
  const point = await page.getByTestId('canvas').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    for (let y = bounds.top + 100; y < bounds.bottom - 20; y += 25) {
      const x = bounds.left + 8;
      const hit = document.elementFromPoint(x, y);
      if (hit && canvas.contains(hit) && !hit.closest('[data-hit]')) return { x, y };
    }
    throw new Error('No blank canvas point');
  });
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test('context menu edits a service and supports keyboard navigation and dismissal', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await node(page, 'api').click({ button: 'right' });
  await expect(action(page, 'Rename')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(action(page, 'Lock position')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('prop-lock')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('canvas').press('Shift+F10');
  await expect(action(page, 'Unlock position')).toBeVisible();
  await action(page, 'Unlock position').click();
  await page.getByTestId('canvas').press('Shift+F10');
  await action(page, 'Rename').click();
  await page.locator('.inline-editor').fill('Updated API');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('prop-label')).toHaveValue('Updated API');

  await node(page, 'api').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('canvas')).toBeFocused();
  await node(page, 'api').click({ button: 'right' });
  await action(page, 'Duplicate').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(12);
  await page.getByTestId('canvas').press('Shift+F10');
  await action(page, 'Delete').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);
});

test('context menu preserves multi-selection for arranging, aligning and wrapping', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await node(page, 'db').click();
  await node(page, 'cache').click({ modifiers: ['Shift'] });
  await node(page, 'db').click({ button: 'right' });

  const layout = menu(page).getByRole('group', { name: 'Auto layout', exact: true });
  await expect(layout).toBeVisible();
  await layout.getByRole('menuitem', { name: 'Left → right' }).click();
  await node(page, 'db').click({ button: 'right' });
  await action(page, 'Left edges').click();
  await expect(node(page, 'db')).toHaveAttribute('x', (await node(page, 'cache').getAttribute('x'))!);
  await node(page, 'db').click({ button: 'right' });
  await action(page, 'Wrap in area').click();
  await expect(page.locator('.diagram [data-container]')).toHaveCount(6);

  await page.getByTestId('canvas').press('Shift+F10');
  await expect(menu(page).getByRole('group', { name: 'Lay out contents' })).toBeVisible();
  await menu(page).getByRole('group', { name: 'Lay out contents' }).getByRole('menuitem', { name: 'Grid' }).click();
  await page.getByTestId('canvas').press('Shift+F10');
  await menu(page).getByRole('menuitem', { name: /^Collapse / }).click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(10);
  await page.getByTestId('canvas').press('Shift+F10');
  await menu(page).getByRole('menuitem', { name: /^Expand / }).filter({ hasNotText: 'Expand all groups' }).click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);
});

test('blank canvas menu pastes and switches between large and intermediate groups', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await freshApp(page);
  await openSample(page);
  await node(page, 'user').click();
  await page.evaluate(async () => {
    const clipboardData = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
    await navigator.clipboard.writeText(clipboardData.getData('text/plain'));
  });
  await blankMenu(page);
  await action(page, 'Paste').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(12);

  await blankMenu(page);
  await action(page, 'Collapse top-level groups').click();
  await expect(node(page, 'cloud')).toBeVisible();
  await expect(node(page, 'vpc')).toHaveCount(0);
  await blankMenu(page);
  await action(page, 'Collapse to middle-level groups').click();
  await expect(node(page, 'cloud')).toHaveCount(0);
  await expect(node(page, 'public')).toBeVisible();
  await expect(node(page, 'private')).toBeVisible();
  await expect(page.locator('.diagram [data-container="vpc"]')).toHaveCount(1);
  await blankMenu(page);
  await menu(page).getByRole('group', { name: 'Arrange summary view' }).getByRole('menuitem', { name: 'Grid' }).click();
  await blankMenu(page);
  await action(page, 'Fit to screen').click();
  await blankMenu(page);
  await menu(page).getByRole('group', { name: 'Auto-layout with groups collapsed' }).getByRole('menuitem', { name: 'Grid' }).click();
  await expect(node(page, 'private')).toBeVisible();
  await expect(node(page, 'api')).toHaveCount(0);
  await blankMenu(page);
  await action(page, 'Expand all groups').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(12);
});

test('connection context menu edits labels, reverses endpoints and restores automatic routing', async ({ page }) => {
  const sample = JSON.parse(readFileSync('samples/three-tier.structlet', 'utf8'));
  const edge = sample.edges.find((edge: { id: string }) => edge.id === 'e-api-db');
  const { source, target } = edge;
  edge.routingMode = 'manual';
  edge.waypoints = [{ x: 900, y: 450 }];
  await freshApp(page);
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles({ name: 'manual-route.structlet', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sample)) });
  const link = page.locator('[data-hit="edge"][data-id="e-api-db"]').last();
  await link.click({ button: 'right' });
  await action(page, 'Edit label').click();
  await page.locator('.inline-editor').fill('Orders SQL');
  await page.keyboard.press('Enter');
  await page.getByTestId('canvas').press('Shift+F10');
  await action(page, 'Reverse direction').click();
  await page.getByTestId('canvas').press('Shift+F10');
  await action(page, 'Reset route').click();
  await expect(page.getByTestId('prop-routing')).toHaveText('Automatic');
  const [download] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  const saved = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(saved.edges.find((edge: { id: string }) => edge.id === 'e-api-db')).toMatchObject({ source: target, target: source, label: 'Orders SQL', waypoints: [] });
});
