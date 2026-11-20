import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseStructlet } from '../../src/adapters/format/structlet-format';
import { EditorSession, Editor, type IdGenerator } from '../../src/application';
import { emptyDocument, type Document } from '../../src/domain';

export function sampleText(): string {
  return readFileSync(fileURLToPath(new URL('../../samples/three-tier.structlet', import.meta.url)), 'utf8');
}

export function sampleDocument(): Document {
  const result = parseStructlet(sampleText());
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.document;
}

export function counterIds(): IdGenerator {
  let n = 0;
  return (kind) => `${kind}-${++n}`;
}

export function newEditor(doc: Document = emptyDocument('doc-1', 'Test')): Editor {
  let t = 0;
  return new Editor(new EditorSession(doc, { now: () => (t += 10_000) }), counterIds());
}
