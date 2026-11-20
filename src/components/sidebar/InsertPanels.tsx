import { CONTAINER_KINDS, type AnnotationKind, type ContainerKind } from '../../domain';
import type { Glyph } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { GlyphIcon } from '../GlyphIcon';
import { Icon, type IconName } from '../ui/Icon';

/** Area kinds with their boundary color and header symbol. */
export function AreasPanel({ t, glyph, color, wrapping, onAdd }: { t: Translate; glyph(kind: ContainerKind): Glyph | null; color(kind: ContainerKind): string; wrapping: number; onAdd(kind: ContainerKind): void }) {
  return (
    <div className="panel-body">
      <p className={wrapping ? 'panel-note active' : 'panel-note'}>{wrapping ? t('areas.wrapping', { count: wrapping }) : t('areas.wrapHint')}</p>
      <ul className="insert-list">
        {CONTAINER_KINDS.map((kind) => {
          const g = glyph(kind);
          return (
            <li key={kind}>
              <button type="button" className="insert-item" data-area={kind} onClick={() => onAdd(kind)}>
                <span className="area-sample" style={{ borderColor: color(kind) }}>
                  <span className="area-sample-tag" style={{ background: color(kind) }}>{g && <GlyphIcon glyph={g} size={10} color="#fff" strokeWidth={2.2} />}</span>
                </span>
                <span className="insert-text">
                  <strong>{t(`area.${kind}`)}</strong>
                  <span>{t(`area.desc.${kind}`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const NOTE_ICONS: Record<AnnotationKind, IconName> = { text: 'notes', step: 'flow', legend: 'grid' };

export function NotesPanel({ t, onAdd }: { t: Translate; onAdd(kind: AnnotationKind): void }) {
  return (
    <div className="panel-body">
      <ul className="insert-list">
        {(['text', 'step', 'legend'] as const).map((kind) => (
          <li key={kind}>
            <button type="button" className="insert-item" data-note={kind} onClick={() => onAdd(kind)}>
              <span className="note-sample">
                <Icon name={NOTE_ICONS[kind]} />
              </span>
              <span className="insert-text">
                <strong>{t(`note.${kind}`)}</strong>
                <span>{t(`note.desc.${kind}`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
