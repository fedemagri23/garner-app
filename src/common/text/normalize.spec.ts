import { normalizeText, slugify } from './normalize.js';

describe('normalizeText', () => {
  it('strips accents so an unaccented query matches an accented name', () => {
    expect(normalizeText('La Serenísima')).toBe('la serenisima');
  });

  it('collapses and trims whitespace', () => {
    expect(normalizeText('  Leche   Entera \n')).toBe('leche entera');
  });

  it('is idempotent', () => {
    const once = normalizeText('Café  Molido');
    expect(normalizeText(once)).toBe(once);
  });
});

describe('slugify', () => {
  it('produces a hyphenated ascii identifier', () => {
    expect(slugify('Lácteos y Derivados')).toBe('lacteos-y-derivados');
  });

  it('drops leading and trailing separators', () => {
    expect(slugify('  ¡Ofertas!  ')).toBe('ofertas');
  });
});
