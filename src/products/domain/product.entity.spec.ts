import { normalizeProductName } from './product.entity.js';

describe('normalizeProductName', () => {
  it('makes an accented name findable by an unaccented query', () => {
    expect(normalizeProductName('Leche La Serenísima Entera')).toBe(
      'leche la serenisima entera',
    );
  });

  it('gives two spellings of the same product the same matching key', () => {
    expect(normalizeProductName('Café  MOLIDO')).toBe(
      normalizeProductName('cafe molido'),
    );
  });
});
