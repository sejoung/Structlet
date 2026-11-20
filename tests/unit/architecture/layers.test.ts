import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer rules from docs/adr/0001. Dependency direction:
 * domain ← application / engine / adapters ← components ← app; i18n stands alone.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');

const LAYERS = {
  domain: { layers: ['domain'], packages: [] as string[] },
  engine: { layers: ['domain', 'engine'], packages: [] },
  application: { layers: ['domain', 'application'], packages: [] },
  adapters: { layers: ['domain', 'engine', 'application', 'adapters'], packages: ['lucide', 'yaml'] },
  i18n: { layers: ['i18n'], packages: [] },
  components: { layers: ['domain', 'engine', 'application', 'i18n', 'components'], packages: ['react', 'react/jsx-runtime'] },
  app: { layers: ['domain', 'engine', 'application', 'adapters', 'i18n', 'components', 'app'], packages: ['react', 'react-dom/client', 'react/jsx-runtime'] },
} as const;
type Layer = keyof typeof LAYERS;
const PURE: Layer[] = ['domain', 'engine', 'application', 'i18n'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const sources = files(SRC).map((path) => ({ path, rel: relative(SRC, path), text: readFileSync(path, 'utf8') }));
const layerOf = (rel: string) => rel.split('/')[0] as Layer;

function imports(text: string): string[] {
  const found: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of text.matchAll(re)) found.push((m[1] ?? m[2] ?? m[3])!);
  return found;
}

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec.replace(/\?raw$/, ''));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try next
    }
  }
  return base;
}

describe('architecture', () => {
  it('every source file belongs to a known layer', () => {
    for (const s of sources) expect(Object.keys(LAYERS), s.rel).toContain(layerOf(s.rel));
  });

  it('imports follow the dependency direction', () => {
    const violations: string[] = [];
    for (const s of sources) {
      const rule = LAYERS[layerOf(s.rel)];
      for (const spec of imports(s.text)) {
        const target = resolveImport(s.path, spec);
        if (target === null) {
          if (!(rule.packages as readonly string[]).includes(spec)) violations.push(`${s.rel} imports package ${spec}`);
          continue;
        }
        const rel = relative(SRC, target);
        if (rel.startsWith('..')) {
          if (!(layerOf(s.rel) === 'app' && rel.startsWith('../samples/'))) violations.push(`${s.rel} imports outside src: ${spec}`);
          continue;
        }
        if (!(rule.layers as readonly string[]).includes(layerOf(rel))) violations.push(`${s.rel} → ${rel}`);
      }
    }
    expect(violations).toEqual([]);
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
    const offenders = sources.filter((s) => layerOf(s.rel) !== 'app' && /new\s+(LocalDocumentStore|LocalFileAccess)\b/.test(s.text) && !s.rel.startsWith('adapters/storage/')).map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it('no console output and no file over 400 lines', () => {
    expect(sources.filter((s) => /\bconsole\./.test(s.text)).map((s) => s.rel)).toEqual([]);
    expect(sources.filter((s) => s.text.split('\n').length > 400).map((s) => `${s.rel} (${s.text.split('\n').length})`)).toEqual([]);
  });

  it('has no import cycles', () => {
    const graph = new Map(sources.map((s) => [s.path, imports(s.text).map((spec) => resolveImport(s.path, spec)).filter((t): t is string => !!t && t.startsWith(SRC))]));
    const state = new Map<string, 'visiting' | 'done'>();
    const cycles: string[] = [];
    const visit = (node: string, stack: string[]) => {
      if (state.get(node) === 'done') return;
      if (state.get(node) === 'visiting') {
        cycles.push([...stack.slice(stack.indexOf(node)), node].map((p) => relative(SRC, p)).join(' → '));
        return;
      }
      state.set(node, 'visiting');
      for (const next of graph.get(node) ?? []) visit(next, [...stack, node]);
      state.set(node, 'done');
    };
    for (const node of graph.keys()) visit(node, []);
    expect(cycles).toEqual([]);
  });
});

describe('i18n', () => {
  it('Korean and English catalogs have the same keys', async () => {
    const { messageKeys } = await import('../../../src/i18n/messages');
    expect(messageKeys('ko').sort()).toEqual(messageKeys('en').sort());
  });
});
