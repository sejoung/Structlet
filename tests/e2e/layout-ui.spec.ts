import { expect, test } from '@playwright/test';
import { act, freshApp, openSample } from './helpers';

const row = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-layer-id="${id}"]`);

test('layers tree mirrors the hierarchy and edits it', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.getByTestId('rail-layers').click();
  // Nesting: api sits under private subnet under VPC.
  await expect(row(page, 'api')).toHaveAttribute('aria-level', '5');
  await expect(row(page, 'vpc')).toHaveAttribute('aria-level', '3');

  // Selecting on the canvas selects in the tree, and the other way round.
  await page.locator('[data-testid="node-db"] rect').first().click();
  await expect(row(page, 'db')).toHaveAttribute('aria-selected', 'true');
  await row(page, 'cache').click();
  await expect(page.locator('.inspector-title strong')).toHaveText('세션 캐시');

  // Keyboard: arrow down moves the selection, Enter renames.
  await page.getByTestId('layers').focus();
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'db')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await page.locator('.layer-rename').fill('Orders DB (primary)');
  await page.keyboard.press('Enter');
  await expect(row(page, 'db')).toContainText('Orders DB (primary)');

  // Drag a service row onto another area to move it there; one undo puts it back.
  await row(page, 'payment').dragTo(row(page, 'public'));
  await expect(row(page, 'payment')).toHaveAttribute('aria-level', '5');
  await page.locator('body').press('ControlOrMeta+z');
  await expect(row(page, 'payment')).toHaveAttribute('aria-level', '1');

  // Collapsing an area hides its contents.
  await row(page, 'private').locator('.twisty').click();
  await expect(row(page, 'api')).toHaveCount(0);
});

test('recently used services, shortcuts dialog and menus', async ({ page }) => {
  await freshApp(page);
  await expect(page.getByTestId('recent-services')).toHaveCount(0);
  await page.getByLabel('Search services').fill('redis');
  await page.locator('[data-service="cache"]').click();
  await page.getByLabel('Search services').fill('');
  await expect(page.getByTestId('recent-services').locator('[data-service="cache"]')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('recent-services').locator('[data-service="cache"]')).toHaveCount(1);

  await page.getByTestId('tb-shortcuts').click();
  await expect(page.getByTestId('shortcuts')).toContainText('Undo');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcuts')).toHaveCount(0);

  // Menus open from the keyboard and close with Escape.
  await page.getByTestId('menu-file').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await act(page, 'tb-lang-ko');
  await expect(page.getByTestId('rail-services')).toContainText('서비스');
});
