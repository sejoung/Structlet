import type { ResourceSettings, SettingValue } from '../../domain';
import type { Translate } from '../../i18n/messages';

function Setting({ value }: { value: SettingValue }) {
  if (value === null) return <span>null</span>;
  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || typeof entry !== 'object')) return <span>{value.length ? value.map(String).join(', ') : '[]'}</span>;
    return <ol>{value.map((entry, index) => <li key={index}><Setting value={entry} /></li>)}</ol>;
  }
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, entry]) => (
    <div key={key}><dt>{key}</dt><dd><Setting value={entry} /></dd></div>
  ))}</dl>;
  return <span>{value === '' ? '""' : String(value)}</span>;
}

export function ResourceSettingsView({ settings, t }: { settings: readonly ResourceSettings[]; t: Translate }) {
  if (!settings.length) return null;
  return <section className="resource-settings">
    <h3>{t('infra.resourceSettings')}</h3>
    {settings.map((setting, index) => (
      <details key={index} open={index === 0}>
        <summary>{setting.source ?? setting.kind}</summary>
        {setting.source && setting.source !== setting.kind && <div className="hint">{setting.kind}</div>}
        <Setting value={setting.values} />
      </details>
    ))}
  </section>;
}
