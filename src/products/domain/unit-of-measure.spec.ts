import {
  formatPackageSize,
  isComparable,
  toBaseQuantity,
  UnitOfMeasure,
} from './unit-of-measure.js';

describe('toBaseQuantity', () => {
  it('converts mass to grams', () => {
    expect(toBaseQuantity(1.5, UnitOfMeasure.Kilogram)).toEqual({
      amount: 1500,
      unit: 'g',
    });
  });

  it('converts volume to millilitres', () => {
    expect(toBaseQuantity(1, UnitOfMeasure.Liter)).toEqual({
      amount: 1000,
      unit: 'ml',
    });
  });

  it('leaves countable units alone', () => {
    expect(toBaseQuantity(6, UnitOfMeasure.Unit)).toEqual({
      amount: 6,
      unit: 'unit',
    });
  });

  it('has no base quantity when the size is unknown or meaningless', () => {
    expect(toBaseQuantity(null, UnitOfMeasure.Gram)).toBeNull();
    expect(toBaseQuantity(0, UnitOfMeasure.Gram)).toBeNull();
  });

  it('puts a 1L bottle and a 500ml bottle on the same scale', () => {
    const big = toBaseQuantity(1, UnitOfMeasure.Liter);
    const small = toBaseQuantity(500, UnitOfMeasure.Milliliter);

    expect(big!.unit).toBe(small!.unit);
    expect(big!.amount / small!.amount).toBe(2);
  });
});

describe('isComparable', () => {
  it('compares units that measure the same kind of thing', () => {
    expect(isComparable(UnitOfMeasure.Liter, UnitOfMeasure.Milliliter)).toBe(
      true,
    );
    expect(isComparable(UnitOfMeasure.Gram, UnitOfMeasure.Kilogram)).toBe(true);
  });

  it('refuses to compare volume with a countable pack', () => {
    expect(isComparable(UnitOfMeasure.Liter, UnitOfMeasure.Unit)).toBe(false);
  });
});

describe('formatPackageSize', () => {
  it('drops the trailing zeros the decimal column carries', () => {
    expect(formatPackageSize(1, UnitOfMeasure.Liter)).toBe('1 L');
    expect(formatPackageSize(500, UnitOfMeasure.Gram)).toBe('500 g');
  });

  it('has no label without a size', () => {
    expect(formatPackageSize(null, UnitOfMeasure.Unit)).toBeNull();
  });
});
