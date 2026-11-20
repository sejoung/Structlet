import type { Document } from '../../domain';
import { readDraft, type Draft } from './draft-format';
import { mergeDraft, type MergeResult } from './draft-merge';
import { terraformToDraft } from './terraform';
import { FormatError } from '../format/reader';

export type ImportSource = 'draft' | 'compose' | 'terraform' | 'kubernetes';

/** Guesses the input kind from its content. */
export function detectSource(text: string): ImportSource {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if ('values' in json || 'planned_values' in json || 'terraform_version' in json) return 'terraform';
      if (typeof json.apiVersion === 'string' && typeof json.kind === 'string') return 'kubernetes';
    } catch {
      // fall through: reported by the draft parser
    }
    return 'draft';
  }
  // Kubernetes manifests have apiVersion and kind at the top level of a document.
  if (/^apiVersion:\s*\S+/m.test(text) && /^kind:\s*\S+/m.test(text)) return 'kubernetes';
  return 'compose';
}

async function toDraft(source: ImportSource, text: string, title?: string): Promise<Draft> {
  // The YAML parser is only loaded when a compose file is imported.
  if (source === 'compose') return (await import('./compose')).composeToDraft(text, title);
  if (source === 'kubernetes') return (await import('./kubernetes')).kubernetesToDraft(text, title);
  if (source === 'terraform') return terraformToDraft(text, title);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FormatError('', 'Not valid JSON');
  }
  return readDraft(raw);
}

/**
 * Converts the input to a draft and merges it into the document. Never throws;
 * on failure the caller keeps its document.
 */
export async function importInto(doc: Document, text: string, source: ImportSource = detectSource(text), title?: string): Promise<MergeResult & { source: ImportSource }> {
  if (text.length > 5 * 1024 * 1024) return { ok: false, errors: ['Input is larger than 5 MB'], source };
  try {
    return { ...mergeDraft(doc, await toDraft(source, text, title)), source };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)], source };
  }
}
