import { unzipSync } from 'fflate';
import type { ContainerKind } from '../../domain';
import { SERVICES } from '../catalog/services';
import { createMatcher, normalize, preference } from './matching';
import { PACK_LIMITS, type ExtraService, type IconAsset, type IconPack } from './pack';

export interface PackFile {
  readonly path: string;
  readonly data: Uint8Array;
}

export type PackProvider = IconPack['provider'];
export const PACK_PROVIDERS: readonly PackProvider[] = ['aws', 'gcp', 'azure', 'k8s'];

export type BuildResult = { ok: true; pack: IconPack; skipped: number } | { ok: false; error: string };

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const isIcon = (path: string) => /\.(svg|png)$/i.test(path) && !/(^|\/)(__macosx|\.)/i.test(path);

/** Files from a zip, including zips nested one level (some packages ship that way). */
export function filesFromZip(bytes: Uint8Array): PackFile[] {
  const out: PackFile[] = [];
  const read = (data: Uint8Array, prefix: string, depth: number) => {
    const entries = unzipSync(data, { filter: (f) => isIcon(f.name) || (depth === 0 && /\.zip$/i.test(f.name)) });
    for (const [path, content] of Object.entries(entries)) {
      if (/\.zip$/i.test(path)) read(content, `${prefix}${path}/`, depth + 1);
      else out.push({ path: prefix + path, data: content });
    }
  };
  read(bytes, '', 0);
  return out;
}

function title(key: string): string {
  return key.split('-').map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1))).join(' ');
}

/**
 * Builds an icon pack from the files of a provider's icon download. With
 * `provider: 'auto'` the provider whose rules match the most files is used.
 */
export function buildIconPack(files: readonly PackFile[], provider: PackProvider | 'auto', name: string, id: string, now = new Date()): BuildResult {
  const icons = files.filter((f) => isIcon(f.path));
  if (icons.length === 0) return { ok: false, error: 'No SVG or PNG icons found' };
  if (icons.length > PACK_LIMITS.files) return { ok: false, error: `More than ${PACK_LIMITS.files} icon files` };
  const total = icons.reduce((s, f) => s + f.data.length, 0);
  if (total > PACK_LIMITS.totalBytes) return { ok: false, error: `Icons are larger than ${PACK_LIMITS.totalBytes / 1024 / 1024} MB in total` };
  const chosen =
    provider !== 'auto'
      ? provider
      : PACK_PROVIDERS.map((p) => ({ p, n: icons.filter((f) => createMatcher(p, SERVICES).service(f.path)).length })).sort((a, b) => b.n - a.n)[0]!.p;
  const matcher = createMatcher(chosen, SERVICES);
  const best = new Map<string, { file: PackFile; score: number }>();
  const bestArea = new Map<ContainerKind, { file: PackFile; score: number }>();
  const extras = new Map<string, { file: PackFile; score: number; name: string }>();
  let skipped = 0;
  for (const f of icons) {
    if (f.data.length > PACK_LIMITS.fileBytes) {
      skipped++;
      continue;
    }
    const score = preference(f.path);
    const serviceId = matcher.service(f.path);
    const area = matcher.area(f.path);
    if (serviceId) {
      if ((best.get(serviceId)?.score ?? -1) < score) best.set(serviceId, { file: f, score });
    } else if (area) {
      if ((bestArea.get(area)?.score ?? -1) < score) bestArea.set(area, { file: f, score });
    } else {
      const key = normalize(f.path).replace(/^(amazon|aws|azure|microsoft|google)-/, '');
      if (!key) continue;
      const xid = `${chosen}.pack.${key}`.slice(0, 120);
      if ((extras.get(xid)?.score ?? -1) < score) extras.set(xid, { file: f, score, name: title(key) });
    }
  }
  const asset = (f: PackFile): IconAsset => ({ mime: /\.png$/i.test(f.path) ? 'image/png' : 'image/svg+xml', data: base64(f.data) });
  const iconMap: Record<string, IconAsset> = {};
  for (const [sid, { file }] of best) iconMap[sid] = asset(file);
  const extraList: ExtraService[] = [];
  for (const [xid, { file, name: n }] of [...extras].slice(0, PACK_LIMITS.extras)) {
    iconMap[xid] = asset(file);
    extraList.push({ id: xid, name: n });
  }
  const areas: Partial<Record<ContainerKind, IconAsset>> = {};
  for (const [kind, { file }] of bestArea) areas[kind] = asset(file);
  if (best.size === 0 && extraList.length === 0) return { ok: false, error: 'No icons could be used' };
  return { ok: true, pack: { id, name, provider: chosen, createdAt: now.toISOString(), enabled: true, icons: iconMap, areas, extras: extraList }, skipped };
}
