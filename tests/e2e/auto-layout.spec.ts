import { expect, test } from '@playwright/test';
import { act, freshApp, openManual } from './helpers';

test('GPU training stays readable through each browser auto-layout and undo', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles('samples/gpu-training.structlet');

  const cluster = page.locator('.diagram [data-container="training-cluster"] > rect').first();
  const note = page.locator('.diagram [data-annotation="training-notes"]');
  await expect(note).toBeVisible();
  const original = await cluster.getAttribute('width');
  for (const mode of ['grid', 'flow', 'flow-down']) {
    await page.getByTestId('menu-diagram').click();
    await page.getByTestId(`layout-document-${mode}`).click();
    await expect.poll(async () => {
      const bounds = await cluster.boundingBox();
      const text = await note.boundingBox();
      const canvas = await page.getByTestId('canvas').boundingBox();
      return !!bounds && !!text && !!canvas &&
        bounds.x >= canvas.x && bounds.x + bounds.width < canvas.x + canvas.width &&
        bounds.y >= canvas.y && text.y > bounds.y + bounds.height &&
        text.y + text.height < canvas.y + canvas.height;
    }).toBe(true);
    await expect(page.locator('.diagram [data-edge]')).toHaveCount(6);
    await expect(page.locator('.diagram')).toContainText('ConnectX NIC');
    await page.getByTestId('tb-undo').click();
    await expect(cluster).toHaveAttribute('width', original!);
  }
});

test('all layout modes fit the more complex commerce and ML diagram in the canvas', async ({ page }) => {
  await freshApp(page);
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles('samples/commerce-and-ml.structlet');
  await expect(page.locator('.diagram [data-edge]')).toHaveCount(18);
  for (const mode of ['grid', 'flow', 'flow-down']) {
    await page.getByTestId('menu-diagram').click();
    await page.getByTestId(`layout-document-${mode}`).click();
    await expect.poll(() => page.getByTestId('canvas').evaluate((canvas) => {
      const viewport = canvas.getBoundingClientRect();
      const diagram = canvas.querySelector('.diagram')!.getBoundingClientRect();
      return diagram.left >= viewport.left && diagram.right <= viewport.right &&
        diagram.top >= viewport.top && diagram.bottom <= viewport.bottom;
    })).toBe(true);
    await expect(page.locator('.diagram [data-edge]')).toHaveCount(18);
  }
});

test('large manual sample lays out, and a group fills the canvas in 2D or isometric view', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const guide = await openManual(page);
  await guide.getByRole('radio', { name: 'Complex example' }).click();
  const picture = guide.getByRole('img', { name: /^Polar Observatory Network/ });
  await picture.scrollIntoViewIfNeeded();
  await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1200);
  const [sample] = await Promise.all([
    guide.waitForEvent('download'), guide.getByRole('button', { name: 'Download Polar Observatory Network (.structlet)' }).click(),
  ]);
  expect(sample.suggestedFilename()).toBe('polar-observatory.structlet');
  await guide.close();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles((await sample.path())!);
  await expect(page.locator('.diagram [data-node]')).toHaveCount(70);
  await page.getByTestId('menu-diagram').click();
  await page.getByTestId('layout-document-grid').click();
  await expect(page.locator('.diagram [data-edge]')).toHaveCount(100);

  const body = page.locator('.diagram [data-container="release"] rect').first();
  const before = (await body.boundingBox())!;
  const worldX = await body.getAttribute('x');
  await page.locator('rect[data-hit="box"][data-id="release"]').click({ button: 'right', position: { x: 5, y: 5 } });
  const fitGroup = page.getByRole('menuitem', { name: 'Fit group to screen' });
  await fitGroup.click();
  await expect.poll(async () => (await body.boundingBox())!.width).toBeGreaterThan(before.width * 1.8);
  await expect(body).toHaveAttribute('x', worldX!);
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const fitted = (await body.boundingBox())!;
  expect(fitted.x).toBeGreaterThan(canvas.x);
  expect(fitted.x + fitted.width).toBeLessThan(canvas.x + canvas.width);

  await page.getByTestId('tb-fit').click();
  await page.getByTestId('fold-area-release').click();
  const tile = page.getByTestId('node-release').locator('rect').first();
  const tileBefore = (await tile.boundingBox())!;
  await tile.click({ button: 'right', position: { x: 2, y: Math.max(1, tileBefore.height - 2) } });
  await fitGroup.click();
  await expect.poll(async () => (await tile.boundingBox())!.width).toBeGreaterThan(tileBefore.width * 1.8);

  await page.getByTestId('tb-view').locator('[data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  const isoTile = iso.locator('[data-node="release"]');
  await expect(isoTile).toBeVisible();
  const isoBefore = (await isoTile.boundingBox())!;
  await iso.locator('[data-iso-label="node"][data-iso-object="release"] text').first().click({ button: 'right' });
  await fitGroup.click();
  await expect.poll(async () => (await isoTile.boundingBox())!.width).toBeGreaterThan(isoBefore.width * 1.8);
});
