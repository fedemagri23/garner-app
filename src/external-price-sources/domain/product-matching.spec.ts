import type { Product } from '../../products/domain/product.entity.js';
import type { ExternalProduct } from './price-source-adapter.port.js';
import {
  externalBarcode,
  externalMatchKey,
  matchExternalProduct,
  normalizeExternalUnit,
} from './product-matching.js';

const product = (overrides: Partial<Product> & { id: string }): Product => ({
  name: 'Leche Entera 1L',
  normalizedName: 'leche entera 1l',
  description: null,
  brand: null,
  category: { id: 'cat', name: 'Lácteos', slug: 'lacteos', parentId: null },
  packageSize: 1,
  unit: 'LITER',
  imageUrl: null,
  isActive: true,
  barcodes: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const external = (overrides: Partial<ExternalProduct> = {}): ExternalProduct => ({
  externalId: 'SKU-1',
  name: 'Leche Entera 1L',
  packageSize: 1,
  unit: 'L',
  ...overrides,
});

const noCandidates = {
  linkedProductId: null,
  byBarcode: null,
  byNormalizedName: [],
};

describe('matchExternalProduct', () => {
  it('prefers a link established earlier, so a rename does not move the match', () => {
    expect(
      matchExternalProduct(external({ name: 'Leche Entera Nueva Fórmula 1L' }), {
        ...noCandidates,
        linkedProductId: 'product-1',
        byBarcode: product({ id: 'product-2' }),
      }),
    ).toEqual({ productId: 'product-1', method: 'EXTERNAL_ID' });
  });

  it('matches on barcode next', () => {
    expect(
      matchExternalProduct(external({ barcode: '7790070410122' }), {
        ...noCandidates,
        byBarcode: product({ id: 'product-1' }),
        byNormalizedName: [product({ id: 'product-2' })],
      }),
    ).toEqual({ productId: 'product-1', method: 'BARCODE' });
  });

  it('ignores a barcode that fails its checksum', () => {
    expect(
      matchExternalProduct(external({ barcode: '7790070410129' }), {
        ...noCandidates,
        byBarcode: product({ id: 'product-1' }),
      }),
    ).toBeNull();
  });

  it('falls back to an unambiguous name and package', () => {
    expect(
      matchExternalProduct(external(), {
        ...noCandidates,
        byNormalizedName: [product({ id: 'product-1' })],
      }),
    ).toEqual({ productId: 'product-1', method: 'NORMALIZED_IDENTITY' });
  });

  it('refuses to guess between two products of the same name and size', () => {
    expect(
      matchExternalProduct(external(), {
        ...noCandidates,
        byNormalizedName: [product({ id: 'a' }), product({ id: 'b' })],
      }),
    ).toBeNull();
  });

  it('does not match a different package size or unit', () => {
    expect(
      matchExternalProduct(external({ packageSize: 2 }), {
        ...noCandidates,
        byNormalizedName: [product({ id: 'product-1' })],
      }),
    ).toBeNull();

    expect(
      matchExternalProduct(external({ unit: 'kg', packageSize: 1 }), {
        ...noCandidates,
        byNormalizedName: [product({ id: 'product-1' })],
      }),
    ).toBeNull();
  });

  it('matches on name alone when the source says nothing about the package', () => {
    expect(
      matchExternalProduct(
        external({ packageSize: undefined, unit: undefined }),
        { ...noCandidates, byNormalizedName: [product({ id: 'product-1' })] },
      ),
    ).toEqual({ productId: 'product-1', method: 'NORMALIZED_IDENTITY' });
  });

  it('has no match when nothing is known', () => {
    expect(matchExternalProduct(external(), noCandidates)).toBeNull();
  });
});

describe('externalMatchKey', () => {
  it('normalizes the source’s wording, brand included', () => {
    expect(externalMatchKey(external({ name: 'LECHE  Entera 1L', brand: 'La Serenísima' })))
      .toBe('la serenisima leche entera 1l');
  });
});

describe('externalBarcode', () => {
  it('keeps a valid code and drops the rest', () => {
    expect(externalBarcode(external({ barcode: '779-0070410122' }))).toBe('7790070410122');
    expect(externalBarcode(external({ barcode: '12345' }))).toBeNull();
    expect(externalBarcode(external())).toBeNull();
  });
});

describe('normalizeExternalUnit', () => {
  it.each([
    ['L', 'LITER'],
    ['lt', 'LITER'],
    ['Litros', 'LITER'],
    ['cc', 'MILLILITER'],
    ['KG', 'KILOGRAM'],
    ['gr.', 'GRAM'],
    ['un', 'UNIT'],
  ])('maps %p onto %p', (source, expected) => {
    expect(normalizeExternalUnit(source)).toBe(expected);
  });

  it('has no opinion about a unit it does not know', () => {
    expect(normalizeExternalUnit('docena')).toBeNull();
    expect(normalizeExternalUnit(undefined)).toBeNull();
  });
});
