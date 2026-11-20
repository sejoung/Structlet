import { useEffect, useRef, useState } from 'react';
import type { Translate } from '../i18n/messages';

export type PackProviderChoice = 'auto' | 'aws' | 'gcp' | 'azure' | 'k8s';

export interface PackRow {
  readonly id: string;
  readonly name: string;
  readonly provider: Exclude<PackProviderChoice, 'auto'>;
  readonly enabled: boolean;
  readonly matched: number;
  readonly extras: number;
  readonly areas: number;
}

interface Props {
  t: Translate;
  packs: readonly PackRow[];
  persistent: boolean;
  busy: boolean;
  onImport(source: 'folder' | 'zip', provider: PackProviderChoice): void;
  onToggle(id: string, enabled: boolean): void;
  onRemove(id: string): void;
  onClose(): void;
}

const PROVIDERS: readonly PackProviderChoice[] = ['auto', 'aws', 'gcp', 'azure', 'k8s'];

/** Loading and managing icon packs the user downloaded from a provider. */
export function IconPacksDialog({ t, packs, persistent, busy, onImport, onToggle, onRemove, onClose }: Props) {
  const [provider, setProvider] = useState<PackProviderChoice>('auto');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="packs-title" onCancel={onClose} data-testid="icon-packs">
      <h2 id="packs-title">{t('packs.title')}</h2>
      <p className="hint">{t('packs.intro')}</p>
      <ul className="pack-sources">
        <li>{t('packs.source.aws')}</li>
        <li>{t('packs.source.gcp')}</li>
        <li>{t('packs.source.azure')}</li>
        <li>{t('packs.source.k8s')}</li>
      </ul>
      <div className="button-row">
        <select aria-label={t('packs.provider')} value={provider} onChange={(e) => setProvider(e.target.value as PackProviderChoice)} data-testid="pack-provider">
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{t(`packs.provider.${p}`)}</option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => onImport('zip', provider)} data-testid="pack-zip">{t('packs.zip')}</button>
        <button type="button" disabled={busy} onClick={() => onImport('folder', provider)} data-testid="pack-folder">{t('packs.folder')}</button>
      </div>
      {busy && <p className="hint" role="status">{t('packs.loading')}</p>}
      {!persistent && <p className="hint strong">{t('packs.notPersistent')}</p>}
      <table className="pack-table">
        <tbody>
          {packs.length === 0 && (
            <tr>
              <td className="hint">{t('packs.none')}</td>
            </tr>
          )}
          {packs.map((p) => (
            <tr key={p.id} data-testid={`pack-${p.id}`}>
              <td>
                <label className="check">
                  <input type="checkbox" checked={p.enabled} onChange={(e) => onToggle(p.id, e.target.checked)} aria-label={p.name} />
                  <strong>{p.name}</strong>
                </label>
                <span className="hint">{t(`packs.provider.${p.provider}`)} · {t('packs.counts', { matched: p.matched, extras: p.extras, areas: p.areas })}</span>
              </td>
              <td>
                <button type="button" className="danger" onClick={() => onRemove(p.id)}>{t('props.delete')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint small">{t('packs.trademarks')}</p>
      <div className="button-row end">
        <button type="button" onClick={onClose} data-testid="packs-close">{t('packs.close')}</button>
      </div>
    </dialog>
  );
}
