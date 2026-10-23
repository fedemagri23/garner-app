/**
 * The languages the app speaks, and so the ones the server writes in for
 * text that reaches people outside the app: push notifications and email.
 * Spanish (Argentina) is where Garner started and what an account without a
 * choice gets.
 */
export const LANGUAGES = ['es', 'en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'es';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/** A stored or sent value as a language we speak, falling back to Spanish. */
export const asLanguage = (value: unknown): Language => (isLanguage(value) ? value : DEFAULT_LANGUAGE);

/** Names in the other languages, keyed by language; Spanish is the name itself. */
export type Translations = Partial<Record<Exclude<Language, 'es'>, string>>;

/** Stored translations, keeping only non-empty names in languages we speak. */
export function asTranslations(value: unknown): Translations {
  if (typeof value !== 'object' || value === null) return {};
  const out: Translations = {};
  for (const language of ['en', 'de'] as const) {
    const name = (value as Record<string, unknown>)[language];
    if (typeof name === 'string' && name.trim()) out[language] = name.trim();
  }
  return out;
}
