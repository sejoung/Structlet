import type { Glyph } from '../../engine';

/** Service definitions, separate from the nodes that use them and from icon packs. */

export const PROVIDERS = ['general', 'aws', 'gcp', 'azure', 'k8s'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ServiceDefinition {
  readonly id: string;
  readonly provider: Provider;
  readonly name: { readonly en: string; readonly ko: string };
  readonly keywords: readonly string[];
  /** Generic symbol (Lucide), used when no icon pack provides an image. */
  readonly glyph: Glyph;
  readonly color: string;
}

export const ROLE_COLORS = {
  client: '#232f3e',
  compute: '#ed7100',
  data: '#3b48cc',
  storage: '#3f8624',
  network: '#8c4fff',
  integration: '#e7157b',
  security: '#dd344c',
  operations: '#c925d1',
  analytics: '#01a88d',
  external: '#5f6b7a',
} as const;

export type Role = keyof typeof ROLE_COLORS;

/** `[id, English name, Korean name, glyph, role, keywords]` */
export type Row = [id: string, en: string, ko: string, glyph: Glyph, role: Role, keywords?: string];

export function define(provider: Provider, rows: readonly Row[]): ServiceDefinition[] {
  return rows.map(([id, en, ko, glyph, role, keywords]) => ({
    id,
    provider,
    name: { en, ko },
    keywords: (keywords ?? '').split(' ').filter(Boolean),
    glyph,
    color: ROLE_COLORS[role],
  }));
}
