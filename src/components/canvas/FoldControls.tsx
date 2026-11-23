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
  return doc.containers.map((area) => {
    const rect = scene.rects.get(area.id);
    if (!rect || !index.children.get(area.id)?.length) return null;
    const folded = foldedIds.has(area.id);
    const p = worldToScreen(viewport, { x: rect.x + rect.width, y: rect.y });
    if (p.x < 0 || p.y < 0 || p.x > size.width + 20 || p.y + 22 > size.height) return null;
    const name = area.label || t(`area.${area.kind}`);
    const label = t(folded ? 'summary.expandArea' : 'summary.foldArea', { name });
    return (
      <button
        key={area.id} type="button" className="fold-control" style={{ left: p.x - 22, top: p.y + 2 }}
        aria-expanded={!folded} aria-label={label} title={label} data-testid={`fold-area-${area.id}`}
        onClick={(event) => {
          onToggle(area.id);
          if (event.detail === 0) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-testid="${CSS.escape(`fold-area-${area.id}`)}"]`)?.focus());
        }}
      >
        <Icon name={folded ? 'plus' : 'minus'} size={13} />
      </button>
    );
  });
}
