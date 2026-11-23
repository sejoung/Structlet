import type { GoogleConfig } from './config';
import type { AuthChannel, AuthMessage } from './auth-channel';
import { loadScript } from './script-loader';
import { MIME_TYPE } from '../format/structlet-format';
import type { PickerApi } from './google-types';
import {
  DriveAuthError,
  type AuthEvent,
  type DriveAuth,
  type DriveItem,
  type PickKind,
  type PickOptions,
} from './types';

export const IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
export const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const RENEW_BEFORE = 10 * 60_000;
const PICKER_TIMEOUT_MS = 15_000;
const REVOKE_TIMEOUT_MS = 10_000;
const EXPIRY_MARGIN_S = 30;

export class GoogleConnection implements DriveAuth {
  private token: string | null = null;
  private expiresAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private loaded = false;
  private generation = 0;
  private readonly listeners = new Set<(event: AuthEvent) => void>();

  constructor(
    private readonly config: GoogleConfig,
    private readonly channel: AuthChannel | null = null,
  ) {
    channel?.listen(this.receive);
    channel?.post({ type: 'request' });
  }

  getToken = (): string | null => (Date.now() < this.expiresAt ? this.token : null);

  expiring(): boolean {
    return this.getToken() !== null && this.expiresAt - Date.now() <= RENEW_BEFORE;
  }

  subscribe(listener: (event: AuthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ready(): boolean {
    return this.loaded;
  }

  async prepare(): Promise<void> {
    await Promise.all([loadScript(IDENTITY_SCRIPT), loadScript(PICKER_SCRIPT)]);
    const gapi = window.gapi;
    if (!gapi) throw new DriveAuthError('unavailable', 'The Picker loader is missing.');
    await new Promise<void>((resolve, reject) =>
      gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new DriveAuthError('unavailable', 'Could not load the Picker.')),
        timeout: PICKER_TIMEOUT_MS,
        ontimeout: () => reject(new DriveAuthError('unavailable', 'Timed out loading the Picker.')),
      }),
    );
    this.loaded = true;
  }

  connect(hint?: string): Promise<void> {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth)
      return Promise.reject(new DriveAuthError('unavailable', 'Google sign-in is not loaded.'));
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const client = oauth.initTokenClient({
        client_id: this.config.clientId,
        scope: DRIVE_SCOPE,
        callback: (result) => {
          if (generation !== this.generation || result.error || !result.access_token) {
            reject(new DriveAuthError('cancelled', result.error ?? 'No access was granted.'));
            return;
          }
          const lifetime = Math.max(0, (result.expires_in ?? 3600) - EXPIRY_MARGIN_S) * 1000;
          this.keep(result.access_token, Date.now() + lifetime);
          this.share();
          this.emit('connected');
          resolve();
        },
        error_callback: () =>
          reject(new DriveAuthError('cancelled', 'The sign-in window was closed or blocked.')),
      });
      client.requestAccessToken({ prompt: '', ...(hint ? { login_hint: hint } : {}) });
    });
  }

  clearToken(token: string): void {
    if (token !== this.token) return;
    this.keep(null, 0);
    this.channel?.post({ type: 'expired', token });
    this.emit('expired');
  }

  async pick(kind: PickKind, options: PickOptions): Promise<DriveItem | null> {
    const token = this.getToken();
    const api = window.google?.picker;
    if (!token || !api) throw new DriveAuthError('unavailable', 'Connect Google Drive first.');
    return showPicker(kind, {
      ...options,
      api,
      token,
      apiKey: this.config.apiKey,
      appId: this.config.appId,
    });
  }

  async disconnect(forget = false): Promise<void> {
    const token = this.getToken();
    this.withdraw();
    this.channel?.post({ type: 'disconnected', forget });
    this.emit(forget ? 'forgotten' : 'disconnected');
    if (token) await revoke(token);
  }

  private withdraw(): void {
    this.generation++;
    this.keep(null, 0);
  }

  private keep(token: string | null, expiresAt: number): void {
    this.token = token;
    this.expiresAt = token ? expiresAt : 0;
    this.timers.forEach((timer) => clearTimeout(timer));
    const left = expiresAt - Date.now();
    this.timers = token
      ? [
          setTimeout(() => this.emit('expiring'), Math.max(0, left - RENEW_BEFORE)),
          setTimeout(() => {
            this.keep(null, 0);
            this.emit('expired');
          }, left),
        ]
      : [];
  }

  private share(): void {
    const token = this.getToken();
    if (token) this.channel?.post({ type: 'token', token, expiresIn: this.expiresAt - Date.now() });
  }

  private readonly receive = (message: AuthMessage): void => {
    if (message.type === 'request') return this.share();
    if (message.type === 'token') {
      const expiresAt = Date.now() + message.expiresIn;
      if (this.getToken() && expiresAt <= this.expiresAt) return;
      this.keep(message.token, expiresAt);
      return this.emit('connected');
    }
    if (message.type === 'expired') {
      if (message.token !== this.token) return;
      this.keep(null, 0);
      return this.emit('expired');
    }
    this.withdraw();
    this.emit(message.forget ? 'forgotten' : 'disconnected');
  };

  private emit(event: AuthEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function revoke(token: string): Promise<void> {
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) return Promise.reject(new DriveAuthError('revoke', 'Google sign-in is not loaded.'));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DriveAuthError('revoke', 'Google did not confirm in time.')),
      REVOKE_TIMEOUT_MS,
    );
    oauth.revoke(token, (result) => {
      clearTimeout(timer);
      if (result?.successful) resolve();
      else reject(new DriveAuthError('revoke', result?.error ?? 'Google refused.'));
    });
  });
}

const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const OPENABLE_TYPES = [MIME_TYPE, 'application/octet-stream', FOLDER_TYPE];

interface PickerAccess extends PickOptions {
  api: PickerApi;
  token: string;
  apiKey: string;
  appId: string;
}

export function showPicker(kind: PickKind, access: PickerAccess): Promise<DriveItem | null> {
  const { api } = access;
  return new Promise((resolve) => {
    const view = new api.DocsView(api.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(kind === 'folder')
      .setMode(api.DocsViewMode.LIST);
    if (kind === 'folder') view.setParent('root').setMimeTypes(FOLDER_TYPE);
    else view.setMimeTypes(OPENABLE_TYPES.join(','));
    const picker = new api.PickerBuilder()
      .setLocale(access.language)
      .setTitle(access.title)
      .setDeveloperKey(access.apiKey)
      .setAppId(access.appId)
      .setOAuthToken(access.token)
      .setOrigin(window.location.origin)
      .addView(view)
      .setCallback((result) => {
        if (result.action !== 'picked' && result.action !== 'cancel') return;
        picker.dispose();
        resolve(result.action === 'picked' ? (result.docs?.[0] ?? null) : null);
      })
      .build();
    picker.setVisible(true);
  });
}
