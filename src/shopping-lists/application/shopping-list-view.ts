import { Injectable } from '@nestjs/common';
import type { Product } from '../../products/domain/product.entity.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import { lineTotalCents } from '../domain/money.js';
import {
  calculateListTotals,
  sortItems,
  type ShoppingList,
  type ShoppingListItem,
  type ShoppingListTotals,
} from '../domain/shopping-list.entity.js';
import { CatalogReferences } from './catalog-references.js';

export interface ShoppingListItemView {
  item: ShoppingListItem;
  product: Product;
  store: StoreLocation | null;
  /** Null when the item has no expected price. */
  expectedLineTotalCents: number | null;
}

export interface ShoppingListView {
  list: ShoppingList;
  items: ShoppingListItemView[];
  totals: ShoppingListTotals;
}

/**
 * Assembles what a client shows for a list: items joined to their products and
 * stores, ordered by the list's sort mode, with server-computed totals.
 */
@Injectable()
export class ShoppingListViewBuilder {
  constructor(private readonly catalog: CatalogReferences) {}

  async build(list: ShoppingList): Promise<ShoppingListView> {
    const [products, stores] = await Promise.all([
      this.catalog.productsById(list.items.map((item) => item.productId)),
      this.catalog.storesById(list.items.map((item) => item.selectedStoreId)),
    ]);

    const views = list.items.flatMap((item) => {
      const product = products.get(item.productId);

      // Products are never deleted, so this only guards against a broken row.
      if (!product) {
        return [];
      }

      const store = item.selectedStoreId
        ? (stores.get(item.selectedStoreId) ?? null)
        : null;

      return [
        {
          item,
          product,
          store,
          expectedLineTotalCents:
            item.expectedUnitPriceCents === null
              ? null
              : lineTotalCents(item.quantity, item.expectedUnitPriceCents),
          position: item.position,
          productName: product.name,
          categoryName: product.category.name,
          storeName: store
            ? `${store.supermarket.name} ${store.name}`
            : null,
        },
      ];
    });

    return {
      list,
      items: sortItems(views, list.sortMode),
      totals: calculateListTotals(list.items),
    };
  }
}
