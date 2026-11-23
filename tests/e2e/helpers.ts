import { expect, type Page } from '@playwright/test';

/**
 * A first visit, except that the inspector starts open: most tests edit through it.
 * Pass `{ inspector: false }` for the real first-visit layout (inspector folded).
 */
export async function freshApp(page: Page, language: 'ko' | 'en' = 'en', { inspector = true }: { inspector?: boolean } = {}) {
  await page.goto('/');
  await page.evaluate(([l, open]) => {
    localStorage.clear();
    localStorage.setItem('structlet:language', l);
    if (open) localStorage.setItem('structlet:panels', JSON.stringify({ left: true, right: true }));
  }, [language, inspector] as const);
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
  'tb-new': 'menu-file', 'tb-open': 'menu-file', 'tb-import': 'menu-file', 'tb-save': 'menu-file', 'tb-save-as': 'menu-file',
  'tb-svg': 'menu-export', 'tb-png': 'menu-export',
  'tb-icon-packs': 'menu-settings', 'tb-theme-dark': 'menu-settings', 'tb-theme-light': 'menu-settings', 'tb-theme-system': 'menu-settings', 'tb-lang-ko': 'menu-settings', 'tb-lang-en': 'menu-settings', 'tb-usage-stats': 'menu-settings',
};

/** Clicks a toolbar action, opening its menu first. */
export async function act(page: Page, id: string) {
  if (id.startsWith('menu-')) return page.getByTestId(id).click();
  const menu = MENU[id];
  if (menu) await page.getByTestId(menu).click();
  await page.getByTestId(id).click();
}

export async function openSample(page: Page) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await chooser.setFiles('samples/three-tier.structlet');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);
}

/** Open Help in a fresh tab, leaving the editor page available. */
export async function openManual(page: Page) {
  const [guide] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('tb-help').click()]);
  await expect(guide.getByRole('main')).toBeVisible();
  return guide;
}
