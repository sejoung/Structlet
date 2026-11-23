export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 ? value : undefined;
}

export function texts(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap((entry) => text(entry) ?? []);
}

export function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

export function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function present<T extends object>(fields: T): T | undefined {
  return Object.values(fields).some((value) => value !== undefined) ? fields : undefined;
}
