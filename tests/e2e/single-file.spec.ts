import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { act, openManual } from './helpers';

const file = resolve('dist-single/structlet.html');

test.skip(!existsSync(file), 'run `npm run build:single` first');

test('single structlet.html works from file://', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => localStorage.setItem('structlet:language', 'en'));
  await page.reload();
  await expect(page.locator('.empty-state').getByRole('button')).toHaveCount(0);
  const guide = await openManual(page);
  const manual = guide.getByRole('main', { name: 'User guide' });
  await expect(guide).toHaveURL(pathToFileURL(file).href + '#manual');
  const preview = manual.getByRole('img');
  await expect(preview).toHaveAttribute('src', /^data:image\/webp/);
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1240);
  const [sample] = await Promise.all([guide.waitForEvent('download'), manual.getByRole('button', { name: 'Download sample (.structlet)' }).click()]);
  expect(sample.suggestedFilename()).toBe('three-tier.structlet');
  await manual.getByRole('radio', { name: 'Build a diagram with AI' }).click();
  const [skill] = await Promise.all([
    guide.waitForEvent('download'), manual.getByRole('button', { name: 'Download Structlet skill (.zip)' }).click(),
  ]);
  expect(readFileSync((await skill.path())!).subarray(0, 2).toString()).toBe('PK');
  await manual.getByLabel('AI draft JSON').fill(JSON.stringify({ title: 'Offline AI', nodes: [{ id: 'api', service: 'aws.ec2' }] }));
  const [generated] = await Promise.all([
    guide.waitForEvent('download'), manual.getByRole('button', { name: 'Download .structlet', exact: true }).click(),
  ]);
  expect(generated.suggestedFilename()).toBe('Offline AI.structlet');
  await guide.close();
  const [sampleChooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await sampleChooser.setFiles((await sample.path())!);
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await chooser.setFiles('tests/unit/adapters/fixtures/docker-compose.yml');
  await expect(page.locator('[data-testid="node-svc-api"]')).toHaveCount(1);
  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  expect(readFileSync((await svg.path())!, 'utf8')).toContain('<svg');
  const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG');

  expect(await page.getByTestId('drive-button').count()).toBe(0);
  await act(page, 'menu-file');
  const webOnly = page.getByTestId('drive-web-only');
  if (await webOnly.count()) await expect(webOnly).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('[data-testid="node-svc-api"]')).toHaveCount(1);
  const secondGuide = await openManual(page);
  const complexManual = secondGuide.getByRole('main', { name: 'User guide' });
  await complexManual.getByRole('radio', { name: 'Complex example' }).click();
  const summaryPreview = complexManual.getByRole('img').first();
  await summaryPreview.scrollIntoViewIfNeeded();
  await expect(summaryPreview).toHaveAttribute('src', /^data:image\/webp/);
  await expect.poll(() => summaryPreview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1080);
  const [complex] = await Promise.all([
    secondGuide.waitForEvent('download'), complexManual.getByRole('button', { name: 'Download Commerce & ML platform (.structlet)' }).click(),
  ]);
  await secondGuide.close();
  const [complexChooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await complexChooser.setFiles((await complex.path())!);
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(16);
  await page.getByTestId('menu-diagram').click();
  await page.getByTestId('fold-top').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(5);
  expect(errors).toEqual([]);
});
