import { emailFooter, formatMoney, messageText, testPush } from './message-text.js';

const notification = (overrides = {}) => ({
  title: 'English title',
  body: 'English body',
  reason: 'BELOW_THRESHOLD' as const,
  priceCents: 139000,
  previousPriceCents: 150000,
  currency: 'ARS',
  ...overrides,
});
const names = { productName: 'Leche entera 1 L', storeName: 'Día Almagro' };

describe('formatMoney', () => {
  it('writes pesos without empty cents and euros with them', () => {
    expect(formatMoney(139000, 'ARS')).toBe('$ 1.390');
    expect(formatMoney(139050, 'ARS')).toBe('$ 1.390,50');
    expect(formatMoney(115, 'EUR')).toBe('€ 1,15');
    expect(formatMoney(200, 'EUR')).toBe('€ 2,00');
    expect(formatMoney(5000, 'BRL')).toBe('BRL 50,00');
  });

  it('writes them the way English and German readers do, as the app does', () => {
    expect(formatMoney(139000, 'ARS', 'en')).toBe('AR$1,390');
    expect(formatMoney(115, 'EUR', 'en')).toBe('€1.15');
    expect(formatMoney(139000, 'ARS', 'de')).toBe('1.390\u00a0ARS');
    expect(formatMoney(115, 'EUR', 'de')).toBe('1,15\u00a0€');
    expect(formatMoney(139000, 'ARS', 'pt')).toBe('AR$ 1.390');
    expect(formatMoney(1990, 'BRL', 'pt')).toBe('R$ 19,90');
  });
});

describe('messageText', () => {
  it('says a threshold alert in pesos', () => {
    expect(messageText(notification(), names)).toEqual({
      title: 'Leche entera 1 L bajó a $ 1.390',
      body: 'En Día Almagro, por debajo del precio que pediste.',
    });
  });

  it('says a drop with its percentage and the old price, in euros', () => {
    expect(
      messageText(
        notification({ reason: 'PRICE_DROP', priceCents: 115, previousPriceCents: 129, currency: 'EUR' }),
        { productName: 'Leche entera 1 L', storeName: 'Hofer' },
      ),
    ).toEqual({ title: 'Leche entera 1 L: −10%', body: 'Hofer lo tiene a € 1,15, antes € 1,29.' });
  });

  it('says cheaper nearby', () => {
    expect(messageText(notification({ reason: 'CHEAPER_NEARBY' }), names).title).toBe(
      'Leche entera 1 L más barato cerca',
    );
  });

  it('keeps the message\'s own words when there are no facts', () => {
    expect(messageText(notification({ reason: null, priceCents: null, currency: null }), names)).toEqual({
      title: 'English title',
      body: 'English body',
    });
  });

  it('speaks English', () => {
    expect(
      messageText(
        notification({ reason: 'PRICE_DROP', priceCents: 115, previousPriceCents: 129, currency: 'EUR' }),
        { productName: 'Whole milk 1 L', storeName: 'Hofer' },
        'en',
      ),
    ).toEqual({ title: 'Whole milk 1 L: −10%', body: 'Hofer has it at €1.15, was €1.29.' });
  });

  it('speaks German, naming a nearby shop when the alert has none', () => {
    expect(
      messageText(notification({ currency: 'EUR', priceCents: 115 }), { productName: 'Vollmilch 1 L', storeName: null }, 'de'),
    ).toEqual({
      title: 'Vollmilch 1 L ist auf 1,15\u00a0€ gefallen',
      body: 'In einem Supermarkt in deiner Nähe, unter dem gewünschten Preis.',
    });
  });
});

describe('the other words outside the app', () => {
  it('ends an email with why it came and how to stop it, in the shopper\'s language', () => {
    expect(emailFooter('es', 'https://x.test/u')).toEqual([
      '—',
      'Te llega porque activaste los avisos por email en Garner.',
      'Dejar de recibir estos emails: https://x.test/u',
    ]);
    expect(emailFooter('de', 'https://x.test/u')[2]).toBe('Diese E-Mails abbestellen: https://x.test/u');
  });

  it('speaks Portuguese', () => {
    expect(messageText(notification(), names, 'pt')).toEqual({
      title: 'Leche entera 1 L caiu para AR$ 1.390',
      body: 'Em Día Almagro, abaixo do preço que você pediu.',
    });
  });

  it('writes the test push in each language', () => {
    expect(testPush('en')).toEqual({ title: 'Garner', body: 'If you can see this, alerts work on this phone.' });
  });
});
