/**
 * How a package is measured. The enum mirrors the Prisma enum of the same
 * name; this is the copy business code depends on, so the domain never has to
 * import a generated client.
 */
export const UnitOfMeasure = {
  Gram: 'GRAM',
  Kilogram: 'KILOGRAM',
  Milliliter: 'MILLILITER',
  Liter: 'LITER',
  Unit: 'UNIT',
} as const;

export type UnitOfMeasure = (typeof UnitOfMeasure)[keyof typeof UnitOfMeasure];

/** The unit a family of measures is normalized to. */
export type BaseUnit = 'g' | 'ml' | 'unit';

const BASE: Record<UnitOfMeasure, { unit: BaseUnit; factor: number }> = {
  GRAM: { unit: 'g', factor: 1 },
  KILOGRAM: { unit: 'g', factor: 1000 },
  MILLILITER: { unit: 'ml', factor: 1 },
  LITER: { unit: 'ml', factor: 1000 },
  UNIT: { unit: 'unit', factor: 1 },
};

export interface BaseQuantity {
  amount: number;
  unit: BaseUnit;
}

/**
 * Converts a package size to grams, millilitres or countable units.
 *
 * Phase 4 compares "is this actually cheaper?" across packages of different
 * sizes, and that comparison is only meaningful against a common base. Doing
 * the conversion here — once, in the domain — keeps every later price-per-unit
 * calculation from re-deriving it.
 */
export function toBaseQuantity(
  packageSize: number | null,
  unit: UnitOfMeasure,
): BaseQuantity | null {
  if (packageSize === null || packageSize <= 0) {
    return null;
  }

  const base = BASE[unit];
  return { amount: packageSize * base.factor, unit: base.unit };
}

/**
 * Two packages are comparable when they measure the same kind of thing: a
 * 1L bottle against a 500ml one, never a 1L bottle against "3 units".
 */
export function isComparable(a: UnitOfMeasure, b: UnitOfMeasure): boolean {
  return BASE[a].unit === BASE[b].unit;
}

/** Human label for a package size, e.g. `1 L` or `500 g`. */
export function formatPackageSize(
  packageSize: number | null,
  unit: UnitOfMeasure,
): string | null {
  if (packageSize === null) {
    return null;
  }

  const symbol: Record<UnitOfMeasure, string> = {
    GRAM: 'g',
    KILOGRAM: 'kg',
    MILLILITER: 'ml',
    LITER: 'L',
    UNIT: 'u',
  };

  // Trailing zeros come from the Decimal column; 1.000 L should read as 1 L.
  const amount = Number.parseFloat(packageSize.toFixed(3));
  return `${amount} ${symbol[unit]}`;
}
