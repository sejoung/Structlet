export type LogLevel = 'info' | 'warn' | 'error';
export type LogValue = string | number | boolean | null | undefined;

export interface LogEntry {
  readonly at: number;
  readonly level: LogLevel;
  readonly event: string;
  readonly details: Readonly<Record<string, LogValue>>;
}

const KEEP = 200;
const entries: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();

function write(level: LogLevel, event: string, details: Record<string, LogValue> = {}) {
  const entry: LogEntry = { at: Date.now(), level, event, details };
  entries.push(entry);
  if (entries.length > KEEP) entries.shift();
  for (const l of listeners) {
    try {
      l(entry);
    } catch {
    }
  }
}

export const log = {
  info: (event: string, details?: Record<string, LogValue>) => write('info', event, details),
  warn: (event: string, details?: Record<string, LogValue>) => write('warn', event, details),
  error: (event: string, details?: Record<string, LogValue>) => write('error', event, details),
};

export function onLogEntry(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recentEntries(): readonly LogEntry[] {
  return [...entries];
}

export function errorDetails(error: unknown, withMessage = true): Record<string, LogValue> {
  const e = error instanceof Error ? error : new Error(String(error));
  const reason = (e as { reason?: unknown }).reason;
  return { name: e.name, ...(typeof reason === 'string' ? { reason } : {}), ...(withMessage ? { message: e.message.slice(0, 200) } : {}) };
}
