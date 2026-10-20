import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';

/** What a message or alert is about, by name; null where it is about none. */
export interface SubjectNames {
  productName: string | null;
  storeName: string | null;
  supermarketName: string | null;
}

/**
 * Looks up the names a list of alerts or messages shows, in two queries
 * however many rows there are — read when listed, like the plan's and the
 * contributions' names, so a renamed store reads correctly.
 */
@Injectable()
export class SubjectNamesLoader {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  async forSubjects(
    subjects: { productId: string | null; storeId: string | null }[],
  ): Promise<(subject: { productId: string | null; storeId: string | null }) => SubjectNames> {
    const productIds = [...new Set(subjects.flatMap((s) => (s.productId ? [s.productId] : [])))];
    const storeIds = [...new Set(subjects.flatMap((s) => (s.storeId ? [s.storeId] : [])))];

    const [products, stores] = await Promise.all([
      productIds.length > 0 ? this.products.findManyByIds(productIds) : [],
      storeIds.length > 0 ? this.stores.findManyByIds(storeIds) : [],
    ]);
    const productById = new Map(products.map((row) => [row.id, row]));
    const storeById = new Map(stores.map((row) => [row.id, row]));

    return ({ productId, storeId }) => {
      const store = storeId ? storeById.get(storeId) : undefined;

      return {
        productName: productId ? (productById.get(productId)?.name ?? 'Unknown product') : null,
        storeName: storeId ? (store?.name ?? 'Unknown store') : null,
        supermarketName: storeId ? (store?.supermarket.name ?? 'Unknown supermarket') : null,
      };
    };
  }
}
