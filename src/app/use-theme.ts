import { useEffect, useState } from 'react';
import { DARK_THEME, LIGHT_THEME, type DiagramTheme } from '../engine';
import type { ThemeChoice } from '../components/Toolbar';

const KEY = 'structlet:theme';

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
  }
  return 'system';
}

export function useTheme(): { choice: ThemeChoice; setChoice(c: ThemeChoice): void; resolved: 'light' | 'dark'; diagram: DiagramTheme } {
  const [choice, setChoiceState] = useState<ThemeChoice>(stored);
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [systemDark, setSystemDark] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  const resolved = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
    }
  };
  return { choice, setChoice, resolved, diagram: resolved === 'dark' ? DARK_THEME : LIGHT_THEME };
}
