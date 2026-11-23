export class FormatError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(path ? `${path}: ${message}` : message);
  }
}

export type Json = Record<string, unknown>;

export function obj(v: unknown, path: string): Json {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new FormatError(path, 'expected an object');
  return v as Json;
}

export function arr(v: unknown, path: string, max: number): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new FormatError(path, 'expected an array');
  if (v.length > max) throw new FormatError(path, `more than ${max} items`);
  return v;
}

export function str(o: Json, key: string, path: string, options: { optional?: string; max?: number } = {}): string {
  const v = o[key];
  if (v === undefined && options.optional !== undefined) return options.optional;
  if (typeof v !== 'string') throw new FormatError(`${path}.${key}`, 'expected a string');
  if (v.length > (options.max ?? 2000)) throw new FormatError(`${path}.${key}`, 'text is too long');
  return v;
}

export function id(o: Json, key: string, path: string): string {
  const v = str(o, key, path, { max: 128 });
  if (!/^[A-Za-z0-9_.:-]+$/.test(v)) throw new FormatError(`${path}.${key}`, 'ids may only contain letters, digits and _ . : -');
  return v;
}

export function num(o: Json, key: string, path: string, optional?: number): number {
  const v = o[key];
  if (v === undefined && optional !== undefined) return optional;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new FormatError(`${path}.${key}`, 'expected a finite number');
  return v;
}

export function bool(o: Json, key: string, path: string, optional: boolean): boolean {
  const v = o[key];
  if (v === undefined) return optional;
  if (typeof v !== 'boolean') throw new FormatError(`${path}.${key}`, 'expected true or false');
  return v;
}

export function oneOf<T extends string>(o: Json, key: string, path: string, allowed: readonly T[], optional?: T): T {
  const v = o[key];
  if (v === undefined && optional !== undefined) return optional;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new FormatError(`${path}.${key}`, `expected one of ${allowed.join(', ')}`);
  }
  return v as T;
}

export function nullableId(o: Json, key: string, path: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  return id(o, key, path);
}
