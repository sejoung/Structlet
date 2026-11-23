import { expect, test, type Page } from '@playwright/test';
import { act, freshApp, openManual, openSample } from './helpers';

async function mockTag(page: Page) {
  const loads: string[] = [];
  await page.context().route('https://www.googletagmanager.com/**', (route) => {
    loads.push(route.request().url());
    return route.fulfill({ contentType: 'application/javascript', body: 'window.__tagLoaded = true; window.dataLayer.push({ event: "gtm.js" });' });
  });
  return loads;
}
type TagEntry = { readonly [index: number]: unknown; readonly event?: string };

const sentEvents = (page: Page) => page.evaluate(() => {
  const entries = (window as Window & { dataLayer?: TagEntry[] }).dataLayer ?? [];
  return entries.flatMap((entry) => entry?.[0] === 'event' && typeof entry[1] === 'string' ? [entry[1]] : []);
});

test.describe('usage statistics (build with a measurement id)', () => {
  test.use({ baseURL: 'http://127.0.0.1:5185' });

  test('nothing loads until the user allows it; then listed events are sent', async ({ page }) => {
    const loads = await mockTag(page);
    await freshApp(page);
    await expect(page.getByTestId('consent')).toBeVisible();
    await openSample(page);
    expect(loads).toEqual([]);
    expect(await sentEvents(page)).toEqual([]);

    await page.getByTestId('consent-accept').click();
    await expect(page.getByTestId('consent')).toHaveCount(0);
    await expect.poll(() => loads.length).toBe(1);
    expect(loads[0]).toContain('id=G-E2ETEST01');
    const guide = await openManual(page);
    await expect.poll(() => guide.evaluate(() => (window as Window & { __tagLoaded?: boolean }).__tagLoaded)).toBe(true);
    expect(loads).toHaveLength(2);
    const manual = guide.getByRole('main', { name: 'User guide' });
    const [sample] = await Promise.all([guide.waitForEvent('download'), manual.getByRole('button', { name: 'Download sample (.structlet)' }).click()]);
    expect(sample.suggestedFilename()).toBe('three-tier.structlet');
    await expect.poll(() => sentEvents(guide)).toContain('sample_downloaded');
    await guide.close();
    const [download] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
    void download;
    await expect.poll(() => sentEvents(page)).toContain('image_exported');
    const address = await page.evaluate(() => {
      const entries = (window as Window & { dataLayer?: TagEntry[] }).dataLayer ?? [];
      const config = entries.find((entry) => entry?.[0] === 'config');
      return (config?.[2] as { page_location?: string } | undefined)?.page_location;
    });
    expect(address).toBe('http://127.0.0.1:5185/');

    await act(page, 'tb-usage-stats');
    await page.reload();
    await expect(page.getByTestId('consent')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('structlet.usage-stats'))).toBe('denied');
  });

  test('declining sends nothing and does not ask again', async ({ page }) => {
    const loads = await mockTag(page);
    await freshApp(page);
    await page.getByTestId('consent-decline').click();
    await openSample(page);
    await page.reload();
    await expect(page.getByTestId('consent')).toHaveCount(0);
    expect(loads).toEqual([]);
  });
});

test('the production build runs under its content security policy without violations', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await freshApp(page);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain('googletagmanager');
  await openSample(page);
  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  await page.locator('[data-testid="tb-view"] [data-value="2d"]').click();
  const [png] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-png')]);
  void png;
  const [c] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await c.setFiles('tests/unit/adapters/fixtures/k8s.yaml');
  await expect(page.locator('[data-testid="node-k8s-shop-deployment-api"]')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
});
