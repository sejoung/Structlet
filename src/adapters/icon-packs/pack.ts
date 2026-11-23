import type { ContainerKind } from '../../domain';
import type { Provider } from '../catalog/types';

export interface IconAsset {
  readonly mime: 'image/svg+xml' | 'image/png';
  readonly data: string;
}

export interface ExtraService {
  readonly id: string;
  readonly name: string;
}

export interface IconPack {
  readonly id: string;
  readonly name: string;
  readonly provider: Exclude<Provider, 'general' | 'nvidia'>;
  readonly createdAt: string;
  readonly enabled: boolean;
  readonly icons: Readonly<Record<string, IconAsset>>;
  readonly areas: Readonly<Partial<Record<ContainerKind, IconAsset>>>;
  readonly extras: readonly ExtraService[];
}

export interface PackSummary {
  readonly id: string;
  readonly name: string;
  readonly provider: IconPack['provider'];
  readonly enabled: boolean;
  readonly matched: number;
  readonly extras: number;
  readonly areas: number;
}

export function summarize(p: IconPack): PackSummary {
  return { id: p.id, name: p.name, provider: p.provider, enabled: p.enabled, matched: Object.keys(p.icons).length - p.extras.length, extras: p.extras.length, areas: Object.keys(p.areas).length };
}

export function dataUri(a: IconAsset): string {
  return `data:${a.mime};base64,${a.data}`;
}

export const PACK_LIMITS = { fileBytes: 512 * 1024, totalBytes: 60 * 1024 * 1024, files: 12_000, extras: 2_000 } as const;
