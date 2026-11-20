/**
 * Layer rules from docs/adr/0001-layered-local-first.md, checked with `npm run deps`.
 *
 *   domain ← application / engine / adapters ← components ← app;  i18n stands alone.
 *
 * Each layer lists the layers and packages it may use. Change this file and the ADR together.
 * TypeScript is parsed with swc: TypeScript 7.0 has no JavaScript API for dependency-cruiser.
 */

/** Layers each layer may import, besides itself. */
const LAYERS = {
  domain: [],
  engine: ['domain'],
  application: ['domain'],
  adapters: ['domain', 'engine', 'application'],
  i18n: [],
  components: ['domain', 'engine', 'application', 'i18n'],
  app: ['domain', 'engine', 'application', 'adapters', 'i18n', 'components'],
};

/** Packages each layer may import (bare names, matched as node_modules/<name>/). */
const PACKAGES = {
  domain: [],
  engine: [],
  application: [],
  adapters: ['lucide', 'yaml', 'fflate'],
  i18n: [],
  components: ['react', 'lucide'],
  app: ['react', 'react-dom'],
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anyOf = (names) => (names.length ? `(${names.map(escape).join('|')})` : '(?!)');

const layerRules = Object.entries(LAYERS).map(([layer, allowed]) => ({
  name: `layer-${layer}`,
  severity: 'error',
  comment: `src/${layer} may import only ${allowed.length ? [layer, ...allowed].join(', ') : `itself`} (ADR 0001).`,
  from: { path: `^src/${layer}/` },
  to: { path: '^src/', pathNot: `^src/${anyOf([layer, ...allowed])}/` },
}));

const packageRules = Object.entries(PACKAGES).map(([layer, allowed]) => ({
  name: `packages-${layer}`,
  severity: 'error',
  comment: `src/${layer} may use only these packages: ${allowed.join(', ') || 'none'} (ADR 0001).`,
  from: { path: `^src/${layer}/` },
  to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'npm-unknown'], pathNot: `^node_modules/${anyOf(allowed)}/` },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...layerRules,
    ...packageRules,
    {
      name: 'src-stays-in-src',
      severity: 'error',
      comment: 'Source imports only source files and packages. The app layer may also read the bundled samples.',
      from: { path: '^src/', pathNot: '^src/app/' },
      to: { path: '^(?!src/|node_modules/)', dependencyTypesNot: ['core'] },
    },
    {
      name: 'app-stays-in-src',
      severity: 'error',
      comment: 'The app layer imports source files, packages and samples/ only.',
      from: { path: '^src/app/' },
      to: { path: '^(?!src/|node_modules/|samples/)', dependencyTypesNot: ['core'] },
    },
    {
      name: 'no-node-in-src',
      severity: 'error',
      comment: 'The editor runs in the browser: no Node.js built-ins in src/.',
      from: { path: '^src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-dev-deps-in-src',
      severity: 'error',
      comment: 'What ships to the browser must come from dependencies, not devDependencies.',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-src-to-tests',
      severity: 'error',
      comment: 'Source never depends on tests.',
      from: { path: '^src/' },
      to: { path: '^tests/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No import cycles (ADR 0001).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import resolves to a file or an installed package.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-undeclared-packages',
      severity: 'error',
      comment: 'Packages are declared in package.json, not picked up transitively.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'A module nothing imports and that imports nothing is probably dead code.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '^src/app/main\\.tsx$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: '^node_modules' },
    exclude: { path: '^(dist|dist-single|test-results)/' },
    parser: 'swc',
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
      conditionNames: ['import', 'module', 'browser', 'default'],
      exportsFields: ['exports'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
