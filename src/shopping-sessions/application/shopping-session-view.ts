import { Injectable } from '@nestjs/common';
import type { Product } from '../../products/domain/product.entity.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import { CatalogReferences } from '../../shopping-lists/application/catalog-references.js';
import { lineTotalCents } from '../../shopping-lists/domain/money.js';
import {
  calculateSessionTotals,
  type SessionTotals,
  type ShoppingSession,
  type ShoppingSessionItem,
} from '../domain/shopping-session.entity.js';

export interface ShoppingSessionItemView {
  item: ShoppingSessionItem;
  product: Product;
  store: StoreLocation | null;
  expectedLineTotalCents: number | null;
  /** Null until the line is purchased and some price for it is known. */
  actualLineTotalCents: number | null;
}

export interface ShoppingSessionView {
  session: ShoppingSession;
  store: StoreLocation | null;
  items: ShoppingSessionItemView[];
  totals: SessionTotals;
}

/** What Shopping Mode renders: the trip's lines, joined to the catalog, with totals. */
@Injectable()
export class ShoppingSessionViewBuilder {
  constructor(private readonly catalog: CatalogReferences) {}

  async build(session: ShoppingSession): Promise<ShoppingSessionView> {
    const [products, stores] = await Promise.all([
      this.catalog.productsById(session.items.map((item) => item.productId)),
      this.catalog.storesById([
        session.storeId,
        ...session.items.map((item) => item.storeId),
      ]),
    ]);

    const items = session.items.flatMap((item) => {
      const product = products.get(item.productId);
      if (!product) {
        return [];
      }

      const paidUnitPrice =
        item.actualUnitPriceCents ?? item.expectedUnitPriceCents;

      return [
        {
          item,
          product,
          store: item.storeId ? (stores.get(item.storeId) ?? null) : null,
          expectedLineTotalCents:
            item.expectedUnitPriceCents === null
              ? null
              : lineTotalCents(item.quantity, item.expectedUnitPriceCents),
          actualLineTotalCents:
            item.isPurchased && paidUnitPrice !== null
              ? lineTotalCents(item.quantity, paidUnitPrice)
              : null,
        },
      ];
    });

    return {
      session,
      store: session.storeId ? (stores.get(session.storeId) ?? null) : null,
      items,
      totals: calculateSessionTotals(session.items),
    };
  }
}
