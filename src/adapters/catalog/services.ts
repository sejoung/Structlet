import { Box, Boxes, Building2, Cloud, Flag, FolderTree, Lock, MapPin, Network } from 'lucide';
import type { ContainerKind } from '../../domain';
import type { Appearance, Glyph, ServiceAppearance } from '../../engine';
import { createMatcher } from '../icon-packs/matching.ts';
import { dataUri, type IconAsset, type IconPack } from '../icon-packs/pack.ts';
import { AWS_SERVICES } from './aws.ts';
import { AZURE_SERVICES } from './azure.ts';
import { GCP_SERVICES } from './gcp.ts';
import { GENERAL_SERVICES } from './general.ts';
import { K8S_SERVICES } from './k8s.ts';
import { NVIDIA_SERVICES } from './nvidia.ts';
import { ROLE_COLORS, type ServiceDefinition } from './types.ts';


export { ROLE_COLORS, PROVIDERS, type Provider, type ServiceDefinition } from './types.ts';

export const SERVICES: readonly ServiceDefinition[] = [...GENERAL_SERVICES, ...AWS_SERVICES, ...GCP_SERVICES, ...AZURE_SERVICES, ...K8S_SERVICES, ...NVIDIA_SERVICES];
const BY_ID = new Map(SERVICES.map((s) => [s.id, s]));
const matchAwsIcon = createMatcher('aws', AWS_SERVICES);
const AWS_PACK_PREFIX = 'aws.pack.';

function awsServiceForPackId(id: string): string | null {
  return id.startsWith(AWS_PACK_PREFIX) ? matchAwsIcon.service(id.slice(AWS_PACK_PREFIX.length)) : null;
}

export function findService(id: string): ServiceDefinition | undefined {
  return BY_ID.get(id);
}

export function packServices(packs: readonly IconPack[]): ServiceDefinition[] {
  return packs
    .filter((p) => p.enabled)
    .flatMap((p) => p.extras.map((x): ServiceDefinition => ({ id: x.id, provider: p.provider, name: { en: x.name, ko: x.name }, keywords: x.id.split(/[.-]/), glyph: Box, color: ROLE_COLORS.external, role: 'external' })));
}

export function searchServices(query: string, extra: readonly ServiceDefinition[] = []): ServiceDefinition[] {
  const all = extra.length ? [...SERVICES, ...extra] : SERVICES;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...all];
  const scored: { s: ServiceDefinition; score: number }[] = [];
  for (const s of all) {
    const names = [s.name.en, s.name.ko].map((n) => n.toLowerCase());
    const hay = [...names, s.id, ...s.keywords].join(' ').toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    const first = terms[0]!;
    const words = names.flatMap((n) => n.split(/[\s()·/-]+/));
    let score = 5;
    if (s.id === first || s.keywords.includes(first)) score = 0;
    else if (names.some((n) => n.startsWith(first))) score = 1;
    else if (words.some((w) => w.startsWith(first))) score = 2;
    else if (names.some((n) => n.includes(first))) score = 3;
    else if (s.keywords.some((k) => k.startsWith(first))) score = 4;
    scored.push({ s, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.s);
}

const CONTAINER_GLYPHS: Record<ContainerKind, Glyph | null> = {
  cloud: Cloud,
  account: Building2,
  region: Flag,
  'availability-zone': MapPin,
  vpc: Network,
  subnet: Lock,
  cluster: Boxes,
  namespace: FolderTree,
  custom: null,
};

export function createAppearance(language: 'en' | 'ko', packs: readonly IconPack[] = []): Appearance {
  const enabled = packs.filter((p) => p.enabled);
  const packImages = enabled.map((pack) => {
    const aliases = new Map<string, IconAsset>();
    for (const { id } of pack.extras) {
      const service = awsServiceForPackId(id);
      const icon = pack.icons[id];
      if (service && icon && !aliases.has(service)) aliases.set(service, icon);
    }
    return { pack, aliases };
  });
  const fallback: ServiceAppearance = { name: language === 'ko' ? '알 수 없는 서비스' : 'Unknown service', glyph: Box, color: '#8a94a3' };
  const extras = new Map(packServices(enabled).map((s) => [s.id, s]));
  const cache = new Map<string, ServiceAppearance | null>();
  const imageFor = (id: string, canonical: string) => {
    for (const { pack, aliases } of packImages) {
      const icon = pack.icons[id] ?? pack.icons[canonical] ?? aliases.get(canonical);
      if (icon) return dataUri(icon);
    }
    return undefined;
  };
  return {
    service(serviceId) {
      const hit = cache.get(serviceId);
      if (hit !== undefined) return hit ?? undefined;
      const canonical = awsServiceForPackId(serviceId) ?? serviceId;
      const def = BY_ID.get(canonical) ?? extras.get(serviceId);
      const look = def ? { name: def.name[language], glyph: def.glyph, color: def.color, image: imageFor(serviceId, canonical) } : null;
      cache.set(serviceId, look);
      return look ?? undefined;
    },
    fallback,
    containerGlyph: (kind) => CONTAINER_GLYPHS[kind],
    containerImage(kind) {
      for (const p of enabled) {
        const icon = p.areas[kind];
        if (icon) return dataUri(icon);
      }
      return null;
    },
  };
}
