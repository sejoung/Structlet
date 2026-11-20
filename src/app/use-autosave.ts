import { useEffect } from 'react';
import type { DocumentStore, Editor, SessionSnapshot } from '../application';

/**
 * Browser autosave: shortly after each change, and at once when the page is hidden or
 * closed, so a reload never finds an older copy than what was on screen.
 */
export function useAutosave(editor: Editor, store: DocumentStore, snapshot: SessionSnapshot): void {
  // Leaving the page saves at once instead of waiting for the autosave delay.
  useEffect(() => {
    const flush = () => {
      if (!editor.session.getSnapshot().dirty) return;
      store.save(editor.session.committedDocument);
      editor.session.markSaved(editor.session.getSnapshot().revision);
    };
    const hidden = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [editor, store]);

  useEffect(() => {
    if (!snapshot.dirty) return;
    const revision = snapshot.revision;
    const timer = setTimeout(() => {
      store.save(editor.session.committedDocument);
      editor.session.markSaved(revision);
    }, 400);
    return () => clearTimeout(timer);
  }, [snapshot.revision, snapshot.dirty, editor, store]);
}
