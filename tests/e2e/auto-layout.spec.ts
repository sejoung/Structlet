import { expect, test } from '@playwright/test';
import { act, freshApp } from './helpers';

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
