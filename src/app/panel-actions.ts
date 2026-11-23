import type { Editor } from '../application';
import { buildLegend } from '../adapters/catalog/legend';
import { indexDocument, type Id } from '../domain';
import { layoutSelection, type LayoutMode, type Scene } from '../engine';
import type { PanelActions } from '../components/properties/sections';
import type { Language } from '../i18n/messages';

export function createPanelActions(editor: Editor, scene: () => Scene, language: Language): PanelActions {
  const doc = () => editor.session.committedDocument;
  const layout = (ids: readonly Id[], mode: LayoutMode) => {
    const { moves, grow } = layoutSelection(doc(), ids, mode);
    editor.applyLayout(moves, grow);
  };
  return {
    layout,
    layoutContents(containerId, mode) {
      const kids = indexDocument(doc()).children.get(containerId) ?? [];
      if (kids.length >= 2) layout(kids, mode);
    },
    attach(annotationId, targetId) {
      const a = indexDocument(doc()).annotations.get(annotationId);
      if (!a) return;
      const r = targetId ? scene().rects.get(targetId) : undefined;
      const at = r ? (a.kind === 'step' ? { x: r.x - 14, y: r.y - 14 } : { x: r.x, y: r.y + r.height + 28 }) : { x: a.x, y: a.y };
      editor.update('annotations', annotationId, { targetId, x: Math.round(at.x), y: Math.round(at.y) });
    },
    regenerateLegend(annotationId) {
      editor.update('annotations', annotationId, { text: buildLegend(doc(), language) });
    },
  };
}
