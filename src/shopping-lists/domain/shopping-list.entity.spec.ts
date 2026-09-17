import {
  calculateListTotals,
  duplicateListName,
  ShoppingListSortMode,
  sortItems,
} from './shopping-list.entity.js';

describe('calculateListTotals', () => {
  it('sums priced lines by quantity', () => {
    expect(
      calculateListTotals([
        { quantity: 2, expectedUnitPriceCents: 125 },
        { quantity: 1.5, expectedUnitPriceCents: 130 },
      ]),
    ).toEqual({ expectedTotalCents: 445, itemCount: 2, unpricedItemCount: 0 });
  });

  it('counts unpriced items instead of treating them as free', () => {
    expect(
      calculateListTotals([
        { quantity: 1, expectedUnitPriceCents: 200 },
        { quantity: 3, expectedUnitPriceCents: null },
      ]),
    ).toEqual({ expectedTotalCents: 200, itemCount: 2, unpricedItemCount: 1 });
  });

  it('is zero for an empty list', () => {
    expect(calculateListTotals([])).toEqual({
      expectedTotalCents: 0,
      itemCount: 0,
      unpricedItemCount: 0,
    });
  });
});

describe('sortItems', () => {
  const items = [
    { id: 'a', position: 0, productName: 'Pan', categoryName: 'Panadería', storeName: 'Coto' },
    { id: 'b', position: 1, productName: 'Leche', categoryName: 'Lácteos', storeName: null },
    { id: 'c', position: 2, productName: 'Arroz', categoryName: 'Almacén', storeName: 'Carrefour' },
    { id: 'd', position: 3, productName: 'arroz', categoryName: 'Almacén', storeName: 'Coto' },
  ];

  const ids = (sorted: { id: string }[]) => sorted.map((item) => item.id);

  it('follows the manual order', () => {
    expect(ids(sortItems(items, ShoppingListSortMode.Manual))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('sorts by product name, ignoring case, falling back to position', () => {
    expect(ids(sortItems(items, ShoppingListSortMode.Name))).toEqual([
      'c',
      'd',
      'b',
      'a',
    ]);
  });

  it('groups by category', () => {
    expect(ids(sortItems(items, ShoppingListSortMode.Category))).toEqual([
      'c',
      'd',
      'b',
      'a',
    ]);
  });

  it('groups by store and puts undecided items last', () => {
    expect(ids(sortItems(items, ShoppingListSortMode.Store))).toEqual([
      'c',
      'a',
      'd',
      'b',
    ]);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    sortItems(items, ShoppingListSortMode.Name);
    expect(items).toEqual(copy);
  });
});

describe('duplicateListName', () => {
  it('marks the copy', () => {
    expect(duplicateListName('Weekly groceries')).toBe('Weekly groceries (copy)');
  });

  it('truncates rather than exceeding the name limit', () => {
    const name = duplicateListName('x'.repeat(120));
    expect(name).toHaveLength(120);
    expect(name.endsWith(' (copy)')).toBe(true);
  });
});
