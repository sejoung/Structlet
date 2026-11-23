import type { ResourceSettings, SettingValue, SettingValues } from '../../domain';

const PRIVATE_KEY = /^(?:password|passwd|passphrase|(?:access|refresh|bearer|auth)?[_-]?token|access[_-]?key(?:[_-]?id)?|secret(?:[_-]?access[_-]?key)?|private[_-]?key|credentials|kubeconfig|client[_-]?secret|api[_-]?key|user[_-]?data|master[_-]?(?:user[_-]?)?password|authorization|set[_-]?sensitive)$/i;
const LARGE_PAYLOAD = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export function safeSetting(value: unknown, sensitive?: unknown, depth = 0): SettingValue | undefined {
  if (sensitive === true || depth > 12) return undefined;
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value === 'string') {
    if (value.length > 2048 || LARGE_PAYLOAD.test(value)) return undefined;
    return value
      .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/?#]*@/, '$1')
      .replace(/([?&](?:token|access_token|password|x-amz-signature)=)[^&#]*/gi, '$1');
  }
  if (Array.isArray(value)) return value.slice(0, 1024).flatMap((entry, index) => {
    const item = safeSetting(entry, Array.isArray(sensitive) ? sensitive[index] : undefined, depth + 1);
    return item === undefined ? [] : [item];
  });
  if (!value || typeof value !== 'object') return undefined;
  const mask = sensitive && typeof sensitive === 'object' ? sensitive as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(value).slice(0, 1024).flatMap(([key, entry]) => {
    if (!key || key.length > 2048 || PRIVATE_KEY.test(key)) return [];
    const item = safeSetting(entry, mask[key], depth + 1);
    return item === undefined ? [] : [[key, item]];
  }));
}

type Fields = Map<string, Fields | null>;

function selectedFields(paths: string): Fields {
  const result: Fields = new Map();
  for (const path of paths.trim().split(/\s+/)) {
    if (!path) continue;
    const segments = path.split('.');
    let fields = result;
    for (const segment of segments.slice(0, -1)) {
      const next = fields.get(segment) ?? new Map();
      fields.set(segment, next);
      fields = next;
    }
    fields.set(segments.at(-1)!, null);
  }
  return result;
}

function pick(value: unknown, fields: Fields, sensitive?: unknown, depth = 0): SettingValue | undefined {
  if (sensitive === true || depth > 12) return undefined;
  if (Array.isArray(value)) {
    if (!value.length) return [];
    const items = value.slice(0, 1024).flatMap((entry, index) => {
      const item = pick(entry, fields, Array.isArray(sensitive) ? sensitive[index] : undefined, depth + 1);
      return item === undefined ? [] : [item];
    });
    return items.length ? items : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const mask = sensitive && typeof sensitive === 'object' ? sensitive as Record<string, unknown> : {};
  const entries = [...fields].flatMap(([key, nested]) => {
    if (!Object.hasOwn(source, key) || PRIVATE_KEY.test(key)) return [];
    const item = nested ? pick(source[key], nested, mask[key], depth + 1) : safeSetting(source[key], mask[key], depth + 1);
    return item === undefined ? [] : [[key, item] as const];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function settingFields(value: unknown, paths: string, sensitive?: unknown): SettingValues | undefined {
  const result = pick(value, selectedFields(paths), sensitive);
  return result && typeof result === 'object' && !Array.isArray(result) ? result as SettingValues : undefined;
}

export function settingsSection(kind: string, values: SettingValues | undefined, source?: string): ResourceSettings | undefined {
  return values && Object.keys(values).length ? { kind, values, ...(source ? { source } : {}) } : undefined;
}
