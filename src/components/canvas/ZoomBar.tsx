import { zoomAt, type Viewport } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { IconButton } from '../ui/controls';

/** Floating zoom controls; the percentage resets to 100%. */
export function ZoomBar({ t, viewport, size, setViewport, onFit }: { t: Translate; viewport: Viewport; size: { width: number; height: number }; setViewport(v: Viewport): void; onFit(): void }) {
  const center = { x: size.width / 2, y: size.height / 2 };
  return (
    <div className="zoombar" role="group" aria-label={t('zoom.level')}>
      <IconButton icon="minus" label={t('zoom.out')} onClick={() => setViewport(zoomAt(viewport, center, 1 / 1.2))} testId="zoom-out" />
      <button type="button" className="zoom-level" data-testid="zoom-level" title="100%" onClick={() => setViewport(zoomAt(viewport, center, 1 / viewport.zoom))}>
        {Math.round(viewport.zoom * 100)}%
      </button>
      <IconButton icon="plus" label={t('zoom.in')} onClick={() => setViewport(zoomAt(viewport, center, 1.2))} testId="zoom-in" />
      <IconButton icon="fit" label={t('zoom.fit')} onClick={onFit} testId="tb-fit" />
    </div>
  );
}
