import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { rolldown } from 'rolldown';
import type { Plugin } from 'vite';
import { SERVICES } from '../src/adapters/catalog/services.ts';

const FOLDER = new URL('../samples/ai/structlet/', import.meta.url);
const ALL_FILES = ['SKILL.md', 'references/prompt-en.md', 'references/prompt-ko.md'] as const;
const MODULE = 'virtual:structlet-skill';
const RESOLVED = '\0' + MODULE;

export async function buildStructletSkill() {
  const bundle = await rolldown({ input: fileURLToPath(new URL('./structlet-compile.ts', import.meta.url)), platform: 'node' });
  try {
    const { output } = await bundle.generate({ format: 'esm', codeSplitting: false, comments: false });
    const entry = output[0];
    if (output.length !== 1 || entry?.type !== 'chunk') throw new Error('Expected one Structlet compiler script.');
    const files = await Promise.all(ALL_FILES.map(async (path) => [
      `structlet/${path}`, await readFile(new URL(path, FOLDER)),
    ] as const));
    const services = ['id\tEnglish\t한국어', ...SERVICES.map(({ id, name }) => [id, name.en, name.ko].join('\t'))].join('\n') + '\n';
    return zipSync({
      ...Object.fromEntries(files),
      'structlet/references/services.tsv': strToU8(services),
      'structlet/scripts/compile.mjs': strToU8(entry.code),
    }, { level: 9, mtime: new Date(2000, 0, 1) });
  } finally {
    await bundle.close();
  }
}

export function structletSkillPlugin(): Plugin {
  return {
    name: 'structlet-skill',
    resolveId(id) {
      if (id === MODULE) return RESOLVED;
    },
    async load(id) {
      if (id !== RESOLVED) return;
      for (const path of ALL_FILES) this.addWatchFile(fileURLToPath(new URL(path, FOLDER)));
      this.addWatchFile(fileURLToPath(new URL('./structlet-compile.ts', import.meta.url)));
      const bytes = await buildStructletSkill();
      return 'export default ' + JSON.stringify(Buffer.from(bytes).toString('base64'));
    },
  };
}
