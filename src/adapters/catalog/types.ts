import type { Glyph } from '../../engine';


export const PROVIDERS = ['general', 'aws', 'gcp', 'azure', 'k8s', 'nvidia'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ServiceDefinition {
  readonly id: string;
  readonly provider: Provider;
  readonly name: { readonly en: string; readonly ko: string };
  readonly keywords: readonly string[];
  readonly glyph: Glyph;
  readonly color: string;
  readonly role: Role;
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

export type Row = [id: string, en: string, ko: string, glyph: Glyph, role: Role, keywords?: string];

export function define(provider: Provider, rows: readonly Row[]): ServiceDefinition[] {
  return rows.map(([id, en, ko, glyph, role, keywords]) => ({
    id,
    provider,
    name: { en, ko },
    keywords: (keywords ?? '').split(' ').filter(Boolean),
    glyph,
    color: ROLE_COLORS[role],
    role,
  }));
}
