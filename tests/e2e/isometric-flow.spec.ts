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

async function freezeClock(page: Page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
}

test('flow starts from the top without picking a service and loops until stopped', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const iso = await openIsometric(page, 'commerce-and-ml', 'ko');
  await freezeClock(page);
  const launch = page.getByRole('button', { name: '흐름 재생', exact: true });
  const player = page.getByRole('group', { name: '흐름 재생' });
  await expect(launch).toBeVisible();
  await expect(player.getByRole('status')).toHaveCount(0);
  await launch.click();
  const first = iso.locator('[data-flow-edge="shopper-to-cdn"]');
  await expect(player.getByRole('status')).toHaveText('7단계 중 1단계');
  await expect(first).toBeVisible();
  await expect(first).toHaveCSS('stroke', 'rgb(211, 61, 0)');
  await expect(first).toHaveCSS('stroke-width', '5px');
  await expect(iso.locator('[data-edge="fraud-to-mig-a"]')).toHaveCSS('opacity', '0.44');
  await expect(iso.locator('[data-flow-dot="shopper-to-cdn"]')).toHaveCSS('fill', 'rgb(255, 220, 86)');
  await page.clock.runFor(5900);
  await expect(player.getByRole('status')).toHaveText('7단계 중 7단계');
  await page.clock.runFor(900);
  await expect(player.getByRole('status')).toHaveText('7단계 중 1단계');
  await expect(first).toBeVisible();
  await page.clock.runFor(6650);
  await expect(first).toBeVisible();
  await expect(player.getByRole('button', { name: '일시정지' })).toBeVisible();
  await player.getByRole('button', { name: '정지', exact: true }).click();
  await page.clock.runFor(7000);
  await expect(launch).toBeFocused();
  await expect(iso.locator('[data-flow-edge]')).toHaveCount(0);
  await expect(iso.locator('[data-edge="fraud-to-mig-a"]')).toHaveCSS('opacity', '1');
  await launch.click();
  await expect(first).toBeVisible();
});

test('isometric flow plays and pauses on the drawn routes, advances a branch, and stops without changing the file', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const iso = await openIsometric(page, 'commerce-and-ml');
  const before = await downloadText(page, 'tb-save');
  await freezeClock(page);
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
  await page.clock.runFor(230);
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
  await page.clock.runFor(1250);
  await expect(player.getByRole('status')).toHaveText('Step 4 of 4');
  await page.clock.runFor(800);
  await expect(player.getByRole('status')).toHaveText('Step 1 of 4');
  await player.getByRole('button', { name: 'Stop' }).click();
  await expect(player.getByRole('status')).toHaveCount(0);
  await expect(iso.locator('[data-flow-edge]')).toHaveCount(0);
});

test('isometric flow follows folded groups and loops manually with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const iso = await openIsometric(page, 'commerce-and-ml');
  await freezeClock(page);
  await iso.locator('[data-iso-label="node"][data-iso-object="checkout"] text').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Play flow from here' }).click();
  const player = page.getByRole('group', { name: 'Flow playback' });
  await expect(iso.locator('[data-flow-dot]')).toHaveCount(0);
  await page.clock.runFor(1100);
  await expect(player.getByRole('status')).toHaveText('Step 2 of 4');
  await player.getByRole('button', { name: 'Pause' }).click();

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
  await expect(iso.locator('[data-flow-object="alerts"]')).toHaveAttribute('data-flow-state', 'arrived');
  await step.click();
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
  await expect(iso.locator('[data-flow-kind="undirected"]')).toHaveAttribute('stroke-dasharray', '10 7');
  await expect(iso.locator('[data-flow-kind="undirected"]')).not.toHaveAttribute('marker-end', /.+/);
  await expect(player.getByRole('button', { name: '일시정지' })).toBeVisible();
  await expect(iso.locator('[data-flow-state="arrived"]')).toHaveCount(0);
});

test('dragging in orbit mode rotates through 360 degrees with upright labels and shared flow and export geometry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const iso = await openIsometric(page, 'commerce-and-ml');
  await freezeClock(page);
  await page.getByRole('button', { name: 'Play flow', exact: true }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  const orbit = page.getByRole('button', { name: 'Orbit view' });
  const original = iso.locator('[data-edge="shopper-to-cdn"]');
  const line = iso.locator('[data-flow-edge="shopper-to-cdn"]');
  const before = await line.getAttribute('d');
  await orbit.click();
  await expect(orbit).toHaveAttribute('aria-pressed', 'true');
  const box = (await iso.boundingBox())!;
  const from = { x: box.x + 100, y: box.y + box.height / 2 };
  await drag(page, from, { x: from.x + 92, y: from.y + 12 });
  await expect(iso).toHaveAttribute('data-rotation', '37');
  await expect(line).not.toHaveAttribute('d', before!);

  const aligned = await original.evaluate((edge: SVGPathElement) => {
    const svg = edge.closest('svg')!;
    const overlay = svg.querySelector<SVGPathElement>('[data-flow-edge="shopper-to-cdn"]')!;
    const label = svg.querySelector<SVGTextElement>('[data-iso-label="node"] text')!;
    const matrix = overlay.getCTM()!.inverse().multiply(edge.getCTM()!);
    const source = edge.getPointAtLength(0).matrixTransform(matrix);
    const start = overlay.getPointAtLength(0);
    const { b, c } = label.getCTM()!;
    return Math.hypot(source.x - start.x, source.y - start.y) < 0.02 && b === 0 && c === 0;
  });
  expect(aligned).toBe(true);
  const diagram = iso.locator(':scope > g');
  const transform = await diagram.getAttribute('transform');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 450, from.y, { steps: 6 });
  await expect(iso).toHaveAttribute('data-rotation', '217');
  await page.mouse.move(from.x + 900, from.y, { steps: 6 });
  await page.mouse.up();
  await expect(iso).toHaveAttribute('data-rotation', '37');
  await expect(diagram).toHaveAttribute('transform', transform!);
  const svg = await downloadText(page, 'tb-svg');
  const label = iso.locator('[data-iso-label="node"][data-iso-object="checkout"] rect');
  const x = await label.getAttribute('x');
  const y = await label.getAttribute('y');
  expect(svg).toContain('rotate(37)');
  expect(svg).toContain(`<g data-iso-label="node" data-iso-object="checkout"><rect x="${x}" y="${y}"`);

  await iso.press('Home');
  await expect(iso).toHaveAttribute('data-rotation', '0');
  await iso.press('ArrowLeft');
  await expect(iso).toHaveAttribute('data-rotation', '355');
  await iso.press('Escape');
  await expect(orbit).toBeFocused();
  await expect(orbit).toHaveAttribute('aria-pressed', 'false');
  await drag(page, from, { x: from.x + 60, y: from.y });
  await expect(iso).toHaveAttribute('data-rotation', '355');
});
