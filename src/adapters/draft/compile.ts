import type { Document } from '../../domain';
import { parseStructlet, serializeStructlet } from '../format/structlet-format';
import { parseDraft } from './draft-format';
import { mergeDraft } from './draft-merge';

export type CompileResult = { ok: true; text: string; document: Document } | { ok: false; errors: string[] };

export function compileDraft(input: string, base: Document): CompileResult {
  const trimmed = input.trim();
  const content = /^\x60{3}(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\x60{3}$/i.exec(trimmed)?.[1] ?? trimmed;
  const draft = parseDraft(content);
  if (!draft.ok) return draft;
  const merged = mergeDraft(base, draft.draft);
  if (!merged.ok) return merged;
  const { document } = merged;
  if (document.nodes.length + document.containers.length + document.edges.length + document.annotations.length === 0) {
    return { ok: false, errors: ['Add at least one diagram object.'] };
  }
  const text = serializeStructlet(document);
  const reopened = parseStructlet(text);
  if (!reopened.ok) return reopened;
  return { ok: true, text, document: reopened.document };
}
