import { isValidBarcode, normalizeBarcode } from './barcode.js';

describe('normalizeBarcode', () => {
  it('removes the separators scanners and humans add', () => {
    expect(normalizeBarcode(' 7 790-070 410122 ')).toBe('7790070410122');
  });
});

describe('isValidBarcode', () => {
  it.each([
    ['EAN-13', '7790070410122'],
    ['EAN-8', '96385074'],
    ['UPC-A', '036000291452'],
  ])('accepts a well-formed %s', (_symbology, code) => {
    expect(isValidBarcode(code)).toBe(true);
  });

  it('accepts a code that still carries separators', () => {
    expect(isValidBarcode('0-36000-29145-2')).toBe(true);
  });

  it('rejects a code whose check digit does not match', () => {
    // A single transposed digit in a real EAN-13.
    expect(isValidBarcode('7790070410129')).toBe(false);
  });

  it('rejects a code of an unknown length', () => {
    expect(isValidBarcode('12345')).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(isValidBarcode('779007041012X')).toBe(false);
  });
});
