import { indexDocument, type Document, type Id } from '../../domain';
import { worldToScreen, type Scene, type Viewport } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { Icon } from '../ui/Icon';

export function FoldControls({ t, doc, scene, viewport, size, onToggle }: {
  t: Translate; doc: Document; scene: Scene; viewport: Viewport;
  size: { width: number; height: number }; onToggle(id: Id): void;
}) {
  const index = indexDocument(doc);
  const foldedIds = new Set(scene.nodes.filter((node) => node.summary).map((node) => node.id));
  const scale = Math.max(0.4, Math.min(1, viewport.zoom));
  const controlSize = 20 * scale;
  const inset = 2 * scale;
  return doc.containers.map((area) => {
    const rect = scene.rects.get(area.id);
    const folded = foldedIds.has(area.id);
    if (!rect || (!folded && !index.children.get(area.id)?.some((child) => scene.rects.has(child)))) return null;
    const p = worldToScreen(viewport, { x: rect.x + rect.width, y: rect.y });
    const left = p.x - controlSize - inset;
    const top = p.y + inset;
    if (left + controlSize <= 0 || left >= size.width || top < 0 || top + controlSize > size.height) return null;
    const name = area.label || t(`area.${area.kind}`);
    const label = t(folded ? 'summary.expandArea' : 'summary.foldArea', { name });
    return (
      <button
        key={area.id} type="button" className="fold-control" style={{ left, top, width: controlSize, height: controlSize, borderRadius: 4 * scale }}
        aria-expanded={!folded} aria-label={label} title={label} data-testid={`fold-area-${area.id}`} data-fold-id={area.id}
        onClick={(event) => {
          onToggle(area.id);
          if (event.detail === 0) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-testid="${CSS.escape(`fold-area-${area.id}`)}"]`)?.focus());
        }}
      >
        <Icon name={folded ? 'plus' : 'minus'} size={13 * scale} />
      </button>
    );
  });
}
