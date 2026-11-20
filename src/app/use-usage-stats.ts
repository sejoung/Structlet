import { useState } from 'react';
import type { Consent, UsageStats } from '../adapters/analytics/google-analytics';

/** The user's choice about usage statistics, for the banner and the settings menu. */
export function useUsageStats(stats: UsageStats | undefined) {
  const [consent, setConsent] = useState<Consent | null>(() => stats?.consent ?? null);
  if (!stats) return null;
  const choose = (next: Consent) => {
    stats.choose(next);
    setConsent(next);
  };
  return {
    undecided: consent === null,
    granted: consent === 'granted',
    choose,
    toggle: () => choose(consent === 'granted' ? 'denied' : 'granted'),
  };
}
