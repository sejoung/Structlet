import { RemoteError, type RemoteFailure } from '../../domain';

const RATE_LIMITS = ['rateLimitExceeded', 'userRateLimitExceeded', 'sharingRateLimitExceeded'];
const FULL = ['storageQuotaExceeded', 'quotaExceeded'];

const STATUS_FAILURES: Record<number, RemoteFailure> = { 401: 'auth', 403: 'permission', 404: 'missing', 409: 'conflict', 412: 'conflict' };

export async function failureOf(response: Response): Promise<RemoteError> {
  const status = `Drive answered ${response.status}`;
  if (response.status !== 403) return new RemoteError(STATUS_FAILURES[response.status] ?? 'network', `${status}.`);
  const body = (await response.json().catch(() => null)) as { error?: { errors?: { reason?: unknown }[] } } | null;
  const reason = String(body?.error?.errors?.[0]?.reason ?? '');
  const failure = RATE_LIMITS.includes(reason) ? 'network' : FULL.includes(reason) ? 'full' : 'permission';
  return new RemoteError(failure, reason ? `${status} (${reason}).` : `${status}.`);
}

export function multipart(metadata: object, content: string, contentType: string) {
  const boundary = `structlet-${crypto.randomUUID()}`;
  return {
    type: `multipart/related; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`,
  };
}
