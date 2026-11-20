import { useMemo, useState } from 'react';
import type { Translate } from '../../i18n/messages';
import { ServiceTile } from '../GlyphIcon';
import { Icon } from '../ui/Icon';
import { PALETTE_PROVIDERS, ROLES, SERVICE_DRAG_TYPE, type PaletteProvider, type PaletteService } from './types';

interface Props {
  t: Translate;
  services: readonly PaletteService[];
  search(query: string): readonly PaletteService[];
  recent: readonly string[];
  onAdd(serviceId: string): void;
}

function Tile({ s, onAdd }: { s: PaletteService; onAdd(id: string): void }) {
  return (
    <button
      type="button"
      className="tile"
      draggable
      data-service={s.id}
      title={`${s.name} · ${s.id}`}
      onDragStart={(e) => {
        e.dataTransfer.setData(SERVICE_DRAG_TYPE, s.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onAdd(s.id)}
    >
      {s.image ? <img className="tile-image" src={s.image} alt="" width={30} height={30} /> : <ServiceTile glyph={s.glyph} color={s.color} size={30} />}
      <span className="tile-name">{s.name}</span>
    </button>
  );
}

/** Service picker: search across every provider, or browse one provider by role. */
export function ServicesPanel({ t, services, search, recent, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<PaletteProvider>('general');
  const results = useMemo(() => (query.trim() ? search(query) : []), [search, query]);
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const recentServices = recent.map((id) => byId.get(id)).filter((s): s is PaletteService => !!s).slice(0, 8);
  const browsing = services.filter((s) => s.provider === provider);
  return (
    <div className="panel-body services-panel">
      <div className="panel-sticky">
        <div className="search-field">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder={t('palette.search')}
            aria-label={t('palette.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) onAdd(results[0].id);
              if (e.key === 'Escape') setQuery('');
            }}
          />
        </div>
        {!query.trim() && (
          <div className="chips" role="tablist" aria-label={t('palette.services')}>
            {PALETTE_PROVIDERS.map((p) => (
              <button type="button" key={p} role="tab" aria-selected={provider === p} className="chip" data-provider={p} onClick={() => setProvider(p)}>
                {t(`palette.chip.${p}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {query.trim() ? (
        results.length === 0 ? (
          <p className="empty-note">{t('palette.noResults')}</p>
        ) : (
          PALETTE_PROVIDERS.map((p) => {
            const items = results.filter((s) => s.provider === p);
            return items.length ? (
              <div className="tile-group" key={p}>
                <h3>{t(`palette.provider.${p}`)}</h3>
                <div className="tile-grid">{items.map((s) => <Tile key={s.id} s={s} onAdd={onAdd} />)}</div>
              </div>
            ) : null;
          })
        )
      ) : (
        <>
          {recentServices.length > 0 && (
            <div className="tile-group" data-testid="recent-services">
              <h3>{t('panel.recent')}</h3>
              <div className="tile-grid">{recentServices.map((s) => <Tile key={s.id} s={s} onAdd={onAdd} />)}</div>
            </div>
          )}
          {ROLES.map((role) => {
            const items = browsing.filter((s) => s.role === role);
            return items.length ? (
              <div className="tile-group" key={role}>
                <h3>{t(`role.${role}`)}</h3>
                <div className="tile-grid">{items.map((s) => <Tile key={s.id} s={s} onAdd={onAdd} />)}</div>
              </div>
            ) : null;
          })}
        </>
      )}
      <p className="panel-foot">{t('palette.addHint')}</p>
    </div>
  );
}
