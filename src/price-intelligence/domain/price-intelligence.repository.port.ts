import type { DailyPricePoint } from './price-history.js';
import type { DailyPriceRecord, DerivedPrice } from './derived-price.entity.js';

/**
 * The price-intelligence module's data contract over `intelligence_db`.
 * Optimization (phase 7) and notifications (phase 8) read prices through it.
 */
export interface DerivedPriceRepository {
  find(productId: string, storeId: string): Promise<DerivedPrice | null>;
  /** Current prices for one product, cheapest first. */
  findForProduct(productId: string): Promise<DerivedPrice[]>;
  /** Current prices for a product at specific stores, for comparison and routing. */
  findForProductAtStores(
    productId: string,
    storeIds: string[],
  ): Promise<DerivedPrice[]>;
  /** Idempotent: recomputing a price rewrites the same row. */
  upsert(price: DerivedPrice): Promise<void>;
  /** Removes a price whose observations have all aged out. */
  remove(productId: string, storeId: string): Promise<void>;
}

export const DERIVED_PRICE_REPOSITORY = Symbol('DERIVED_PRICE_REPOSITORY');

export interface DailyPriceHistoryRepository {
  /** Idempotent: re-aggregating a day rewrites that day's row. */
  upsert(record: DailyPriceRecord): Promise<void>;
  /** The day before `date` for this product and store, if there is one. */
  findPreviousDay(
    productId: string,
    storeId: string,
    date: Date,
  ): Promise<DailyPriceRecord | null>;
  findRange(query: {
    productId: string;
    storeId?: string;
    from: Date;
    to: Date;
  }): Promise<DailyPricePoint[]>;
}

export const DAILY_PRICE_HISTORY_REPOSITORY = Symbol(
  'DAILY_PRICE_HISTORY_REPOSITORY',
);

/** Cache of read-heavy price views. Disposable: a miss just costs a query. */
export interface PriceCache {
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Drops every cached view of a product, by moving it to a new key space. */
  invalidateProduct(productId: string): Promise<void>;
  /** Key prefix that changes whenever a product's prices change. */
  productNamespace(productId: string): Promise<string>;
}

export const PRICE_CACHE = Symbol('PRICE_CACHE');
