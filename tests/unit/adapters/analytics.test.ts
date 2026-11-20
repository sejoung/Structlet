// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsConfig } from '../../../src/adapters/analytics/config';
import { CONSENT_KEY, GTAG_URL, MAX_ERROR_EVENTS } from '../../../src/adapters/analytics/google-analytics';
import { usageEvent } from '../../../src/adapters/analytics/usage-events';
import { contentSecurityPolicy } from '../../../scripts/csp';

/** A fresh log and Analytics per test: each page has exactly one of each. */
async function fresh() {
  vi.resetModules();
  const { log } = await import('../../../src/adapters/diagnostics/log');
  const { GoogleAnalytics } = await import('../../../src/adapters/analytics/google-analytics');
  return { log, ga: new GoogleAnalytics('G-TEST1234') };
}

type Tagged = Window & { dataLayer?: IArguments[] };
const scripts = () => [...document.querySelectorAll('script')].map((s) => s.src);
const events = () => ((window as Tagged).dataLayer ?? []).map((a) => [...a]).filter((a) => a[0] === 'event');

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '';
  delete (window as Tagged).dataLayer;
});

describe('usage statistics', () => {
  it('load nothing and send nothing until the user agrees', async () => {
    const { ga, log } = await fresh();
    expect(ga.consent).toBeNull();
    log.info('files.exported', { format: 'svg' });
    expect(scripts()).toEqual([]);
    expect((window as Tagged).dataLayer).toBeUndefined();
    ga.choose('granted');
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    expect(scripts()[0]).toContain(`${GTAG_URL}?id=G-TEST1234`);
    const config = ((window as Tagged).dataLayer ?? []).map((a) => [...a]).find((a) => a[0] === 'config')!;
    expect(config[2]).toMatchObject({ page_title: 'Structlet', allow_google_signals: false });
    expect(String((config[2] as { page_location: string }).page_location)).not.toContain('#');
  });

  it('send listed events with code-word details only, and error names capped', async () => {
    const { ga, log } = await fresh();
    ga.choose('granted');
    log.info('files.exported', { format: 'png', view: '2d' });
    log.info('files.imported', { source: 'my secret text with spaces' });
    log.info('layers.renamed', { label: 'Orders DB' });
    for (let i = 0; i < MAX_ERROR_EVENTS + 5; i++) log.error('drive.failed', { message: 'user text' });
    const sent = events();
    expect(sent[0]).toEqual(['event', 'image_exported', { format: 'png', view: '2d' }]);
    expect(sent[1]).toEqual(['event', 'diagram_imported', {}]);
    expect(sent.filter((e) => e[1] === 'app_error')).toHaveLength(MAX_ERROR_EVENTS);
    expect(JSON.stringify(sent)).not.toContain('user text');
    expect(JSON.stringify(sent)).not.toContain('Orders DB');
  });

  it('stop and remove cookies when declined', async () => {
    const { ga, log } = await fresh();
    ga.choose('granted');
    document.cookie = '_ga=1; path=/';
    ga.choose('denied');
    expect(document.cookie).not.toContain('_ga=');
    expect((window as unknown as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(true);
    log.info('files.new');
    expect(events().some((e) => e[1] === 'diagram_created')).toBe(false);
  });

  it('are built only in production with a measurement id', () => {
    expect(analyticsConfig({ PROD: true, VITE_GA_MEASUREMENT_ID: 'G-ABC12345' })).toEqual({ measurementId: 'G-ABC12345' });
    expect(analyticsConfig({ PROD: false, VITE_GA_MEASUREMENT_ID: 'G-ABC12345' })).toBeNull();
    expect(analyticsConfig({ PROD: true, VITE_GA_MEASUREMENT_ID: 'UA-1' })).toBeNull();
    expect(usageEvent({ at: 0, level: 'info', event: 'unknown', details: {} })).toBeNull();
  });

  it('open the content security policy only for what the build uses', () => {
    const plain = contentSecurityPolicy({ drive: false, analytics: false });
    expect(plain).toContain("script-src 'self';");
    expect(plain).toContain("frame-src 'none'");
    expect(plain).not.toContain('google');
    const both = contentSecurityPolicy({ drive: true, analytics: true });
    expect(both).toMatch(/script-src 'self' https:\/\/accounts.google.com .*https:\/\/www.googletagmanager.com/);
    expect(both).toContain('frame-src https://accounts.google.com');
    expect(both).not.toContain("'unsafe-eval'");
  });
});
