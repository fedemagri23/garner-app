import type { Language } from '../../common/i18n/language.js';
import type { Notification } from './price-alert.entity.js';

/**
 * How each language writes money, the way the app does (garner-mobile
 * `formatPrice`): "$ 1.390" / "AR$1,390" / "1.390 ARS", "€ 1,15" / "€1.15" /
 * "1,15 €". Written out rather than left to `Intl`, which differs between
 * engines in exactly these details.
 */
const STYLES: Record<
  Language,
  { group: string; decimal: string; symbolAfter: boolean; space: string; symbols: Record<string, string> }
> = {
  es: { group: '.', decimal: ',', symbolAfter: false, space: ' ', symbols: { ARS: '$', EUR: '€', USD: 'US$' } },
  en: { group: ',', decimal: '.', symbolAfter: false, space: '', symbols: { ARS: 'AR$', EUR: '€', USD: 'US$' } },
  de: { group: '.', decimal: ',', symbolAfter: true, space: ' ', symbols: { ARS: 'ARS', EUR: '€', USD: 'US$' } },
};

/**
 * A price as the shopper's language writes it. Pesos hide a round number's
 * cents, other currencies always show them; an unknown currency shows its
 * code before the number.
 */
export function formatMoney(cents: number, currency: string, language: Language = 'es'): string {
  const style = STYLES[language];
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const showCents = currency !== 'ARS' || fraction !== 0;
  const number =
    String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, style.group) +
    (showCents ? `${style.decimal}${String(fraction).padStart(2, '0')}` : '');
  const symbol = style.symbols[currency];

  if (symbol === undefined) return `${currency} ${number}`;
  return style.symbolAfter ? `${number}${style.space}${symbol}` : `${symbol}${style.space}${number}`;
}

interface Phrases {
  somewhere: string;
  belowTitle: (product: string, price: string) => string;
  /** Null when the alert names no shop. */
  belowBody: (store: string | null) => string;
  dropTitle: (product: string, percent: number | null) => string;
  dropBody: (where: string, price: string, before: string | null) => string;
  nearbyTitle: (product: string) => string;
  nearbyBody: (where: string, price: string) => string;
  emailWhy: string;
  emailStop: (url: string) => string;
  testBody: string;
}

/** The app's own words for the same facts (its `alerts.messages` catalog). */
const PHRASES: Record<Language, Phrases> = {
  es: {
    somewhere: 'un súper cerca tuyo',
    belowTitle: (product, price) => `${product} bajó a ${price}`,
    belowBody: (store) => `En ${store ?? 'un súper cerca tuyo'}, por debajo del precio que pediste.`,
    dropTitle: (product, percent) => (percent ? `${product}: −${percent}%` : `${product} bajó de precio`),
    dropBody: (where, price, before) => (before ? `${where} lo tiene a ${price}, antes ${before}.` : `${where} lo tiene a ${price}.`),
    nearbyTitle: (product) => `${product} más barato cerca`,
    nearbyBody: (where, price) => `${where} es ahora el más barato cerca tuyo, a ${price}.`,
    emailWhy: 'Te llega porque activaste los avisos por email en Garner.',
    emailStop: (url) => `Dejar de recibir estos emails: ${url}`,
    testBody: 'Si ves esto, los avisos funcionan en este teléfono.',
  },
  en: {
    somewhere: 'a supermarket near you',
    belowTitle: (product, price) => `${product} dropped to ${price}`,
    belowBody: (store) => `At ${store ?? 'a supermarket near you'}, below the price you asked for.`,
    dropTitle: (product, percent) => (percent ? `${product}: −${percent}%` : `${product} dropped in price`),
    dropBody: (where, price, before) => (before ? `${where} has it at ${price}, was ${before}.` : `${where} has it at ${price}.`),
    nearbyTitle: (product) => `${product} cheaper nearby`,
    nearbyBody: (where, price) => `${where} is now the cheapest near you, at ${price}.`,
    emailWhy: 'You are receiving this because you turned on email alerts in Garner.',
    emailStop: (url) => `Stop these emails: ${url}`,
    testBody: 'If you can see this, alerts work on this phone.',
  },
  de: {
    somewhere: 'ein Supermarkt in deiner Nähe',
    belowTitle: (product, price) => `${product} ist auf ${price} gefallen`,
    belowBody: (store) =>
      store ? `Bei ${store}, unter dem gewünschten Preis.` : 'In einem Supermarkt in deiner Nähe, unter dem gewünschten Preis.',
    dropTitle: (product, percent) => (percent ? `${product}: −${percent}%` : `${product} ist günstiger geworden`),
    dropBody: (where, price, before) => (before ? `${where} hat es für ${price}, vorher ${before}.` : `${where} hat es für ${price}.`),
    nearbyTitle: (product) => `${product} in der Nähe günstiger`,
    nearbyBody: (where, price) => `${where} ist jetzt der günstigste in deiner Nähe, für ${price}.`,
    emailWhy: 'Du bekommst diese E-Mail, weil du E-Mail-Benachrichtigungen in Garner aktiviert hast.',
    emailStop: (url) => `Diese E-Mails abbestellen: ${url}`,
    testBody: 'Wenn du das siehst, funktionieren Benachrichtigungen auf diesem Handy.',
  },
};

/**
 * What a price alert says outside the app — on a lock screen or in an email —
 * in the shopper's language, with the price in its currency. The server
 * writes it because those go out while the app is closed; the app's inbox
 * writes the same words from the same facts. A message without facts (a
 * reminder, or one from before they were kept) keeps its own text.
 */
export function messageText(
  notification: Pick<
    Notification,
    'title' | 'body' | 'reason' | 'priceCents' | 'previousPriceCents' | 'currency'
  >,
  names: { productName: string | null; storeName: string | null },
  language: Language = 'es',
): { title: string; body: string } {
  const { reason, priceCents, previousPriceCents, currency } = notification;

  if (!reason || priceCents === null || currency === null || !names.productName) {
    return { title: notification.title, body: notification.body };
  }

  const words = PHRASES[language];
  const price = formatMoney(priceCents, currency, language);
  const where = names.storeName ?? words.somewhere;
  const fell =
    previousPriceCents !== null && previousPriceCents > priceCents
      ? Math.floor(((previousPriceCents - priceCents) / previousPriceCents) * 100)
      : null;

  switch (reason) {
    case 'BELOW_THRESHOLD':
      return { title: words.belowTitle(names.productName, price), body: words.belowBody(names.storeName) };
    case 'PRICE_DROP':
      return {
        title: words.dropTitle(names.productName, fell),
        body: words.dropBody(
          where,
          price,
          fell !== null && previousPriceCents !== null ? formatMoney(previousPriceCents, currency, language) : null,
        ),
      };
    case 'CHEAPER_NEARBY':
      return { title: words.nearbyTitle(names.productName), body: words.nearbyBody(where, price) };
  }
}

/** The lines under every alert email: why it came, and the one-click way out. */
export const emailFooter = (language: Language, unsubscribeUrl: string): string[] => [
  '—',
  PHRASES[language].emailWhy,
  PHRASES[language].emailStop(unsubscribeUrl),
];

/** The test push, so a shopper can see push working on their phone. */
export const testPush = (language: Language) => ({ title: 'Garner', body: PHRASES[language].testBody });
