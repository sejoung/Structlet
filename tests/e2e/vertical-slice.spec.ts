import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { center, drag, freshApp, nodeIds } from './helpers';

test('two nodes → connect → save → reopen → SVG export', async ({ page }) => {
  await freshApp(page);
  await expect(page.getByText('Start your architecture diagram')).toBeVisible();

  // Add two services from the palette search.
  const search = page.getByLabel('Search services');
  await search.fill('server');
  await page.locator('[data-service="server"]').click();
  await search.fill('database');
  await page.locator('[data-service="database"]').click();
  const [a, b] = await nodeIds(page);
  expect(a && b).toBeTruthy();

  // Move the second node away so the link is long, then connect by dragging from a side handle.
  const pb = await center(page, `node-${b}`);
  await drag(page, pb, { x: pb.x + 160, y: pb.y + 120 });
  const pa = await center(page, `node-${a}`);
  await page.mouse.move(pa.x, pa.y);
  const handle = page.locator(`[data-hit="connect"][data-id="${a}"][data-side="right"]`);
  await expect(handle).toBeVisible();
  const hb = await handle.boundingBox();
  const target = await center(page, `node-${b}`);
  await drag(page, { x: hb!.x + hb!.width / 2, y: hb!.y + hb!.height / 2 }, target);
  await expect(page.locator('.diagram path[data-edge]')).toHaveCount(1);

  // Name the connection from the properties panel.
  await page.getByTestId('prop-label').fill('SQL');
  await expect(page.locator('.diagram')).toContainText('SQL');

  // Save to a .structlet file.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tb-save').click()]);
  expect(download.suggestedFilename()).toMatch(/\.structlet$/);
  const savedPath = await download.path();
  const saved = JSON.parse(readFileSync(savedPath!, 'utf8'));
  expect(saved.format).toBe('structlet');
  expect(saved.nodes).toHaveLength(2);
  expect(saved.edges[0]).toMatchObject({ source: { objectId: a }, target: { objectId: b }, label: 'SQL' });
  const positions = saved.nodes.map((n: { x: number; y: number }) => [n.x, n.y]);

  // Start over, then reopen the saved file.
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('tb-new').click();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(0);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('tb-open').click()]);
  await chooser.setFiles(savedPath!);
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(2);
  expect(await nodeIds(page)).toEqual([a, b]);

  // Reload: autosave restores the same document.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(2);
  await expect(page.locator('.diagram path[data-edge]')).toHaveCount(1);

  // Export SVG with the same path and labels as the canvas.
  const canvasPath = await page.locator('.diagram path[data-edge]').getAttribute('d');
  const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tb-svg').click()]);
  const svg = readFileSync((await svgDownload.path())!, 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain(`d="${canvasPath}"`);
  expect(svg).toContain('SQL');
  expect(svg).toContain('>Server<');

  // Re-saving gives the same positions.
  const [again] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tb-save').click()]);
  const resaved = JSON.parse(readFileSync((await again.path())!, 'utf8'));
  expect(resaved.nodes.map((n: { x: number; y: number }) => [n.x, n.y])).toEqual(positions);
});

test('PNG export produces an image', async ({ page }) => {
  await freshApp(page);
  await page.getByTestId('tb-sample').click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tb-png').click()]);
  const bytes = readFileSync((await png.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(20_000);
});

test('rejects an invalid file without touching the open document', async ({ page }, info) => {
  await freshApp(page);
  await page.getByTestId('tb-sample').click();
  const bad = info.outputPath('bad.structlet');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(bad, JSON.stringify({ format: 'structlet', formatVersion: 1, id: 'x', containers: [{ id: 'a', kind: 'vpc', parentId: 'b', x: 0, y: 0, width: 10, height: 10 }, { id: 'b', kind: 'vpc', parentId: 'a', x: 0, y: 0, width: 10, height: 10 }] }));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('tb-open').click()]);
  await chooser.setFiles(bad);
  await expect(page.getByRole('alert')).toContainText('cycle');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(11);
});
