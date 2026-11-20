/** Public browser configuration for Google Drive; never a client secret. */
export interface GoogleConfig {
  readonly clientId: string;
  readonly apiKey: string;
  readonly appId: string;
}

/**
 * The Drive settings of this build (`.env.local`, see docs/google-drive.md), or null when
 * any is missing: Drive is optional and the app works fully without it.
 */
export function driveConfig(env: Readonly<Record<string, unknown>> = import.meta.env): GoogleConfig | null {
  const read = (key: string) => (typeof env[key] === 'string' ? (env[key] as string).trim() : '');
  const clientId = read('VITE_GOOGLE_CLIENT_ID');
  const apiKey = read('VITE_GOOGLE_API_KEY');
  const appId = read('VITE_GOOGLE_APP_ID');
  return clientId && apiKey && appId ? { clientId, apiKey, appId } : null;
}

/** Google sign-in needs a registered web origin; a page opened from a file has none. */
export function webOrigin(location: { protocol: string }): boolean {
  return location.protocol === 'https:' || location.protocol === 'http:';
}
