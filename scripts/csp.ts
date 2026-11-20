import type { Plugin } from 'vite';

/**
 * Content Security Policy for the hosted build (ADR 0016, ADR 0017). It allows only this
 * origin, plus the Google origins a build needs: sign-in, Picker and the Drive API when
 * Drive is configured, Google Analytics when a measurement ID is set. Inline scripts and
 * `eval` stay refused. The dev server and the single-file build (whose script is inline)
 * get no policy.
 */
export const DRIVE_SOURCES: Readonly<Record<string, readonly string[]>> = {
  'script-src': ['https://accounts.google.com', 'https://apis.google.com', 'https://www.google.com'],
  'connect-src': ['https://www.googleapis.com', 'https://accounts.google.com', 'https://oauth2.googleapis.com'],
  'frame-src': ['https://accounts.google.com', 'https://docs.google.com', 'https://drive.google.com'],
  'style-src': ['https://accounts.google.com'],
};

export const ANALYTICS_SOURCES: Readonly<Record<string, readonly string[]>> = {
  'script-src': ['https://www.googletagmanager.com'],
  'img-src': ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
  'connect-src': ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
};

const BASE: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
};

export function contentSecurityPolicy(options: { drive: boolean; analytics: boolean }): string {
  const directives = new Map(Object.entries(BASE).map(([k, v]) => [k, [...v]]));
  const add = (sources: Readonly<Record<string, readonly string[]>>) => {
    for (const [k, v] of Object.entries(sources)) {
      const list = (directives.get(k) ?? []).filter((s) => s !== "'none'");
      directives.set(k, [...list, ...v]);
    }
  };
  if (options.drive) add(DRIVE_SOURCES);
  if (options.analytics) add(ANALYTICS_SOURCES);
  return [...directives].map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

export function csp(options: { drive: boolean; analytics: boolean }): Plugin {
  return {
    name: 'structlet-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(options) }, injectTo: 'head-prepend' }],
  };
}
