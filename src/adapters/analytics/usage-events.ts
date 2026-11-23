import type { LogEntry, LogValue } from '../diagnostics/log';

export type EventParams = Readonly<Record<string, string | number | boolean>>;

export interface UsageEvent {
  readonly name: string;
  readonly params: EventParams;
}

/**
 * Log entries sent as usage statistics (ADR 0017), by their log event name: the event they
 * are sent as, and the details that go along. Everything else stays in the browser. A
 * detail is sent only when it is a short code word or a number, so diagram text can never
 * ride along.
 */
const USAGE: Readonly<Record<string, { name: string; params?: readonly string[] }>> = {
  'files.new': { name: 'diagram_created' },
  'files.sample-downloaded': { name: 'sample_downloaded' },
  'files.opened': { name: 'file_opened' },
  'files.saved': { name: 'file_saved', params: ['target'] },
  'files.exported': { name: 'image_exported', params: ['format', 'view'] },
  'files.imported': { name: 'diagram_imported', params: ['source'] },
  'packs.loaded': { name: 'icon_pack_loaded', params: ['provider'] },
  'drive.connected': { name: 'drive_connected' },
  'drive.created': { name: 'drive_file_created' },
  'drive.opened': { name: 'drive_file_opened' },
  'view.changed': { name: 'view_changed', params: ['view'] },
  'view.presenting': { name: 'view_mode_used' },
};

const CODE_WORD = /^[\w.-]{1,40}$/;

function sendable(value: LogValue): value is string | number | boolean {
  if (typeof value === 'string') return CODE_WORD.test(value);
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'boolean';
}

/**
 * The usage event a log entry is sent as, or null. Errors are sent by their event name only
 * (`app_error` with `error_event`), never with their message, which may quote user text.
 */
export function usageEvent(entry: LogEntry): UsageEvent | null {
  if (entry.level === 'error') return { name: 'app_error', params: { error_event: entry.event } };
  const usage = Object.hasOwn(USAGE, entry.event) ? USAGE[entry.event] : undefined;
  if (!usage) return null;
  const params: Record<string, string | number | boolean> = {};
  for (const key of usage.params ?? []) {
    const value = entry.details[key];
    if (sendable(value)) params[key] = value;
  }
  return { name: usage.name, params };
}
