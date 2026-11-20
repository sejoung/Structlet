/** `Plan.structlet` → `Plan (2).structlet`: the first numbered name not in `taken`. */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Whether `name` is `wanted` or a numbered copy of it, so a numbered file keeps its number. */
export function isNameFor(name: string, wanted: string): boolean {
  if (name === wanted) return true;
  const dot = wanted.lastIndexOf('.');
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : '';
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escape(stem)} \\(\\d+\\)${escape(ext)}$`).test(name);
}
