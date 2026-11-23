import { useEffect, useRef } from 'react';
import type { Editor } from '../application';
import { parseFragment, serializeFragment } from '../adapters/format/clipboard';
import { extractFragment, getBox, isEmptyFragment, type Fragment, type Id, type Point } from '../domain';

interface ClipboardDeps {
  editor: Editor;
  summary?(): boolean;
  /** Area to paste into: a single selected area, otherwise the area under the view center. */
  pasteParent(): Id | null;
  /** Text that is not a Structlet fragment (draft JSON, compose, terraform) goes to import. */
  onImportText(text: string): void;
  onPasteUnavailable(): void;
}

/**
 * Copy, cut and paste through the browser clipboard events, so no clipboard
 * permission is needed. The clipboard holds a small `.structlet` document.
 */
export function useClipboard(deps: ClipboardDeps) {
  const latest = useRef(deps);
  latest.current = deps;
  const memory = useRef<{ fragment: Fragment; pastes: number } | null>(null);
  useEffect(() => {
    const typing = (e: Event) => (e.target as HTMLElement | null)?.closest?.('dialog, input, textarea, select, [contenteditable="true"]');
    const copy = (e: ClipboardEvent, cut: boolean) => {
      if (latest.current.summary?.() || typing(e)) return;
      const { editor } = latest.current;
      const selection = editor.session.selected;
      if (!selection.length) return;
      const fragment = extractFragment(editor.session.committedDocument, selection);
      if (isEmptyFragment(fragment)) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', serializeFragment(fragment));
      memory.current = { fragment, pastes: 0 };
      if (cut) editor.delete(selection);
    };
    const onCopy = (e: ClipboardEvent) => copy(e, false);
    const onCut = (e: ClipboardEvent) => copy(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (latest.current.summary?.() || typing(e)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const { editor, pasteParent, onImportText } = latest.current;
      const fragment = parseFragment(text) ?? (text.trim() === '' ? memory.current?.fragment ?? null : null);
      if (!fragment) {
        if (text.trim()) {
          e.preventDefault();
          onImportText(text);
        }
        return;
      }
      e.preventDefault();
      const same = memory.current && serializeFragment(memory.current.fragment) === serializeFragment(fragment);
      const n = same ? ++memory.current!.pastes : 1;
      if (!same) memory.current = { fragment, pastes: 1 };
      const offset: Point = { x: 24 * n, y: 24 * n };
      const parent = pasteParent();
      editor.paste(fragment, offset, parent && getBox(editor.session.committedDocument, parent) ? parent : null);
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  return async (at: Point, parent: Id | null) => {
    const { editor } = latest.current;
    const doc = editor.session.committedDocument;
    const text = await navigator.clipboard?.readText?.().catch(() => '') ?? '';
    const { summary, onImportText, onPasteUnavailable } = latest.current;
    if (summary?.() || editor.session.committedDocument !== doc) return;
    const fragment = text.trim() ? parseFragment(text) : memory.current?.fragment;
    if (!fragment) {
      if (text.trim()) onImportText(text);
      else onPasteUnavailable();
      return;
    }
    const roots = [...fragment.containers, ...fragment.nodes].filter((box) => box.parentId === null);
    const points = [...roots, ...fragment.annotations, ...fragment.edges.flatMap((edge) => [edge.source, edge.target].flatMap((end) => end.kind === 'free' ? [end] : []))];
    const x = points.length ? Math.min(...points.map((point) => point.x)) : at.x;
    const y = points.length ? Math.min(...points.map((point) => point.y)) : at.y;
    editor.paste(fragment, { x: Math.round(at.x - x), y: Math.round(at.y - y) }, parent);
  };
}
