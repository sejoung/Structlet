import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { act } from './helpers';

/** The one-file build opened by double-click (file://), with no server. */
const file = resolve('dist-single/structlet.html');

test.skip(!existsSync(file), 'run `npm run build:single` first');

test('single structlet.html works from file://', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => localStorage.setItem('structlet:language', 'en'));
  await page.reload();
  await expect(page.locator('.empty-state').getByRole('button')).toHaveCount(0);
  await page.getByTestId('tb-help').click();
  const manual = page.getByRole('dialog', { name: 'User guide' });
  const preview = manual.getByRole('img');
  await expect(preview).toHaveAttribute('src', /^data:image\/webp/);
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1240);
  const [sample] = await Promise.all([page.waitForEvent('download'), manual.getByRole('button', { name: 'Download sample (.structlet)' }).click()]);
  expect(sample.suggestedFilename()).toBe('three-tier.structlet');
  await page.keyboard.press('Escape');
  const [sampleChooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await sampleChooser.setFiles((await sample.path())!);
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);

  // Import (lazy compose parser is inlined) and export without a server.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await chooser.setFiles('tests/unit/adapters/fixtures/docker-compose.yml');
  await expect(page.locator('[data-testid="node-svc-api"]')).toHaveCount(1);
  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  expect(readFileSync((await svg.path())!, 'utf8')).toContain('<svg');
  const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG');

  // Google sign-in needs a web origin: with Drive configured, the menu says why it is off.
  expect(await page.getByTestId('drive-button').count()).toBe(0);
  await act(page, 'menu-file');
  const webOnly = page.getByTestId('drive-web-only');
  if (await webOnly.count()) await expect(webOnly).toBeDisabled();
  await page.keyboard.press('Escape');

  // Autosave survives a reload.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('[data-testid="node-svc-api"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
