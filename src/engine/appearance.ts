import type { ContainerKind } from '../domain';

export type Glyph = readonly (readonly [string, Readonly<Record<string, string | number | undefined>>])[];

export interface ServiceAppearance {
  readonly name: string;
  readonly glyph: Glyph;
  readonly color: string;
  readonly image?: string;
}

export interface Appearance {
  service(serviceId: string): ServiceAppearance | undefined;
  readonly fallback: ServiceAppearance;
  containerGlyph(kind: ContainerKind): Glyph | null;
  containerImage?(kind: ContainerKind): string | null;
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
