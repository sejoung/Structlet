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
