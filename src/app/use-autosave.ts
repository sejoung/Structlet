import { useEffect } from 'react';
import type { DocumentStore, Editor, SessionSnapshot } from '../application';

export function useAutosave(editor: Editor, store: DocumentStore, snapshot: SessionSnapshot): void {
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
