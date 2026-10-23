import { categoryForTags, chooseBrand, chooseName, parseQuantity } from './product-facts.js';

describe('parseQuantity', () => {
  it('reads sizes as packages print them', () => {
    expect(parseQuantity('500 g')).toEqual({ packageSize: 500, unit: 'GRAM' });
    expect(parseQuantity('500g')).toEqual({ packageSize: 500, unit: 'GRAM' });
    expect(parseQuantity('1,5 l')).toEqual({ packageSize: 1.5, unit: 'LITER' });
    expect(parseQuantity('1.5 L')).toEqual({ packageSize: 1.5, unit: 'LITER' });
    expect(parseQuantity('1 kg')).toEqual({ packageSize: 1, unit: 'KILOGRAM' });
    expect(parseQuantity('750 ml')).toEqual({ packageSize: 750, unit: 'MILLILITER' });
    expect(parseQuantity('12 u')).toEqual({ packageSize: 12, unit: 'UNIT' });
  });

  it('turns centilitres into millilitres', () => {
    expect(parseQuantity('70 cl')).toEqual({ packageSize: 700, unit: 'MILLILITER' });
  });

  it('leaves what it cannot read with confidence for the shopper', () => {
    for (const text of [null, '', '6 x 330 ml', '500 g (2 x 250 g)', '16 oz', 'grande', '0 g']) {
      expect(parseQuantity(text)).toBeNull();
    }
  });
});

describe('chooseName', () => {
  const facts = { names: { default: 'Lait demi-écrémé', es: 'Leche semidescremada', de: 'Halbfettmilch' } };

  it('prefers the shopper’s language, then the product’s own name', () => {
    expect(chooseName(facts, 'de')).toBe('Halbfettmilch');
    expect(chooseName(facts, 'en')).toBe('Lait demi-écrémé');
    expect(chooseName({ names: {} }, 'es')).toBeNull();
  });
});

it('takes the first brand listed', () => {
  expect(chooseBrand({ brands: [' ', 'Havanna', 'Grupo X'] })).toBe('Havanna');
  expect(chooseBrand({ brands: [] })).toBeNull();
});

describe('categoryForTags', () => {
  const dairy = { slug: 'lacteos', parentId: null, offTags: ['en:dairies'] };
  const milk = { slug: 'leche', parentId: 'lacteos', offTags: ['en:milks'] };
  const yogurt = { slug: 'yogures', parentId: 'lacteos', offTags: ['en:yogurts'] };
  const drinks = { slug: 'bebidas', parentId: null, offTags: ['en:beverages'] };
  const categories = [dairy, milk, yogurt, drinks];

  it('maps their most specific tag to our aisle', () => {
    expect(categoryForTags(categories, ['en:dairies', 'en:milks', 'en:whole-milks'])?.slug).toBe('leche');
    expect(categoryForTags(categories, ['en:dairies', 'en:fermented-foods', 'en:yogurts'])?.slug).toBe('yogures');
  });

  it('falls back to the department when no aisle matches', () => {
    expect(categoryForTags(categories, ['en:dairies', 'en:cheeses'])?.slug).toBe('lacteos');
  });

  it('leaves the choice to the shopper when nothing matches', () => {
    expect(categoryForTags(categories, ['en:frozen-foods'])).toBeNull();
  });
});
