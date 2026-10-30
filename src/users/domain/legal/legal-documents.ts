import type { Language } from '../../../common/i18n/language.js';
import { LEGAL_DE } from './legal-de.js';
import { LEGAL_EN } from './legal-en.js';
import { LEGAL_ES } from './legal-es.js';
import { LEGAL_PT } from './legal-pt.js';

/**
 * The terms a shopper accepts. Raised whenever the terms change in a way
 * people must agree to again; accounts that accepted an older one are asked
 * again in the app.
 */
export const TERMS_VERSION = '2026-10-30';

export const LEGAL_DOCUMENTS = ['terms', 'privacy', 'credits'] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** A page: its title and paragraphs ("## " starts a heading). */
export interface LegalText {
  title: string;
  draftNotice: string;
  body: (contact: string) => string[];
}

export type LegalSet = Record<LegalDocument, LegalText> & { contactPending: string };

const BY_LANGUAGE: Record<Language, LegalSet> = { es: LEGAL_ES, en: LEGAL_EN, de: LEGAL_DE, pt: LEGAL_PT };

export const legalText = (language: Language): LegalSet => BY_LANGUAGE[language];
