import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { act, drag, freshApp } from './helpers';

async function openIsometric(page: Page, name: string, locale: 'en' | 'ko' = 'en') {
  await freshApp(page, locale, { inspector: false });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await picker.setFiles(`samples/${name}.structlet`);
  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  return page.getByTestId('isometric');
}

async function downloadText(page: Page, action: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), act(page, action)]);
  return readFileSync((await file.path())!, 'utf8');
}

test('the visible flow button picks an isometric source and can be cancelled without starting playback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const iso = await openIsometric(page, 'commerce-and-ml', 'ko');
  const launch = page.getByRole('button', { name: '흐름 재생', exact: true });
  const player = page.getByRole('group', { name: '흐름 재생' });
  const hint = page.getByText('흐름을 시작할 서비스나 그룹을 클릭하세요.', { exact: false });
  const checkout = iso.locator('[data-iso-label="node"][data-iso-object="checkout"] text').first();
  await expect(launch).toBeVisible();
  await expect(player).toHaveCount(0);
  await launch.click();
  await expect(launch).toHaveAttribute('aria-pressed', 'true');
  await expect(hint).toBeVisible();
  await iso.press('Escape');
  await expect(launch).toBeFocused();
  await expect(hint).toHaveCount(0);
  await checkout.click();
  await expect(player).toHaveCount(0);

  await launch.click();
  await iso.locator('[data-iso-label="node"][data-iso-object="alerts"] text').first().click();
  await expect(hint).toBeVisible();
  await expect(player).toHaveCount(0);
  const box = (await checkout.boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, from, { x: from.x + 45, y: from.y - 25 });
  await expect(player).toHaveCount(0);
  await checkout.click();
  await expect(launch).toHaveAttribute('aria-pressed', 'false');
  await expect(hint).toHaveCount(0);
  await expect(player.getByRole('status')).toHaveText('4단계 중 1단계');
  await expect(iso.locator('[data-flow-edge="checkout-to-fraud"]')).toBeVisible();
});

test('isometric flow plays and pauses on the drawn routes, advances a branch, and stops without changing the file', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const iso = await openIsometric(page, 'commerce-and-ml');
  const before = await downloadText(page, 'tb-save');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await iso.locator('[data-iso-label="node"][data-iso-object="checkout"] text').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Play flow from here' }).click();

  const player = page.getByRole('group', { name: 'Flow playback' });
  await expect(player.getByRole('status')).toHaveText('Step 1 of 4');
  await expect(iso.locator('[data-flow-dot]')).toHaveCount(3);
  const dot = iso.locator('[data-flow-dot="checkout-to-fraud"]');
  const start = await dot.getAttribute('cx');
  await page.clock.runFor(400);
  await expect(dot).not.toHaveAttribute('cx', start!);
  await player.getByRole('button', { name: 'Pause' }).click();
  const paused = await dot.getAttribute('cx');
  await page.clock.runFor(1500);
  await expect(dot).toHaveAttribute('cx', paused!);
  await player.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(200);
  await expect(dot).not.toHaveAttribute('cx', paused!);
  await player.getByRole('button', { name: 'Pause' }).click();

  const line = iso.locator('[data-flow-edge="checkout-to-fraud"]');
  const oldPath = await line.getAttribute('d');
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await expect(line).not.toHaveAttribute('d', oldPath!);
  await expect(player.getByRole('status')).toHaveText('Step 1 of 4');
  const endpoints = await line.evaluate((overlay: SVGPathElement) => {
    const original = overlay.closest('svg')!.querySelector<SVGPathElement>('[data-edge="checkout-to-fraud"]')!;
    const matrix = overlay.getCTM()!.inverse().multiply(original.getCTM()!);
    return [true, false].map((start) => {
      const point = original.getPointAtLength(start ? 0 : original.getTotalLength()).matrixTransform(matrix);
      const projected = overlay.getPointAtLength(start ? 0 : overlay.getTotalLength());
      return Math.hypot(point.x - projected.x, point.y - projected.y);
    });
  });
  expect(endpoints.every((distance) => distance < 0.02)).toBe(true);

  const step = player.getByRole('button', { name: 'Next step' });
  await step.click();
  await expect(iso.locator('[data-flow-object="fraud"]')).toHaveAttribute('data-flow-state', 'arrived');
  await step.click();
  await expect(player.getByRole('status')).toHaveText('Step 2 of 4');
  await expect(iso.locator('[data-flow-edge="fraud-to-mig-a"]')).toHaveCount(1);
  await expect(iso.locator('[data-flow-edge="orders-queue-to-worker"]')).toHaveCount(1);

  const svg = await downloadText(page, 'tb-svg');
  expect(svg).toContain('rotate(90)');
  expect(svg).not.toContain('data-flow-');
  expect(await downloadText(page, 'tb-save')).toBe(before);
  await player.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(3000);
  await expect(player.getByRole('status')).toHaveText('Step 4 of 4');
  await expect(player.getByRole('button', { name: 'Replay' })).toBeVisible();
  await player.getByRole('button', { name: 'Stop' }).click();
  await expect(player).toHaveCount(0);
  await expect(iso.locator('[data-flow-edge]')).toHaveCount(0);
});

test('isometric flow follows folded groups and completes with replay and reduced motion controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const iso = await openIsometric(page, 'commerce-and-ml');
  await iso.locator('[data-iso-label="node"][data-iso-object="checkout"] text').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Play flow from here' }).click();
  const player = page.getByRole('group', { name: 'Flow playback' });
  await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(iso.locator('[data-flow-dot]')).toHaveCount(0);

  await iso.locator('[data-iso-label="area"][data-iso-object="app-api"] text').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Collapse Public APIs' }).click();
  await expect(iso.locator('[data-flow-object="checkout"]')).toHaveCount(0);
  await expect(iso.locator('[data-flow-object="app-api"]')).toHaveCount(1);
  await expect(iso.locator('[data-flow-edge="checkout-to-fraud"]')).toHaveCount(1);
  const step = player.getByRole('button', { name: 'Next step' });
  await step.click();
  await step.click();
  await step.click();
  await step.click();
  await expect(player.getByRole('status')).toHaveText('Step 4 of 4');
  await expect(step).toBeDisabled();
  await expect(iso.locator('[data-flow-object="alerts"]')).toHaveAttribute('data-flow-state', 'arrived');
  await player.getByRole('button', { name: 'Replay' }).click();
  await expect(player.getByRole('status')).toHaveText('Step 1 of 4');
  await expect(iso.locator('[data-flow-dot]')).toHaveCount(0);
  await page.locator('[data-testid="tb-view"] [data-value="2d"]').click();
  await expect(player).toHaveCount(0);
});

test('the Korean NVLink playback emphasizes only the undirected link', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const iso = await openIsometric(page, 'gpu-training', 'ko');
  await iso.locator('[data-iso-label="node"][data-iso-object="host-1-gpu-a"] text').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '여기서 흐름 재생' }).click();
  const player = page.getByRole('group', { name: '흐름 재생' });
  await expect(player.getByRole('status')).toHaveText('1단계 중 1단계');
  await expect(iso.locator('[data-flow-edge]')).toHaveCount(1);
  await expect(iso.locator('[data-flow-edge="host-1-gpu-a-to-host-1-nvlink"]')).toHaveAttribute('data-flow-kind', 'undirected');
  await expect(iso.locator('[data-flow-dot]')).toHaveCount(0);
  await expect(player.getByRole('button', { name: '다시 재생' })).toBeVisible();
  await expect(iso.locator('[data-flow-state="arrived"]')).toHaveCount(0);
});
