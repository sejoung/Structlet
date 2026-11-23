import type { Glyph } from '../../engine';

export const SERVICE_DRAG_TYPE = 'application/x-structlet-service';

export const PALETTE_PROVIDERS = ['general', 'aws', 'gcp', 'azure', 'k8s', 'nvidia'] as const;
export type PaletteProvider = (typeof PALETTE_PROVIDERS)[number];

export const ROLES = ['client', 'compute', 'data', 'storage', 'network', 'integration', 'security', 'operations', 'analytics', 'external'] as const;
export type PaletteRole = (typeof ROLES)[number];

export interface PaletteService {
  readonly id: string;
  readonly name: string;
  readonly provider: PaletteProvider;
  readonly role: PaletteRole;
  readonly glyph: Glyph;
  readonly color: string;
  /** Official icon from an icon pack, if loaded. */
  readonly image?: string;
}
