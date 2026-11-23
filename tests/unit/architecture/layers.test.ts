import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');

const LAYERS = ['domain', 'engine', 'application', 'adapters', 'i18n', 'components', 'app'] as const;
type Layer = (typeof LAYERS)[number];
const PURE: Layer[] = ['domain', 'engine', 'application', 'i18n'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const sources = files(SRC).map((path) => ({ path, rel: relative(SRC, path), text: readFileSync(path, 'utf8') }));
const layerOf = (rel: string) => rel.split('/')[0] as Layer;

describe('architecture', () => {
  it('every source file belongs to a known layer', () => {
    for (const s of sources) expect(LAYERS, s.rel).toContain(layerOf(s.rel));
  });

  it('pure layers do not touch browser globals', () => {
    const globals = /(?<![.\w'"`]|get )(window|document|localStorage|sessionStorage|navigator|fetch|requestAnimationFrame|HTMLElement|Image|Blob|URL)\b(?!\s*[:?]\s)/;
    const violations = sources
      .filter((s) => PURE.includes(layerOf(s.rel)))
      .flatMap((s) =>
        s.text
          .split('\n')
          .map((line, i) => ({ line: line.replace(/\/\*.*?\*\/|\/\/.*$|^\s*\/?\*.*$/g, ''), i }))
          .filter(({ line }) => globals.test(line) && !/^\s*(import|export)\b/.test(line))
          .map(({ i }) => `${s.rel}:${i + 1}`),
      );
    expect(violations).toEqual([]);
  });

  it('stateful adapters are created only in the app layer', () => {
    const offenders = sources.filter((s) => layerOf(s.rel) !== 'app' && /new\s+(LocalDocumentStore|LocalFileAccess|IconPackStore|GoogleConnection|DriveClient|GoogleAnalytics|LocalDriveLinks|LocalDriveFolder|LocalCreations)\b/.test(s.text) && !s.rel.startsWith('adapters/storage/')).map((s) => s.rel);
    expect(offenders).toEqual([]);
  });
});

describe('i18n', () => {
  it('Korean and English catalogs have the same keys', async () => {
    const { messageKeys } = await import('../../../src/i18n/messages');
    expect(messageKeys('ko').sort()).toEqual(messageKeys('en').sort());
  });
});
