import { useMemo, useState } from 'react';
import { CONTAINER_KINDS, type AnnotationKind, type ContainerKind } from '../domain';
import type { Glyph } from '../engine';
import type { Translate } from '../i18n/messages';
import { GlyphIcon, ServiceTile } from './GlyphIcon';

export const SERVICE_DRAG_TYPE = 'application/x-structlet-service';

export interface PaletteService {
  readonly id: string;
  readonly name: string;
  readonly provider: PaletteProvider;
  readonly glyph: Glyph;
  readonly color: string;
  /** Official icon from an icon pack, if loaded. */
  readonly image?: string;
}

export const PALETTE_PROVIDERS = ['general', 'aws', 'gcp', 'azure', 'k8s'] as const;
export type PaletteProvider = (typeof PALETTE_PROVIDERS)[number];

interface PaletteProps {
  t: Translate;
  search(query: string): readonly PaletteService[];
  containerGlyph(kind: ContainerKind): Glyph | null;
  areaColor(kind: ContainerKind): string;
  wrapping: boolean;
  onAddService(serviceId: string): void;
  onAddArea(kind: ContainerKind): void;
  onAddNote(kind: AnnotationKind): void;
}

export function Palette(props: PaletteProps) {
  const { t } = props;
  const [query, setQuery] = useState('');
  const results = useMemo(() => props.search(query), [props, query]);
  const groups = PALETTE_PROVIDERS.map((provider) => ({ provider, items: results.filter((s) => s.provider === provider) })).filter((g) => g.items.length > 0);

  return (
    <aside className="palette" aria-label={t('palette.services')}>
      <section>
        <h2>{t('palette.services')}</h2>
        <input
          type="search"
          className="palette-search"
          placeholder={t('palette.search')}
          aria-label={t('palette.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) props.onAddService(results[0].id);
          }}
        />
        <p className="hint">{t('palette.addHint')}</p>
        <div className="service-list">
          {groups.length === 0 && <p className="hint">{t('palette.noResults')}</p>}
          {groups.map((g) => (
            <details key={g.provider} open={query.trim() !== '' || g.provider === 'general'} data-provider={g.provider}>
              <summary>
                {t(`palette.provider.${g.provider}`)} <span className="count">{g.items.length}</span>
              </summary>
              <ul>
                {g.items.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="service-item"
                      draggable
                      data-service={s.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(SERVICE_DRAG_TYPE, s.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => props.onAddService(s.id)}
                      title={s.id}
                    >
                      {s.image ? <img className="service-image" src={s.image} alt="" width={24} height={24} /> : <ServiceTile glyph={s.glyph} color={s.color} size={24} />}
                      <span>{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
      <section>
        <h2>{t('palette.areas')}</h2>
        <p className="hint">{t('palette.areasHint')}</p>
        <div className="area-grid">
          {CONTAINER_KINDS.map((kind) => {
            const glyph = props.containerGlyph(kind);
            const color = props.areaColor(kind);
            return (
              <button type="button" key={kind} className="area-item" data-area={kind} onClick={() => props.onAddArea(kind)} style={{ borderColor: color }}>
                <span className="area-swatch" style={{ background: color }}>{glyph && <GlyphIcon glyph={glyph} size={12} color="#fff" />}</span>
                {t(`area.${kind}`)}
              </button>
            );
          })}
        </div>
        {props.wrapping && <p className="hint strong">{t('props.wrap')} ↵</p>}
      </section>
      <section>
        <h2>{t('palette.notes')}</h2>
        <div className="area-grid">
          {(['text', 'step', 'legend'] as const).map((kind) => (
            <button type="button" key={kind} className="area-item" data-note={kind} onClick={() => props.onAddNote(kind)}>
              {t(`note.${kind}`)}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

