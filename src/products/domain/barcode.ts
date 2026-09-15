/**
 * Barcode rules for the catalog.
 *
 * A barcode is the one identifier a shopper can produce from the physical
 * product, so it has to resolve to exactly one product. Validating the
 * checksum before storing keeps a mistyped or misread code from creating a
 * second identity for a product that already exists.
 */

/** Accepted symbologies, by digit count: EAN-8, UPC-A, EAN-13, GTIN-14. */
const VALID_LENGTHS = new Set([8, 12, 13, 14]);

/** Strips the spaces and hyphens people and scanners add around a code. */
export function normalizeBarcode(code: string): string {
  return code.replace(/[\s-]/g, '');
}

/**
 * GS1 modulo-10 check digit: digits are weighted 3 and 1 alternating from the
 * right, and the total plus the check digit must be a multiple of ten. The
 * same rule covers EAN-8, UPC-A, EAN-13 and GTIN-14.
 */
export function isValidBarcode(code: string): boolean {
  const normalized = normalizeBarcode(code);

  if (!VALID_LENGTHS.has(normalized.length) || !/^\d+$/.test(normalized)) {
    return false;
  }

  const digits = [...normalized].map(Number);
  const checkDigit = digits.pop() as number;

  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0,
    );

  return (10 - (sum % 10)) % 10 === checkDigit;
}
