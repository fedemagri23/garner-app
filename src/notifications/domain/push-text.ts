import type { Notification } from './price-alert.entity.js';

const SYMBOLS: Record<string, string> = { ARS: '$', EUR: '€', USD: 'US$' };

const thousands = (whole: number) =>
  String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * A price the way the app writes it: "$ 1.320", "€ 1,15". Pesos hide a
 * round number's cents, euros always show them; an unknown currency shows
 * its code.
 */
export function formatMoney(cents: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? currency;
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const showCents = currency !== 'ARS' || fraction !== 0;

  return `${symbol} ${thousands(whole)}${showCents ? `,${String(fraction).padStart(2, '0')}` : ''}`;
}

/**
 * What a phone's lock screen shows for a price alert: Spanish, with the
 * price in its currency. The server writes it because push goes out while the
 * app is closed, with no screen of the app to compose it — and the app's own
 * inbox writes the same words from the same facts. A message without facts
 * (a reminder, or one from before they were kept) keeps its own text.
 */
export function pushText(
  notification: Pick<
    Notification,
    'title' | 'body' | 'reason' | 'priceCents' | 'previousPriceCents' | 'currency'
  >,
  names: { productName: string | null; storeName: string | null },
): { title: string; body: string } {
  const { reason, priceCents, previousPriceCents, currency } = notification;

  if (!reason || priceCents === null || currency === null || !names.productName) {
    return { title: notification.title, body: notification.body };
  }

  const price = formatMoney(priceCents, currency);
  const where = names.storeName ?? 'un súper cerca tuyo';
  const fell =
    previousPriceCents !== null && previousPriceCents > priceCents
      ? Math.floor(((previousPriceCents - priceCents) / previousPriceCents) * 100)
      : null;

  switch (reason) {
    case 'BELOW_THRESHOLD':
      return {
        title: `${names.productName} bajó a ${price}`,
        body: `En ${where}, por debajo del precio que pediste.`,
      };
    case 'PRICE_DROP':
      return {
        title: fell ? `${names.productName}: −${fell}%` : `${names.productName} bajó de precio`,
        body:
          fell !== null && previousPriceCents !== null
            ? `${where} lo tiene a ${price}, antes ${formatMoney(previousPriceCents, currency)}.`
            : `${where} lo tiene a ${price}.`,
      };
    case 'CHEAPER_NEARBY':
      return {
        title: `${names.productName} más barato cerca`,
        body: `${where} es ahora el más barato cerca tuyo, a ${price}.`,
      };
  }
}
