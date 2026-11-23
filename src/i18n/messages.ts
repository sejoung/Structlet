import { en, type MessageKey } from './en';
import { ko } from './ko';

export type { MessageKey };
export type Language = 'ko' | 'en';

const catalogs: Record<Language, Record<MessageKey, string>> = { en, ko };

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(language: Language): Translate {
  const messages = catalogs[language];
  return (key, params) => {
    let text = messages[key] ?? en[key];
    if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
}

export function messageKeys(language: Language): string[] {
  return Object.keys(catalogs[language]);
}

export function pickLanguage(tag: string | undefined): Language {
  return tag?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}
