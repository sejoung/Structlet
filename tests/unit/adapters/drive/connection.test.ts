// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAuthMessage, type AuthChannel, type AuthMessage } from '../../../../src/adapters/drive/auth-channel';
import { driveConfig, webOrigin } from '../../../../src/adapters/drive/config';
import { GoogleConnection, RENEW_BEFORE } from '../../../../src/adapters/drive/google';
import type { AuthEvent } from '../../../../src/adapters/drive/types';

const config = { clientId: 'c', apiKey: 'k', appId: 'a' };

function bus() {
  const tabs: ((m: AuthMessage) => void)[] = [];
  const channel = (): AuthChannel => {
    let mine: ((m: AuthMessage) => void) | null = null;
    return {
      post: (m) => tabs.filter((t) => t !== mine).forEach((t) => t(m)),
      listen: (receive) => {
        mine = receive;
        tabs.push(receive);
      },
    };
  };
  return channel;
}

beforeEach(() => {
  vi.useFakeTimers();
  (window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (c: { callback: (r: { access_token: string; expires_in: number }) => void }) => ({ requestAccessToken: () => c.callback({ access_token: 'token-1', expires_in: 3600 }) }),
        revoke: (_t: string, cb: (r: { successful: boolean }) => void) => cb({ successful: true }),
      },
    },
  };
});
afterEach(() => vi.useRealTimers());

describe('Google connection', () => {
  it('keeps the token in memory, announces renewal and expiry', async () => {
    const events: AuthEvent[] = [];
    const g = new GoogleConnection(config);
    g.subscribe((e) => events.push(e));
    await g.connect();
    expect(g.getToken()).toBe('token-1');
    expect(localStorage.length).toBe(0);
    vi.advanceTimersByTime(3600_000 - 30_000 - RENEW_BEFORE + 1);
    expect(g.expiring()).toBe(true);
    vi.advanceTimersByTime(RENEW_BEFORE);
    expect(g.getToken()).toBeNull();
    expect(events).toEqual(['connected', 'expiring', 'expired']);
  });

  it('hands the token to a new tab and disconnects every tab', async () => {
    const channel = bus();
    const first = new GoogleConnection(config, channel());
    await first.connect();
    const second = new GoogleConnection(config, channel());
    expect(second.getToken()).toBe('token-1');
    const events: AuthEvent[] = [];
    second.subscribe((e) => events.push(e));
    await first.disconnect(true);
    expect(second.getToken()).toBeNull();
    expect(events).toEqual(['forgotten']);
  });

  it('accepts only well-formed channel messages', () => {
    expect(parseAuthMessage({ type: 'token', token: 't', expiresIn: 5 })).toEqual({ type: 'token', token: 't', expiresIn: 5 });
    expect(parseAuthMessage({ type: 'token', token: 't', expiresIn: -1 })).toBeNull();
    expect(parseAuthMessage({ type: 'evil' })).toBeNull();
  });

  it('is configured only with all three values, and only on a web origin', () => {
    expect(driveConfig({ VITE_GOOGLE_CLIENT_ID: 'c', VITE_GOOGLE_API_KEY: 'k', VITE_GOOGLE_APP_ID: 'a' })).toEqual(config);
    expect(driveConfig({ VITE_GOOGLE_CLIENT_ID: 'c', VITE_GOOGLE_API_KEY: ' ' , VITE_GOOGLE_APP_ID: 'a' })).toBeNull();
    expect(webOrigin({ protocol: 'https:' })).toBe(true);
    expect(webOrigin({ protocol: 'file:' })).toBe(false);
  });
});
