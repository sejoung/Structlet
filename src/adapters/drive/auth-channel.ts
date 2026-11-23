export type AuthMessage =
  | { type: 'request' }
  | { type: 'token'; token: string; expiresIn: number }
  | { type: 'expired'; token: string }
  | { type: 'disconnected'; forget: boolean };

export interface AuthChannel {
  post(message: AuthMessage): void;
  listen(receive: (message: AuthMessage) => void): void;
}

export function parseAuthMessage(value: unknown): AuthMessage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const token = typeof data.token === 'string' && data.token ? data.token : null;
  if (data.type === 'request') return { type: 'request' };
  if (data.type === 'disconnected') return { type: 'disconnected', forget: data.forget === true };
  if (data.type === 'expired' && token) return { type: 'expired', token };
  if (
    data.type === 'token' &&
    token &&
    typeof data.expiresIn === 'number' &&
    Number.isFinite(data.expiresIn) &&
    data.expiresIn > 0
  )
    return { type: 'token', token, expiresIn: data.expiresIn };
  return null;
}

export function openAuthChannel(clientId: string): AuthChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const channel = new BroadcastChannel(`structlet:auth:${clientId}`);
    return {
      post: (message) => {
        try {
          channel.postMessage(message);
        } catch {
        }
      },
      listen: (receive) => {
        channel.onmessage = (event: MessageEvent) => {
          const message = parseAuthMessage(event.data);
          if (message) receive(message);
        };
      },
    };
  } catch {
    return null;
  }
}
