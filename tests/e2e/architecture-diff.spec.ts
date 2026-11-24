import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { act, freshApp, openManual } from './helpers';

async function chooseFile(page: Page, action: 'tb-open' | 'tb-compare', path: string) {
  const chooser = page.waitForEvent('filechooser');
  await act(page, action);
  await (await chooser).setFiles(path);
}

test('compare the example versions without replacing the editable diagram', async ({ page }) => {
  await freshApp(page);
  await chooseFile(page, 'tb-open', 'samples/architecture-diff-after.structlet');
  await expect(page.getByTestId('node-cache')).toBeVisible();
  await chooseFile(page, 'tb-compare', 'samples/architecture-diff-before.structlet');
  const dialog = page.getByTestId('comparison');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Order Worker.*Application → Background jobs/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Modified Web client', exact: true })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: 'Include layout changes' }).check();
  await expect(dialog.getByRole('button', { name: 'Modified Web client', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /Removed Legacy queue/ }).first().click();
  await expect(dialog.getByRole('button', { name: 'Previous', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('rect[data-status="removed"][data-focused="true"]')).toHaveCount(1);
  await dialog.getByRole('button', { name: /Added Redis/ }).click();
  await expect(dialog.getByRole('button', { name: 'Current', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('rect[data-status="added"][data-focused="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('node-cache')).toBeVisible();
  await expect(page.getByTestId('node-legacy')).toHaveCount(0);
  await expect(page.getByTestId('tb-undo')).toBeDisabled();
  await chooseFile(page, 'tb-compare', 'samples/three-tier.structlet');
  await expect(page.getByText('Choose an earlier file saved from this diagram.')).toBeVisible();
});

test('the comparison manual provides both example files and a screenshot', async ({ page }) => {
  await freshApp(page);
  const manual = await openManual(page);
  await manual.getByRole('radio', { name: 'Compare versions' }).click();
  const screenshot = manual.getByRole('img', { name: /Comparison showing Redis/ });
  await expect(screenshot).toBeVisible();
  await expect.poll(() => screenshot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  for (const [label, side] of [['previous', 'before'], ['current', 'after']]) {
    const download = manual.waitForEvent('download');
    await manual.getByRole('button', { name: `Download ${label} example` }).click();
    expect((await download).suggestedFilename()).toBe(`architecture-diff-${side}.structlet`);
  }
});

test('compare downloaded examples from the offline HTML', async ({ page, context }) => {
  const file = resolve('dist-single/structlet.html');
  test.skip(!existsSync(file), 'run npm run build:single first');
  await context.setOffline(true);
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => localStorage.setItem('structlet:language', 'en'));
  await page.reload();
  const manual = await openManual(page);
  await manual.getByRole('radio', { name: 'Compare versions' }).click();
  const preview = manual.getByRole('img', { name: /Comparison showing Redis/ });
  await expect(preview).toHaveAttribute('src', /^data:image\/webp/);
  const [current] = await Promise.all([manual.waitForEvent('download'), manual.getByRole('button', { name: 'Download current example' }).click()]);
  const [previous] = await Promise.all([manual.waitForEvent('download'), manual.getByRole('button', { name: 'Download previous example' }).click()]);
  await manual.close();
  await chooseFile(page, 'tb-open', (await current.path())!);
  await expect(page.getByTestId('node-cache')).toBeVisible();
  await chooseFile(page, 'tb-compare', (await previous.path())!);
  await expect(page.getByTestId('comparison').getByRole('button', { name: 'Added Redis', exact: true })).toBeVisible();
});
