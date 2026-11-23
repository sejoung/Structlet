import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'rolldown/utils';
import { Parser } from 'yaml';

const scriptExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const formatExtensions = new Set(['.css', '.html', '.yml', '.yaml']);
const configFiles = ['.env.example', '.gitignore'];

function entries(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entries(path);
    const extension = extname(path);
    return scriptExtensions.has(extension) || formatExtensions.has(extension) ? [path] : [];
  });
}

export function sourceFiles() {
  const roots = readdirSync('.', { withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => scriptExtensions.has(extname(name)) || formatExtensions.has(extname(name)));
  return [...roots, ...configFiles, ...['src', 'tests', 'scripts', '.github'].flatMap(entries)].sort();
}

function yamlComments(source) {
  const comments = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'comment') {
      comments.push({ start: value.offset, end: value.offset + value.source.length });
      return;
    }
    for (const child of Object.values(value)) visit(child);
  }
  for (const token of new Parser().parse(source)) visit(token);
  return comments;
}

export function commentsIn(path, source) {
  const extension = extname(path);
  if (scriptExtensions.has(extension)) {
    const parsed = parseSync(path, source);
    if (parsed.errors.length) throw new Error(parsed.errors.map((error) => error.message).join('\n'));
    return parsed.comments;
  }
  if (extension === '.yaml' || extension === '.yml') return yamlComments(source);
  const patterns = {
    '.css': /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\*[\s\S]*?\*\//g,
    '.html': /<!--[\s\S]*?-->/g,
    '.example': /^[ \t]*#[^\r\n]*/gm,
  };
  const pattern = patterns[extension] ?? /^#[^\r\n]*/gm;
  return Array.from(source.matchAll(pattern))
    .filter(([match]) => extension !== '.css' || match.startsWith('/*'))
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.length > 2 ? process.argv.slice(2) : sourceFiles();
  for (const path of files) {
    try {
      const source = readFileSync(path, 'utf8');
      for (const { start } of commentsIn(path, source)) {
        const line = source.slice(0, start).split('\n').length;
        process.stderr.write(`${path}:${line}: source comments are not allowed\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      process.stderr.write(`${path}: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
