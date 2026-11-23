import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { act, freshApp, openSample } from './helpers';

const row = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-layer-id="${id}"]`);

test('layers tree mirrors the hierarchy and edits it', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.getByTestId('rail-layers').click();
  // Nesting: api sits under private subnet under VPC.
  await expect(row(page, 'api')).toHaveAttribute('aria-level', '5');
  await expect(row(page, 'vpc')).toHaveAttribute('aria-level', '3');

  // Selecting on the canvas selects in the tree, and the other way round.
  await page.locator('[data-testid="node-db"] rect').first().click();
  await expect(row(page, 'db')).toHaveAttribute('aria-selected', 'true');
  await row(page, 'cache').click();
  await expect(page.locator('.inspector-title strong')).toHaveText('세션 캐시');

  // Keyboard: arrow down moves the selection, Enter renames.
  await page.getByTestId('layers').focus();
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'db')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await page.locator('.layer-rename').fill('Orders DB (primary)');
  await page.keyboard.press('Enter');
  await expect(row(page, 'db')).toContainText('Orders DB (primary)');

  // Drag a service row onto another area to move it there; one undo puts it back.
  await row(page, 'payment').dragTo(row(page, 'public'));
  await expect(row(page, 'payment')).toHaveAttribute('aria-level', '5');
  await page.locator('body').press('ControlOrMeta+z');
  await expect(row(page, 'payment')).toHaveAttribute('aria-level', '1');

  // Collapsing an area hides its contents.
  await row(page, 'private').locator('.twisty').click();
  await expect(row(page, 'api')).toHaveCount(0);
});

test('recently used services, manual and menus', async ({ page }) => {
  await freshApp(page);
  await expect(page.getByTestId('recent-services')).toHaveCount(0);
  await page.getByLabel('Search services').fill('redis');
  await page.locator('[data-service="cache"]').dragTo(page.getByTestId('canvas'), { targetPosition: { x: 120, y: 160 } });
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(1);
  await page.getByLabel('Search services').fill('');
  await expect(page.getByTestId('recent-services').locator('[data-service="cache"]')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('recent-services').locator('[data-service="cache"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const manual = page.getByRole('dialog', { name: 'User guide' });
  await expect(manual).toBeVisible();
  await expect.poll(() => manual.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1240);
  await expect(manual.getByRole('link', { name: 'AWS Architecture Icons' })).toHaveAttribute('href', 'https://aws.amazon.com/architecture/icons/');
  await expect(manual.getByRole('link')).toHaveCount(4);
  const [sample] = await Promise.all([page.waitForEvent('download'), manual.getByRole('button', { name: 'Download sample (.structlet)' }).click()]);
  expect(sample.suggestedFilename()).toBe('three-tier.structlet');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(1);

  await manual.getByText('Keyboard shortcuts', { exact: true }).click();
  await expect(manual.getByText('Undo', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(manual).toHaveCount(0);

  const canvas = page.getByTestId('canvas');
  const dropFile = async (name: string, text: string) => {
    const dataTransfer = await page.evaluateHandle(({ name, text }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name));
      return transfer;
    }, { name, text });
    try {
      await canvas.dispatchEvent('dragover', { dataTransfer });
      await canvas.dispatchEvent('drop', { dataTransfer });
    } finally {
      await dataTransfer.dispose();
    }
  };
  await dropFile(sample.suggestedFilename(), readFileSync((await sample.path())!, 'utf8'));
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);

  await dropFile('broken.structlet', '{');
  await expect(page.getByRole('alert')).toContainText('Could not open the file');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);

  // Menus open from the keyboard and close with Escape.
  await page.getByTestId('menu-file').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await act(page, 'tb-lang-ko');
  await expect(page.getByTestId('rail-services')).toContainText('서비스');
  await page.getByRole('button', { name: '도움말', exact: true }).click();
  const koreanManual = page.getByRole('dialog', { name: '사용 매뉴얼' });
  await expect(koreanManual.getByRole('img')).toHaveAttribute('src', /manual-ko/);
  await expect(koreanManual.getByRole('button', { name: '샘플 다운로드 (.structlet)' })).toBeVisible();
});

test('NVIDIA palette, architecture samples and link presets work together', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('tab', { name: 'NVIDIA' }).click();
  await expect(page.locator('[data-service="nvidia.mig"]')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search services' }).fill('H100');
  await page.locator('[data-service="nvidia.gpu"]').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(1);

  for (const [name, filename, node] of [
    ['Distributed GPU training (.structlet)', 'gpu-training.structlet', 'host-1-nvlink'],
    ['MIG inference (.structlet)', 'mig-inference.structlet', 'instance-a'],
  ] as const) {
    await page.getByTestId('tb-help').click();
    const manual = page.getByRole('dialog', { name: 'User guide' });
    await manual.getByRole('radio', { name: 'NVIDIA examples' }).click();
    await expect(manual.getByRole('img')).toHaveCount(2);
    const [sample] = await Promise.all([page.waitForEvent('download'), manual.getByRole('button', { name, exact: true }).click()]);
    expect(sample.suggestedFilename()).toBe(filename);
    await page.keyboard.press('Escape');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
    await chooser.setFiles((await sample.path())!);
    await expect(page.getByTestId(`node-${node}`)).toBeVisible();
  }

  const edgeId = 'model-a-to-instance-a';
  await page.locator(`[data-hit="edge"][data-id="${edgeId}"]`).last().click();
  const path = page.locator(`.diagram path[data-edge="${edgeId}"]`);
  const originalRoute = await path.getAttribute('d');
  await expect(path).toHaveAttribute('marker-end', /url/);
  await page.getByTestId('prop-link-preset').selectOption('NVLink');
  await expect(page.getByTestId('prop-label')).toHaveValue('NVLink');
  expect(await path.getAttribute('marker-end')).toBeNull();
  await expect(path).toHaveAttribute('d', originalRoute!);
  await page.getByTestId('canvas').press('ControlOrMeta+z');
  await expect(page.getByTestId('prop-label')).toHaveValue('GPU allocation');
  await expect(path).toHaveAttribute('marker-end', /url/);
});
