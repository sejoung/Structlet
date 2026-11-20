/** Per-browser conveniences in localStorage; reading never fails, writing may be ignored. */

export const PANELS_KEY = 'structlet:panels';
export type Panels = { left: boolean; right: boolean };

export function storedPanels(): Panels {
  try {
    const v = JSON.parse(localStorage.getItem(PANELS_KEY) ?? 'null');
    if (v && typeof v.left === 'boolean' && typeof v.right === 'boolean') return v;
  } catch {
    // per-browser convenience only
  }
  // The inspector starts folded: an empty canvas has nothing to inspect. It opens from its
  // top-bar toggle or `I`, and the toggle shows how many checks found something.
  return { left: true, right: false };
}

export const RECENT_KEY = 'structlet:recent-services';

export function storedRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // per-browser convenience only
  }
}
