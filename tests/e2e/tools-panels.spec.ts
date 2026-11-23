import { expect, test } from '@playwright/test';
import { act, center, drag, freshApp, openSample } from './helpers';

const transform = (page: import('@playwright/test').Page) => page.locator('.canvas-svg > g').first().getAttribute('transform');
const saved = async (page: import('@playwright/test').Page) => {
  await page.waitForTimeout(500);
  return page.evaluate(() => JSON.parse(localStorage.getItem('structlet:autosave:v1') ?? 'null'));
};

test('checks stay accessible and bring affected objects into view in 2D and isometric', async ({ page }) => {
  await freshApp(page, 'ko');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await picker.setFiles({ name: 'checks.draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    nodes: [
      { id: 'relay', service: 'server', label: '관측 중계기', x: 40, y: 40 },
      { id: 'public', service: 'internet', label: '외부 인터넷', x: 1300, y: 260 },
      { id: 'data', service: 'database', label: '관측 저장소', x: 1600, y: 260 },
    ],
    edges: [{ from: 'public', to: 'data' }],
  })) });
  await expect(page.getByTestId('node-relay')).toBeVisible();
  await page.getByTestId('tb-fit').click();
  await page.getByTestId('node-relay').locator('rect').first().click();
  const properties = page.getByRole('radio', { name: '속성' });
  const checks = page.getByRole('radio', { name: '점검 (2)' });
  const findings = page.getByTestId('checks');
  await expect(page.getByTestId('prop-label')).toHaveValue('관측 중계기');
  await checks.click();
  await expect(findings).toContainText('연결이 없는 서비스');
  await expect(findings).toContainText('클라이언트·외부 시스템이 데이터 저장소에 직접 연결됨');
  await properties.click();
  await expect(page.getByTestId('prop-label')).toHaveValue('관측 중계기');

  await checks.click();
  const initial = await transform(page);
  await findings.getByRole('button', { name: /연결이 없는 서비스/ }).click();
  await expect(properties).toHaveAttribute('aria-checked', 'true');
  await expect(properties).toBeFocused();
  await expect(page.getByTestId('prop-label')).toHaveValue('관측 중계기');
  await expect.poll(() => transform(page)).not.toBe(initial);
  const camera = await transform(page);
  const viewport = (await page.getByTestId('canvas').boundingBox())!;
  const visibleNodes = async (ids: string[]) => Promise.all(ids.map(async (id) => {
    const bounds = (await page.locator(`.diagram [data-node="${id}"]`).boundingBox())!;
    return bounds.x >= viewport.x && bounds.x + bounds.width <= viewport.x + viewport.width &&
      bounds.y >= viewport.y && bounds.y + bounds.height <= viewport.y + viewport.height;
  }));
  expect(await visibleNodes(['relay', 'public'])).toEqual([true, false]);

  await checks.click();
  await findings.getByRole('button', { name: /데이터 저장소에 직접 연결됨/ }).click();
  await expect(properties).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.inspector-title strong')).toContainText('3');
  await expect.poll(() => transform(page)).not.toBe(camera);
  expect(await visibleNodes(['public', 'data'])).toEqual([true, true]);

  await checks.click();
  await expect(findings).toBeVisible();
  await page.getByTestId('tb-view').locator('[data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  const isoTransform = iso.locator(':scope > g').first();
  await expect(isoTransform).toHaveAttribute('transform', /scale/);
  const isoBefore = await isoTransform.getAttribute('transform');
  await findings.getByRole('button', { name: /연결이 없는 서비스/ }).click();
  await expect(isoTransform).not.toHaveAttribute('transform', isoBefore!);
  const isoCanvas = (await iso.boundingBox())!;
  const target = (await iso.locator('[data-node="relay"]').boundingBox())!;
  expect(Math.abs(target.x + target.width / 2 - isoCanvas.x - isoCanvas.width / 2)).toBeLessThan(80);
  expect(Math.abs(target.y + target.height / 2 - isoCanvas.y - isoCanvas.height / 2)).toBeLessThan(80);
});

test('panels fold away and come back, and the choice is remembered', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.getByTestId('rail-services').click();
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await page.getByTestId('rail-layers').click();
  await expect(page.getByTestId('layers')).toBeVisible();
  await page.getByTestId('toggle-right').click();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('toggle-right').click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('toggle-left').click();
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await page.getByTestId('toggle-left').click();
  await expect(page.locator('#sidebar-panel')).toBeVisible();
  await page.locator('body').press('ControlOrMeta+Backslash');
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.locator('body').press('ControlOrMeta+Backslash');
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('#sidebar-panel')).toBeVisible();
});

test('hand tool only moves the view', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const before = await saved(page);
  await page.keyboard.press('h');
  await expect(page.getByTestId('tool-hand')).toHaveAttribute('aria-pressed', 'true');
  const t0 = await transform(page);
  const api = await center(page, 'node-api');
  await drag(page, api, { x: api.x + 120, y: api.y + 60 });
  expect(await transform(page)).not.toBe(t0);
  const after = await saved(page);
  expect(after.nodes).toEqual(before.nodes);
  expect(await page.locator('.sel-outline').count()).toBe(0);
  await page.mouse.dblclick(api.x + 120, api.y + 60);
  await expect(page.locator('.inline-editor')).toHaveCount(0);
  await page.getByTestId('tool-select').click();
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
});

test('connect tool draws lines from box to box until Esc', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const count = (await saved(page)).edges.length;
  await page.getByTestId('tool-connect').click();
  await expect(page.getByRole('status').filter({ hasText: 'Drag from one box' })).toBeVisible();
  await drag(page, await center(page, 'node-auth'), await center(page, 'node-db'));
  await drag(page, await center(page, 'node-mail'), await center(page, 'node-payment'));
  const after = await saved(page);
  expect(after.edges).toHaveLength(count + 2);
  expect(after.edges.at(-2)).toMatchObject({ source: { objectId: 'auth' }, target: { objectId: 'db' } });
  const t0 = await transform(page);
  await drag(page, { x: 700, y: 820 }, { x: 760, y: 840 });
  expect(await transform(page)).not.toBe(t0);
  expect((await saved(page)).edges).toHaveLength(count + 2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
});

test('view mode hides panels and editing, Esc returns', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  await page.locator('[data-testid="node-api"] rect').first().click();
  await page.locator('body').press('ControlOrMeta+Period');
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await expect(page.getByTestId('tools')).toHaveCount(0);
  await expect(page.locator('.sel-outline')).toHaveCount(0);
  const t0 = await transform(page);
  const api = await center(page, 'node-api');
  await drag(page, api, { x: api.x - 100, y: api.y });
  expect(await transform(page)).not.toBe(t0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.getByTestId('tools')).toBeVisible();
  await page.getByTestId('tb-present').click();
  await page.getByTestId('exit-present').click();
  await expect(page.getByTestId('tools')).toBeVisible();
});

test('⌘\\ hides both panels; the canvas takes all of the space and the diagram stays centered', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const canvasBox = async () => (await page.locator('.canvas').boundingBox())!;
  const offset = async () => {
    const c = await canvasBox();
    const n = await center(page, 'node-api');
    return { x: n.x - (c.x + c.width / 2), y: n.y - (c.y + c.height / 2) };
  };
  const before = await offset();

  await page.locator('body').press('ControlOrMeta+Backslash');
  await expect(page.locator('#sidebar-panel')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.getByTestId('toggle-left')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-pressed', 'false');
  const c = await canvasBox();
  expect(Math.round(c.x + c.width)).toBe(page.viewportSize()!.width);
  const after = await offset();
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);

  await page.locator('body').press('ControlOrMeta+Backslash');
  await expect(page.locator('#sidebar-panel')).toBeVisible();
  await expect(page.locator('.inspector')).toBeVisible();
  const back = await offset();
  expect(Math.abs(back.x - before.x)).toBeLessThan(2);
});

test('panel toggles keep their place in every state', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const ids = ['toggle-left', 'toggle-right', 'tb-present', 'tb-help', 'menu-settings', 'menu-export'];
  const where = async () => Promise.all(ids.map(async (id) => Math.round((await page.getByTestId(id).boundingBox())!.x)));
  const start = await where();
  const steps = [
    () => page.getByTestId('toggle-right').click(),
    () => page.getByTestId('toggle-left').click(),
    () => page.getByTestId('toggle-right').click(),
    () => page.locator('body').press('ControlOrMeta+Backslash'),
    () => page.locator('body').press('ControlOrMeta+Backslash'),
  ];
  for (const step of steps) {
    await step();
    expect(await where()).toEqual(start);
  }
});

test('the save status sits right after the title and follows its length', async ({ page }) => {
  await freshApp(page);
  await openSample(page);
  const title = page.locator('.title-input');
  const status = page.getByTestId('save-status');
  const gap = async () => (await status.boundingBox())!.x - ((await title.boundingBox())!.x + (await title.boundingBox())!.width);
  expect(await gap()).toBeLessThan(12);
  const wide = (await title.boundingBox())!.width;
  await title.fill('API');
  await expect.poll(async () => (await title.boundingBox())!.width).toBeLessThan(wide);
  expect(await gap()).toBeLessThan(12);
});

test('the inspector starts folded, opens with I, and its toggle counts check findings', async ({ page }) => {
  await freshApp(page, 'en', { inspector: false });
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('findings-badge')).toHaveCount(0);

  const search = page.getByLabel('Search services');
  await search.fill('server');
  await page.locator('[data-service="server"]').click();
  await search.fill('database');
  await page.locator('[data-service="database"]').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('findings-badge')).toHaveText('2');
  await expect(page.getByTestId('toggle-right')).toHaveAttribute('aria-label', /2 check findings/);

  await page.locator('body').press('i');
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.getByTestId('checks')).toContainText('Service without connections');
  await expect(page.getByTestId('findings-badge')).toHaveCount(0);
  await page.locator('body').press('i');
  await expect(page.locator('.inspector')).toHaveCount(0);

  await page.locator('body').press('i');
  await search.fill('i');
  await expect(page.locator('.inspector')).toBeVisible();
});
