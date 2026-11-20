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

/** Menu that holds each toolbar action in the redesigned top bar. */
const MENU: Record<string, string> = {
  'tb-new': 'menu-file', 'tb-open': 'menu-file', 'tb-import': 'menu-file', 'tb-save': 'menu-file', 'tb-save-as': 'menu-file', 'tb-sample': 'menu-file',
  'tb-svg': 'menu-export', 'tb-png': 'menu-export',
  'tb-icon-packs': 'menu-settings', 'tb-theme-dark': 'menu-settings', 'tb-theme-light': 'menu-settings', 'tb-theme-system': 'menu-settings', 'tb-lang-ko': 'menu-settings', 'tb-lang-en': 'menu-settings',
};

/** Clicks a toolbar action, opening its menu first. */
export async function act(page: Page, id: string) {
  const menu = MENU[id];
  if (menu) await page.getByTestId(menu).click();
  await page.getByTestId(id).click();
}

export async function openSample(page: Page) {
  await act(page, 'tb-sample');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);
}
