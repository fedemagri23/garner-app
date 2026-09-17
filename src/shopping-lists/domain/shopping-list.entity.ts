import { lineTotalCents } from './money.js';

/**
 * Upper bound on items in one list. A list is a human-scale plan; the cap
 * keeps every read, total and session start bounded in the work it does.
 */
export const MAX_ITEMS_PER_LIST = 500;

export const ShoppingListSortMode = {
  Manual: 'MANUAL',
  Name: 'NAME',
  Category: 'CATEGORY',
  Store: 'STORE',
} as const;

export type ShoppingListSortMode =
  (typeof ShoppingListSortMode)[keyof typeof ShoppingListSortMode];

export interface ShoppingListItem {
  id: string;
  listId: string;
  productId: string;
  quantity: number;
  notes: string | null;
  /** Cents per unit, in the list's currency. Null when the user has no idea yet. */
  expectedUnitPriceCents: number | null;
  selectedStoreId: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A plan made at home. It holds *expected* prices only; what was actually paid
 * belongs to the shopping session, and the two are kept apart on purpose —
 * the difference between them is information in its own right.
 */
export interface ShoppingList {
  id: string;
  ownerId: string;
  name: string;
  notes: string | null;
  currency: string;
  sortMode: ShoppingListSortMode;
  items: ShoppingListItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ShoppingListTotals {
  /** Sum of every priced item. */
  expectedTotalCents: number;
  itemCount: number;
  /**
   * Items with no expected price. A non-zero count means the total is a floor,
   * not an estimate, and the client should say so.
   */
  unpricedItemCount: number;
}

/**
 * Totals are computed here, on the server, from stored prices and quantities.
 * The client is never the authority on what a list costs.
 */
export function calculateListTotals(
  items: Pick<ShoppingListItem, 'quantity' | 'expectedUnitPriceCents'>[],
): ShoppingListTotals {
  let expectedTotalCents = 0;
  let unpricedItemCount = 0;

  for (const item of items) {
    if (item.expectedUnitPriceCents === null) {
      unpricedItemCount += 1;
      continue;
    }

    expectedTotalCents += lineTotalCents(
      item.quantity,
      item.expectedUnitPriceCents,
    );
  }

  return { expectedTotalCents, itemCount: items.length, unpricedItemCount };
}

/** What a sortable item needs to know about its product and store. */
export interface SortableItem {
  position: number;
  productName: string;
  categoryName: string;
  storeName: string | null;
}

/**
 * Orders items for display according to the list's sort mode. Every mode falls
 * back to the manual position, so the order is total and stable — two items
 * with the same name never swap places between requests.
 */
export function sortItems<T extends SortableItem>(
  items: T[],
  mode: ShoppingListSortMode,
): T[] {
  const byPosition = (a: T, b: T) => a.position - b.position;
  const byText = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' });

  const comparators: Record<ShoppingListSortMode, (a: T, b: T) => number> = {
    MANUAL: byPosition,
    NAME: (a, b) => byText(a.productName, b.productName) || byPosition(a, b),
    CATEGORY: (a, b) =>
      byText(a.categoryName, b.categoryName) ||
      byText(a.productName, b.productName) ||
      byPosition(a, b),
    // Items with no store chosen go last: they are the ones still to decide.
    STORE: (a, b) => {
      if (a.storeName === null && b.storeName !== null) return 1;
      if (a.storeName !== null && b.storeName === null) return -1;
      return (
        byText(a.storeName ?? '', b.storeName ?? '') || byPosition(a, b)
      );
    },
  };

  return [...items].sort(comparators[mode]);
}

/** The name a duplicated list gets when the user does not choose one. */
export function duplicateListName(name: string, maxLength = 120): string {
  const suffix = ' (copy)';
  return name.length + suffix.length <= maxLength
    ? `${name}${suffix}`
    : `${name.slice(0, maxLength - suffix.length)}${suffix}`;
}
