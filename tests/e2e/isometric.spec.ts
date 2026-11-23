import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { act, freshApp } from './helpers';

test('isometric rotation, label modes and context actions share the exported layout', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles('samples/commerce-and-ml.structlet');
  const original = page.getByTestId('node-mig-a').locator('rect').first();
  await expect(original).toBeVisible();
  const x = await original.getAttribute('x');
  const y = await original.getAttribute('y');

  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  await expect(iso.locator('[data-iso-label="edge"]')).toHaveCount(18);
  await expect.poll(() => iso.locator('[data-iso-label]').evaluateAll((labels) => labels.every((label) => {
    const box = label.querySelector('rect')!.getBBox();
    return Array.from(label.querySelectorAll('text')).every((text) => {
      const bounds = text.getBBox();
      return bounds.x >= box.x && bounds.y >= box.y &&
        bounds.x + bounds.width <= box.x + box.width && bounds.y + bounds.height <= box.y + box.height;
    });
  }))).toBe(true);
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await expect(iso).toHaveAttribute('data-rotation', '1');
  await page.getByRole('radio', { name: 'Compact' }).click();
  await expect(iso.locator('[data-iso-label="edge"]')).toHaveCount(0);
  await expect(iso.locator('[data-iso-label="node"]')).toHaveCount(16);

  const title = iso.locator('[data-iso-label="area"][data-iso-object="ml"] text').first();
  await title.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Canvas actions' });
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Collapse ML inference' }).click();
  await expect(iso.locator('[data-node="ml"]')).toBeVisible();
  await iso.locator('[data-iso-label="node"][data-iso-object="ml"] text').first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Expand ML inference' }).click();
  await expect(iso.locator('[data-node="mig-a"]')).toBeVisible();
  await iso.press('Shift+F10');
  await menu.getByRole('menuitem', { name: 'Collapse to middle-level groups' }).click();
  await expect(iso.locator('[data-node="ml-gpu"]')).toBeVisible();
  await iso.press('Shift+F10');
  await menu.getByRole('menuitem', { name: 'Expand all groups' }).click();
  await expect(iso.locator('[data-node="mig-a"]')).toBeVisible();
  await iso.press('Shift+F10');
  await menu.getByRole('menuitem', { name: 'Rotate right' }).click();
  await expect(iso).toHaveAttribute('data-rotation', '2');

  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  const svgText = readFileSync((await svg.path())!, 'utf8');
  expect(svgText).toContain('rotate(180)');
  expect(svgText).not.toContain('data-iso-label="edge"');
  const first = iso.locator('[data-iso-label="node"] rect').first();
  const px = await first.getAttribute('x');
  const py = await first.getAttribute('y');
  expect(svgText).toContain(`<rect x="${px}" y="${py}"`);
  const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG');

  await page.locator('[data-testid="tb-view"] [data-value="2d"]').click();
  await expect(original).toHaveAttribute('x', x!);
  await expect(original).toHaveAttribute('y', y!);
});
