import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { act, freshApp, openManual } from './helpers';

const samplePath = 'samples/commerce-and-ml.structlet';

async function diagram(page: Page, action: string) {
  await page.getByTestId('menu-diagram').click();
  await page.getByTestId(action).click();
}

test('the bilingual manual shows separate example tabs and downloads the complex diagram', async ({ page }) => {
  await freshApp(page);
  const guide = await openManual(page);
  const manual = guide.getByRole('main', { name: 'User guide' });
  const basic = manual.getByRole('radio', { name: 'Basic example' });
  const complex = manual.getByRole('radio', { name: 'Complex example' });
  await expect(basic).toHaveAttribute('aria-checked', 'true');
  await expect(manual.getByRole('radio', { name: 'NVIDIA examples' })).toBeVisible();

  await complex.click();
  await expect(manual.getByRole('img')).toHaveCount(3);
  await expect(manual.getByRole('img').first()).toHaveAttribute('src', /manual-summary-en/);
  const [download] = await Promise.all([
    guide.waitForEvent('download'), manual.getByRole('button', { name: 'Download Commerce & ML platform (.structlet)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('commerce-and-ml.structlet');
  await guide.close();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles((await download.path())!);
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(16);

  await act(page, 'tb-lang-ko');
  const koreanGuide = await openManual(page);
  const korean = koreanGuide.getByRole('main', { name: '사용 매뉴얼' });
  await expect(korean.getByRole('radio', { name: '기본 예제' })).toBeVisible();
  await korean.getByRole('radio', { name: '복잡한 예제' }).click();
  const preview = korean.getByRole('img', { name: '쇼핑몰·ML 플랫폼의 전체 구성도를 격자로 자동 배치한 상세 화면' });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute('src', /manual-layout-ko/);
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1080);
  await expect(korean.getByRole('button', { name: '극지 관측망 다운로드 (.structlet)' })).toBeVisible();
  await korean.getByRole('radio', { name: 'NVIDIA 예제' }).click();
  await expect(korean.getByRole('img').first()).toHaveAttribute('src', /manual-training-ko/);
  await expect(korean.getByRole('button', { name: 'MIG 추론 (.structlet)' })).toBeVisible();
});

test('canvas folds keep nested state, preserve the file, and are shared by exports and isometric view', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles(samplePath);
  const area = page.getByTestId('fold-area-ml');
  const inner = page.getByTestId('fold-area-ml-gpu');
  await inner.press('Enter');
  await expect(inner).toHaveAttribute('aria-expanded', 'false');
  await area.click();
  await expect(inner).toHaveCount(0);
  await expect(page.getByTestId('node-ml')).toBeVisible();
  await area.click();
  await expect(inner).toHaveAttribute('aria-expanded', 'false');

  await diagram(page, 'fold-top');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(5);
  await expect(page.getByTestId('minimap').locator('rect')).toHaveCount(6);
  await expect(page.locator('.diagram')).toContainText('HTTPS × 2');
  await page.getByTestId('node-data').locator('rect').first().click();
  await expect(page.getByTestId('announcer')).toContainText('Data platform');
  const tile = page.getByTestId('node-ml').locator('rect').first();
  const originalX = await tile.getAttribute('x');
  await diagram(page, 'layout-summary-grid');
  await expect(tile).not.toHaveAttribute('x', originalX!);
  await page.reload();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(5);
  await expect(tile).not.toHaveAttribute('x', originalX!);
  await diagram(page, 'layout-summary-reset');
  await expect(tile).toHaveAttribute('x', originalX!);
  await diagram(page, 'layout-summary-flow');

  const route = await page.locator('.diagram path[data-edge="gateway-to-checkout"]').getAttribute('d');
  const [svg] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  const svgText = readFileSync((await svg.path())!, 'utf8');
  expect(svgText).toContain('HTTPS × 2');
  expect(svgText).toContain(`d="${route}"`);
  expect(svgText).not.toContain('data-node="mig-a"');
  const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG');

  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  await expect(page.getByTestId('isometric').locator('[data-node="ml"]')).toBeVisible();
  await expect(page.getByTestId('isometric').locator('[data-node="mig-a"]')).toHaveCount(0);
  await page.locator('[data-testid="tb-view"] [data-value="2d"]').click();
  const [save] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  expect(JSON.parse(readFileSync((await save.path())!, 'utf8'))).toEqual(JSON.parse(readFileSync(samplePath, 'utf8')));

  await diagram(page, 'layout-document-grid');
  await expect(page.getByTestId('node-mig-a')).toBeVisible();
  const node = page.getByTestId('node-mig-a').locator('rect').first();
  const oldX = 1060 + 25 + 27;
  await expect(node).not.toHaveAttribute('x', String(oldX));
  await page.getByTestId('tb-undo').click();
  await expect(node).toHaveAttribute('x', String(oldX));
});
