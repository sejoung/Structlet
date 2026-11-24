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

const exportPacks = [
  {
    provider: 'AWS',
    svg: { path: 'Architecture-Service-Icons/Arch_Compute/48/Arch_Amazon-EC2_48.svg', service: 'aws.ec2' },
    png: { path: 'Architecture-Service-Icons/Arch_Compute/48/Arch_AWS-Lambda_48.png', service: 'aws.lambda' },
  },
  {
    provider: 'Google Cloud',
    svg: { path: 'Unique Icons/Compute Engine/SVG/ComputeEngine-512-color-rgb.svg', service: 'gcp.compute-engine' },
    png: { path: 'Unique Icons/Cloud Run/PNG/CloudRun-512-color-rgb.png', service: 'gcp.cloud-run' },
  },
  {
    provider: 'Azure',
    svg: { path: 'Azure_Public_Service_Icons/Icons/compute/10021-icon-service-Virtual-Machine.svg', service: 'azure.vm' },
    png: { path: 'Azure_Public_Service_Icons/Icons/compute/10029-icon-service-Function-Apps.png', service: 'azure.functions' },
  },
  {
    provider: 'Kubernetes',
    svg: { path: 'svg/resources/unlabeled/deploy.svg', service: 'k8s.deployment' },
    png: { path: 'png/resources/unlabeled/svc-128.png', service: 'k8s.service' },
  },
];

for (const { provider, svg, png } of exportPacks) test(`${provider} icons and equipment specs render in both image exports`, async ({ page }) => {
  await freshApp(page);
  const pngIcon = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#17a779';
    context.fillRect(0, 0, 48, 48);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await act(page, 'tb-icon-packs');
  const [packPicker] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('pack-zip').click()]);
  await packPicker.setFiles({
    name: 'icons.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync({ [svg.path]: icon('#e7157b'), [png.path]: Buffer.from(pngIcon, 'base64') })),
  });
  const pack = page.locator('[data-testid^="pack-pack-"]');
  await expect(pack).toContainText(provider);
  await expect(pack).toContainText('2 services, 0 extra icons');
  await page.getByTestId('packs-close').click();

  const [diagramPicker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await diagramPicker.setFiles({
    name: 'equipment.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'structlet-draft',
      nodes: [
        { id: 'primary', service: svg.service, label: 'Primary', specs: { instanceType: 'example.small', vcpus: 2, showDetails: true } },
        { id: 'secondary', service: png.service, label: 'Secondary' },
      ],
    })),
  });
  await expect(page.locator('.diagram [data-node] use')).toHaveCount(2);
  await expect(page.locator('.diagram [data-node-specs]')).toContainText('example.small');

  for (const view of ['2d', 'isometric']) {
    if (view === 'isometric') {
      await page.getByTestId('tb-view').locator('[data-value="isometric"]').click();
      await page.getByRole('radio', { name: 'All labels' }).click();
    }
    const [svgDownload] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
    const source = readFileSync((await svgDownload.path())!, 'utf8');
    const xml = await page.evaluate(({ source, view }) => {
      const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
      return {
        error: svg.querySelector('parsererror')?.textContent ?? null,
        icons: [...svg.querySelectorAll('symbol image')].map((image) => image.getAttribute('href')?.split(';')[0]).sort(),
        specs: svg.querySelector(view === '2d' ? '[data-node-specs]' : '[data-spec-detail]')?.textContent,
      };
    }, { source, view });
    expect(xml.error).toBeNull();
    expect(xml.icons).toEqual(['data:image/png', 'data:image/svg+xml']);
    expect(xml.specs).toContain('example.small');

    const [pngDownload] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
    const bytes = readFileSync((await pngDownload.path())!);
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
      const colors = new Set([0xe7157b, 0x17a779]);
      for (let i = 0; i < data.length && colors.size > 0; i += 4) {
        if (data[i + 3] === 255) colors.delete((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
      }
      return colors.size;
    }, bytes.toString('base64'))).toBe(0);
  }
});
