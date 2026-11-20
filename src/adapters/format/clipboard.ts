import { FORMAT_VERSION, isEmptyFragment, type Fragment } from '../../domain';
import { parseStructlet, serializeStructlet } from './structlet-format';

/** Clipboard text for a fragment: a small `.structlet` document, validated like a file on paste. */
export function serializeFragment(f: Fragment): string {
  return serializeStructlet({ formatVersion: FORMAT_VERSION, id: 'clipboard', title: 'Structlet clipboard', ...f });
}

export function parseFragment(text: string): Fragment | null {
  if (!text.includes('"structlet"')) return null;
  const result = parseStructlet(text);
  if (!result.ok) return null;
  const { nodes, containers, edges, annotations } = result.document;
  const fragment = { nodes, containers, edges, annotations };
  return isEmptyFragment(fragment) ? null : fragment;
}
