import { expect, type Page } from '@playwright/test';

export async function freshApp(page: Page, language: 'ko' | 'en' = 'en') {
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('structlet:language', l);
  }, language);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
}

export async function center(page: Page, testId: string) {
  const box = await page.getByTestId(testId).locator('rect').first().boundingBox();
  if (!box) throw new Error(`no box for ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export async function nodeIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="node-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(5)));
}

export async function openSample(page: Page) {
  await page.getByTestId('tb-sample').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);
}
