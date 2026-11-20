import type { ContainerKind } from '../domain';

/** Icon drawing data in a 24×24 box, as `[tag, attributes]` pairs (Lucide's format). */
export type Glyph = readonly (readonly [string, Readonly<Record<string, string | number | undefined>>])[];

export interface ServiceAppearance {
  readonly name: string;
  readonly glyph: Glyph;
  /** Tile color. */
  readonly color: string;
}

/** How catalog entries look. Supplied by the catalog adapter. */
export interface Appearance {
  service(serviceId: string): ServiceAppearance | undefined;
  /** Used for unknown service ids; the node keeps its own label. */
  readonly fallback: ServiceAppearance;
  containerGlyph(kind: ContainerKind): Glyph | null;
}

export const AREA_STROKE: Record<string, string> = {
  gray: '#7d8998',
  teal: '#00a4a6',
  purple: '#8c4fff',
  green: '#3f8624',
  blue: '#147eba',
  orange: '#ed7100',
  pink: '#e7157b',
  red: '#dd344c',
};
