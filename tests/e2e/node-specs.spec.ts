import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { act, freshApp } from './helpers';

test('Terraform equipment details can be edited, arranged within a group, saved, and exported', async ({ page }) => {
  await freshApp(page);
  const [importPicker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await importPicker.setFiles('tests/unit/adapters/fixtures/terraform-state.json');
  await expect(page.getByTestId('node-tf-aws_instance.app')).toBeVisible();
  await page.getByTestId('rail-layers').click();

  const layer = (id: string) => page.locator(`[data-layer-id="${id}"]`);
  const spec = (id: string) => page.locator(`.diagram [data-node="${id}"] [data-node-specs]`);
  const app = 'tf-aws_instance.app';
  const batch = 'tf-aws_instance.batch';
  const subnet = 'tf-aws_subnet.private';
  await expect(spec(app)).toHaveText('t4g.small');
  await layer(app).click();
  const inspector = page.getByTestId('equipment-specs');
  await expect(inspector.getByLabel('Instance type')).toHaveValue('t4g.small');
  await expect(inspector.getByLabel('vCPU')).toHaveValue('2');
  await expect(inspector.getByLabel('RAM (GiB)')).toHaveValue('2');
  const disk = inspector.getByLabel('Boot disk (GiB)');
  await expect(disk).toHaveValue('20');
  await disk.fill('40');
  await disk.press('Enter');
  const showDetails = inspector.getByText('Show detailed specs on the canvas', { exact: true });
  await showDetails.click();
  await expect(spec(app)).toContainText('2 vCPU · 2 GiB RAM');
  await expect(spec(app)).toContainText('Disk · 40 GiB');

  await layer(batch).click();
  await showDetails.click();
  await layer(subnet).click();
  await page.getByTestId('layout-contents-flow-down').click();
  const fits = await page.getByTestId('canvas').evaluate((canvas) => {
    const area = canvas.querySelector<SVGRectElement>('.diagram [data-container="tf-aws_subnet.private"] > rect')!.getBBox();
    const specs = ['tf-aws_instance.app', 'tf-aws_instance.batch'].map((id) =>
      canvas.querySelector<SVGRectElement>(`.diagram [data-node="${id}"] [data-node-specs] rect`)!.getBBox());
    const within = specs.every((r) => r.x >= area.x && r.y >= area.y && r.x + r.width <= area.x + area.width && r.y + r.height <= area.y + area.height);
    const [a, b] = specs;
    const overlap = a!.x < b!.x + b!.width && b!.x < a!.x + a!.width && a!.y < b!.y + b!.height && b!.y < a!.y + a!.height;
    return within && !overlap;
  });
  expect(fits).toBe(true);
  const [saved] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  const [openPicker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await openPicker.setFiles((await saved.path())!);
  await expect(spec(app)).toContainText('Disk · 40 GiB');

  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  await expect(iso.locator('[data-spec-detail]')).toHaveCount(0);
  await page.getByRole('radio', { name: 'All labels' }).click();
  const details = iso.locator(`[data-iso-label="node"][data-iso-object="${app}"] [data-spec-detail]`);
  await expect(details).toHaveText(['t4g.small', '2 vCPU · 2 GiB RAM', 'Disk · 40 GiB']);
  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  expect(readFileSync((await svg.path())!, 'utf8')).toContain('Disk · 40 GiB');
});
