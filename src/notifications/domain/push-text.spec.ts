import { formatMoney, pushText } from './push-text.js';

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
});

describe('pushText', () => {
  it('says a threshold alert in pesos', () => {
    expect(pushText(notification(), names)).toEqual({
      title: 'Leche entera 1 L bajó a $ 1.390',
      body: 'En Día Almagro, por debajo del precio que pediste.',
    });
  });

  it('says a drop with its percentage and the old price, in euros', () => {
    expect(
      pushText(
        notification({ reason: 'PRICE_DROP', priceCents: 115, previousPriceCents: 129, currency: 'EUR' }),
        { productName: 'Leche entera 1 L', storeName: 'Hofer' },
      ),
    ).toEqual({ title: 'Leche entera 1 L: −10%', body: 'Hofer lo tiene a € 1,15, antes € 1,29.' });
  });

  it('says cheaper nearby', () => {
    expect(pushText(notification({ reason: 'CHEAPER_NEARBY' }), names).title).toBe(
      'Leche entera 1 L más barato cerca',
    );
  });

  it('keeps the message\'s own words when there are no facts', () => {
    expect(pushText(notification({ reason: null, priceCents: null, currency: null }), names)).toEqual({
      title: 'English title',
      body: 'English body',
    });
  });
});
