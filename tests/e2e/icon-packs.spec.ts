import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { act, freshApp, openSample } from './helpers';

const icon = (color: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="${color}"/></svg>`);

test('loading an AWS icon pack from a zip changes icons everywhere and survives a reload', async ({ page }, info) => {
  const zip = info.outputPath('aws-icons.zip');
  writeFileSync(
    zip,
    zipSync({
      'Asset-Package/Architecture-Service-Icons/Arch_App-Integration/48/Arch_Amazon-Simple-Queue-Service_48.svg': icon('#e7157b'),
      'Asset-Package/Architecture-Service-Icons/Arch_Compute/48/Arch_AWS-Lambda_48.svg': icon('#ed7100'),
      'Asset-Package/Architecture-Group-Icons/Virtual-private-cloud-VPC_32.svg': icon('#8c4fff'),
      'Asset-Package/Architecture-Service-Icons/Arch_Business-Applications/48/Arch_Amazon-Chime_48.svg': icon('#000'),
    }),
  );
  await freshApp(page);
  await openSample(page);
  await act(page, 'tb-icon-packs');
  await expect(page.getByTestId('icon-packs')).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('pack-zip').click()]);
  await chooser.setFiles(zip);
  await expect(page.locator('[data-testid^="pack-pack-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="pack-pack-"]')).toContainText('2 services, 1 extra icons, 1 area icons');
  await page.getByTestId('packs-close').click();

  await expect(page.locator('.diagram [data-node="queue"] use')).toHaveCount(1);
  await expect(page.locator('.diagram [data-node="worker"] use')).toHaveCount(1);
  await expect(page.locator('.diagram [data-node="db"] use')).toHaveCount(0);
  await expect(page.locator('.diagram [data-container="vpc"] use')).toHaveCount(1);
  await page.getByLabel('Search services').fill('chime');
  await expect(page.locator('[data-service="aws.pack.chime"] img')).toHaveCount(1);
  await page.getByLabel('Search services').fill('');

  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  const text = readFileSync((await svg.path())!, 'utf8');
  expect(text.match(/<symbol /g)).toHaveLength(3);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('structlet:autosave:v1'))).not.toContain('data:image');

  await page.reload();
  await expect(page.locator('.diagram [data-node="queue"] use')).toHaveCount(1);
  await act(page, 'tb-icon-packs');
  await page.locator('[data-testid^="pack-pack-"] input[type="checkbox"]').uncheck();
  await page.getByTestId('packs-close').click();
  await expect(page.locator('.diagram [data-node="queue"] use')).toHaveCount(0);
});

test('the empty icon pack message fits on a line in Korean', async ({ page }) => {
  await freshApp(page, 'ko');
  await act(page, 'tb-icon-packs');
  const dialog = page.getByRole('dialog', { name: '아이콘 팩' });
  const empty = dialog.getByText('불러온 아이콘 팩이 없습니다.');
  await expect(empty).toBeVisible();
  const lines = await empty.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  expect(lines).toBe(1);
  await expect(dialog.getByRole('link', { name: 'Kubernetes Community Icons' })).toHaveAttribute('href', 'https://github.com/kubernetes/community/tree/main/icons');
});

test('loading a Kubernetes icon folder', async ({ page }, info) => {
  const dir = info.outputPath('k8s-icons');
  mkdirSync(join(dir, 'svg/resources/unlabeled'), { recursive: true });
  for (const name of ['deploy', 'svc', 'ing', 'ns']) writeFileSync(join(dir, `svg/resources/unlabeled/${name}.svg`), icon('#326ce5'));
  await freshApp(page);
  await act(page, 'tb-icon-packs');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('pack-folder').click()]);
  await chooser.setFiles(dir);
  await expect(page.locator('[data-testid^="pack-pack-"]')).toContainText('Kubernetes');
  await page.getByTestId('packs-close').click();

  const [c] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await c.setFiles('tests/unit/adapters/fixtures/k8s.yaml');
  await expect(page.locator('[data-testid="node-k8s-shop-deployment-api"]')).toHaveCount(1);
  await expect(page.locator('.diagram [data-node="k8s-shop-deployment-api"] use')).toHaveCount(1);
  await expect(page.locator('.diagram [data-container="k8s-ns-shop"] use')).toHaveCount(1);
  await expect(page.locator('.diagram [data-container]')).toHaveCount(3);
});

test('AWS icons and equipment specs render in both image exports', async ({ page }) => {
  await freshApp(page);
  const color = '#e7157b';
  await act(page, 'tb-icon-packs');
  const [packPicker] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('pack-zip').click()]);
  await packPicker.setFiles({
    name: 'aws-icons.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync({ 'Architecture-Service-Icons/Arch_Compute/48/Arch_Amazon-EC2_48.svg': icon(color) })),
  });
  await expect(page.locator('[data-testid^="pack-pack-"]')).toContainText('AWS');
  await page.getByTestId('packs-close').click();

  const [diagramPicker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await diagramPicker.setFiles('tests/unit/adapters/fixtures/terraform-state.json');
  await expect(page.locator('.diagram [data-node="tf-aws_instance.app"] use')).toHaveCount(1);
  await expect(page.locator('.diagram [data-node="tf-aws_instance.app"] [data-node-specs]')).toContainText('t4g.small');

  for (const view of ['2d', 'isometric']) {
    if (view === 'isometric') {
      await page.getByTestId('tb-view').locator('[data-value="isometric"]').click();
      await page.getByRole('radio', { name: 'All labels' }).click();
    }
    const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
    const source = readFileSync((await svg.path())!, 'utf8');
    const xml = await page.evaluate(({ source, view }) => {
      const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
      return {
        error: svg.querySelector('parsererror')?.textContent ?? null,
        icon: svg.querySelector('symbol image')?.getAttribute('href'),
        specs: svg.querySelector(view === '2d' ? '[data-node-specs]' : '[data-spec-detail]')?.textContent,
      };
    }, { source, view });
    expect(xml.error).toBeNull();
    expect(xml.icon).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(xml.specs).toContain('t4g.small');

    const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
    const bytes = readFileSync((await png.path())!);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(await page.evaluate(async (png) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (byte) => byte.charCodeAt(0))], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 231 && data[i + 1] === 21 && data[i + 2] === 123 && data[i + 3] === 255) return true;
      }
      return false;
    }, bytes.toString('base64'))).toBe(true);
  }
});
