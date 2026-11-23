import { expect, test, type Page } from '@playwright/test';
import { act, freshApp, openSample } from './helpers';

/** Google's tag library, stubbed: it records that it loaded and leaves `dataLayer` to the page. */
async function mockTag(page: Page) {
  const loads: string[] = [];
  await page.route('https://www.googletagmanager.com/**', (route) => {
    loads.push(route.request().url());
    return route.fulfill({ contentType: 'application/javascript', body: 'window.__tagLoaded = true;' });
  });
  return loads;
}
const sentEvents = (page: Page) =>
  page.evaluate(() => ((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? []).map((a) => [...a]).filter((a) => a[0] === 'event').map((a) => a[1] as string));

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
    await page.getByTestId('tb-help').click();
    const manual = page.getByRole('dialog', { name: 'User guide' });
    const [sample] = await Promise.all([page.waitForEvent('download'), manual.getByRole('button', { name: 'Download sample (.structlet)' }).click()]);
    expect(sample.suggestedFilename()).toBe('three-tier.structlet');
    await expect.poll(() => sentEvents(page)).toContain('sample_downloaded');
    await page.keyboard.press('Escape');
    const [download] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
    void download;
    await expect.poll(() => sentEvents(page)).toContain('image_exported');
    // The address sent has no hash or query.
    const config = await page.evaluate(() => ((window as unknown as { dataLayer: IArguments[] }).dataLayer).map((a) => [...a]).find((a) => a[0] === 'config'));
    expect(String((config![2] as { page_location: string }).page_location)).toBe('http://127.0.0.1:5185/');

    // Turning it off in settings stops sending; the choice is remembered.
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
