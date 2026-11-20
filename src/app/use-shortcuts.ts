import { useEffect, useRef } from 'react';
import type { Editor } from '../application';
import { allIds, type Id } from '../domain';
import type { CanvasTool } from '../components/canvas/use-gestures';
import type { DocumentActions } from './document-actions';

interface ShortcutDeps {
  editor: Editor;
  actions: DocumentActions;
  fit(): void;
  zoom(factor: number): void;
  edit(id: Id): void;
  setTool(tool: CanvasTool): void;
  tool(): CanvasTool;
  togglePanels(): void;
  presenting(): boolean;
  setPresenting(on: boolean): void;
}

/** Keyboard shortcuts. Ignored while typing in a field. */
export function useShortcuts(deps: ShortcutDeps): void {
  const latest = useRef(deps);
  latest.current = deps;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const { editor, actions, fit, zoom, edit, setTool, tool, togglePanels, presenting, setPresenting } = latest.current;
      const session = editor.session;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const selection = session.selected;
      const handled = () => e.preventDefault();
      if (key === 'escape' && presenting()) {
        handled();
        setPresenting(false);
        return;
      }
      if (mod && key === '\\') {
        handled();
        togglePanels();
        return;
      }
      if (mod && key === '.') {
        handled();
        setPresenting(!presenting());
        return;
      }
      if (!mod && !e.altKey && !e.shiftKey && (key === 'v' || key === 'h' || key === 'c') && !presenting()) {
        handled();
        setTool(key === 'v' ? 'select' : key === 'h' ? 'hand' : 'connect');
        return;
      }
      if (presenting()) return;
      if (mod && key === 'z') {
        handled();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (mod && key === 'y') {
        handled();
        editor.redo();
      } else if (mod && key === 's') {
        handled();
        void (e.shiftKey ? actions.saveAs() : actions.save());
      } else if (mod && key === 'o') {
        handled();
        void actions.open();
      } else if (mod && key === 'd') {
        handled();
        if (selection.length) editor.duplicate(selection);
      } else if (mod && key === 'a') {
        handled();
        session.select([...allIds(session.committedDocument)]);
      } else if (mod && key === '0') {
        handled();
        fit();
      } else if (mod && (key === '=' || key === '+')) {
        handled();
        zoom(1.2);
      } else if (mod && key === '-') {
        handled();
        zoom(1 / 1.2);
      } else if (key === 'delete' || key === 'backspace') {
        if (selection.length) {
          handled();
          editor.delete(selection);
        }
      } else if (key === 'escape') {
        if (tool() !== 'select') setTool('select');
        session.select([]);
      } else if ((key === 'enter' || key === 'f2') && selection.length === 1) {
        handled();
        edit(selection[0]!);
      } else if (key.startsWith('arrow') && selection.length) {
        handled();
        const step = e.shiftKey ? 8 : 1;
        const d = { arrowleft: { x: -step, y: 0 }, arrowright: { x: step, y: 0 }, arrowup: { x: 0, y: -step }, arrowdown: { x: 0, y: step } }[key];
        if (d) editor.nudge(selection, d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

