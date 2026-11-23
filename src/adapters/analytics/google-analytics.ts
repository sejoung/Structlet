import { onLogEntry, type LogEntry } from '../diagnostics/log';
import { readItem, removeItem, writeItem } from '../storage/web-storage';
import { usageEvent } from './usage-events';

export const CONSENT_KEY = 'structlet.usage-stats';
export const GTAG_URL = 'https://www.googletagmanager.com/gtag/js';
export const MAX_ERROR_EVENTS = 20;

export type Consent = 'granted' | 'denied';

export interface UsageStats {
  readonly consent: Consent | null;
  choose(consent: Consent): void;
}

type Gtag = (...args: unknown[]) => void;
type TaggedWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag } & Record<string, unknown>;

const readConsent = (): Consent | null => {
  const stored = readItem(CONSENT_KEY);
  return stored === 'granted' || stored === 'denied' ? stored : null;
};

function removeCookies(document: Document, measurementId: string) {
  const labels = document.location.hostname.split('.');
  const domains = ['', ...labels.map((_, index) => `; domain=${labels.slice(index).join('.')}`)];
  for (const name of ['_ga', `_ga_${measurementId.slice(2)}`])
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
}

export class GoogleAnalytics implements UsageStats {
  #consent: Consent | null = readConsent();
  #started = false;
  #errors = 0;

  constructor(
    private readonly measurementId: string,
    private readonly page: Window = window,
  ) {
    if (this.#consent === 'granted') this.#start();
    onLogEntry((entry) => this.#forward(entry));
    page.addEventListener('storage', (event) => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      const consent = readConsent();
      if (consent !== this.#consent) this.#apply(consent);
    });
  }

  get consent(): Consent | null {
    return this.#consent;
  }

  choose(consent: Consent): void {
    if (!writeItem(CONSENT_KEY, consent) && consent === 'denied') removeItem(CONSENT_KEY);
    this.#apply(consent);
  }

  #apply(consent: Consent | null) {
    this.#consent = consent;
    const page = this.page as TaggedWindow;
    const granted = consent === 'granted';
    page[`ga-disable-${this.measurementId}`] = !granted;
    if (!granted) {
      if (this.#started) this.#gtag('consent', 'update', { analytics_storage: 'denied' });
      removeCookies(page.document, this.measurementId);
    } else if (this.#started) this.#gtag('consent', 'update', { analytics_storage: 'granted' });
    else this.#start();
  }

  #gtag(...args: unknown[]) {
    (this.page as TaggedWindow).gtag?.(...args);
  }

  #start() {
    this.#started = true;
    const page = this.page as TaggedWindow;
    page.dataLayer = page.dataLayer ?? [];
    const layer = page.dataLayer;
    page.gtag = function gtag() {
      layer.push(arguments);
    };
    const { origin, pathname } = page.location;
    this.#gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    this.#gtag('js', new Date());
    this.#gtag('config', this.measurementId, {
      page_location: `${origin}${pathname}`,
      page_title: 'Structlet',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = page.document.createElement('script');
    script.async = true;
    script.src = `${GTAG_URL}?id=${encodeURIComponent(this.measurementId)}`;
    page.document.head.append(script);
  }

  #forward(entry: LogEntry) {
    if (!this.#started || this.#consent !== 'granted') return;
    const event = usageEvent(entry);
    if (!event) return;
    if (event.name === 'app_error' && ++this.#errors > MAX_ERROR_EVENTS) return;
    this.#gtag('event', event.name, event.params);
  }
}
