const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;

export function analyticsConfig(
  env: Readonly<Record<string, unknown>> = import.meta.env,
): { measurementId: string } | null {
  if (env.PROD !== true) return null;
  const value = env.VITE_GA_MEASUREMENT_ID;
  const id = typeof value === 'string' ? value.trim() : '';
  return MEASUREMENT_ID.test(id) ? { measurementId: id } : null;
}
