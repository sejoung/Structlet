import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { act, drag, freshApp } from './helpers';

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
  await expect(iso).toHaveAttribute('data-rotation', '90');
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
  await expect(iso).toHaveAttribute('data-rotation', '180');

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

test('smooth rotation buttons snap to the next fixed angle and the default button restores 0°', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles('samples/commerce-and-ml.structlet');
  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  const label = iso.locator('[data-iso-label="node"][data-iso-object="checkout"] rect');
  const labelBefore = { x: await label.getAttribute('x'), y: await label.getAttribute('y') };
  const zoom = page.getByTestId('zoom-level');
  const zoomBefore = await zoom.innerText();
  const home = page.getByRole('button', { name: 'Default view (0°)', exact: true });
  await expect(home).toBeVisible();
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));

  const orbit = page.getByRole('button', { name: 'Orbit view' });
  const left = page.getByRole('button', { name: 'Rotate left' });
  const right = page.getByRole('button', { name: 'Rotate right' });
  await orbit.click();
  const box = (await iso.boundingBox())!;
  const from = { x: box.x + 100, y: box.y + box.height / 2 };
  const end = { x: from.x + 92, y: from.y };
  await drag(page, from, end);
  await expect(iso).toHaveAttribute('data-rotation', '37');
  await left.click();
  await page.clock.runFor(80);
  const intermediate = Number(await iso.getAttribute('data-rotation'));
  expect(intermediate).toBeGreaterThan(0);
  expect(intermediate).toBeLessThan(37);
  await page.clock.runFor(150);
  await expect(iso).toHaveAttribute('data-rotation', '0');

  await drag(page, from, end);
  await expect(iso).toHaveAttribute('data-rotation', '37');
  for (const target of ['90', '180', '270', '0']) {
    await right.click();
    await page.clock.runFor(230);
    await expect(iso).toHaveAttribute('data-rotation', target);
  }

  await orbit.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await left.click();
  await expect(iso).toHaveAttribute('data-rotation', '270');
  await home.click();
  await expect(iso).toHaveAttribute('data-rotation', '0');
  await expect(zoom).toHaveText(zoomBefore);
  await expect(label).toHaveAttribute('x', labelBefore.x!);
  await expect(label).toHaveAttribute('y', labelBefore.y!);
});
