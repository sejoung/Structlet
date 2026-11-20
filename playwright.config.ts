import { defineConfig, devices } from '@playwright/test';

/** Public test values enable the Drive UI; Google itself is mocked in the tests. */
const DRIVE_ENV = { VITE_GOOGLE_CLIENT_ID: 'e2e-client', VITE_GOOGLE_API_KEY: 'e2e-key', VITE_GOOGLE_APP_ID: 'e2e-app' };
const build = (dir: string, port: number) =>
  `npx vite build --outDir ${dir} --emptyOutDir --logLevel warn && npx vite preview --outDir ${dir} --port ${port} --strictPort --host 127.0.0.1`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5184', viewport: { width: 1440, height: 900 }, acceptDownloads: true, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    // The production bundle with its Content Security Policy, as deployed. Overrides any
    // measurement ID in .env.local: these tests never reach Analytics.
    { command: build('.e2e/app', 5184), url: 'http://127.0.0.1:5184', reuseExistingServer: false, timeout: 60_000, env: { ...DRIVE_ENV, VITE_GA_MEASUREMENT_ID: '' } },
    // The same with a test measurement ID, for the consent and statistics tests; Google is mocked.
    { command: build('.e2e/analytics', 5185), url: 'http://127.0.0.1:5185', reuseExistingServer: false, timeout: 60_000, env: { ...DRIVE_ENV, VITE_GA_MEASUREMENT_ID: 'G-E2ETEST01' } },
  ],
});
