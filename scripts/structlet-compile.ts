import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { compileDraft } from '../src/adapters/draft/compile';
import { FILE_EXTENSION, parseStructlet } from '../src/adapters/format/structlet-format';
import { emptyDocument } from '../src/domain';

const USAGE = 'Usage: node compile.mjs INPUT.json [OUTPUT.structlet] [--base EXISTING.structlet]';

async function run() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { base: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) {
    process.stdout.write(USAGE + '\n');
    return;
  }
  const [input, explicitOutput] = positionals;
  if (!input || positionals.length > 2) throw new Error(USAGE);
  const name = basename(input).replace(/(?:\.draft)?\.json$/i, '') || 'architecture';
  const output = explicitOutput ?? join(dirname(input), name + FILE_EXTENSION);
  if (!output.toLowerCase().endsWith(FILE_EXTENSION)) throw new Error('The output filename must end with .structlet.');

  const draft = await readFile(input, 'utf8');
  const id = 'doc-' + createHash('sha256').update(draft).digest('hex').slice(0, 16);
  let base = emptyDocument(id, name.slice(0, 200));
  if (values.base) {
    const loaded = parseStructlet(await readFile(values.base, 'utf8'));
    if (!loaded.ok) throw new Error(loaded.errors.join('\n'));
    base = loaded.document;
  }
  const result = compileDraft(draft, base);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  await writeFile(output, result.text, { flag: 'wx' });
  process.stdout.write(output + '\n');
}

run().catch((error: unknown) => {
  const exists = error instanceof Error && 'code' in error && error.code === 'EEXIST';
  const message = exists ? 'The output file already exists. Choose a new .structlet filename.' : error instanceof Error ? error.message : String(error);
  process.stderr.write(message + '\n');
  process.exitCode = 1;
});
