import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import type { Product } from '../../products/domain/product.entity.js';
import { boundingBox, haversineKm } from '../../supermarkets/domain/geo.js';
import { isOpenAt } from '../../supermarkets/domain/opening-hours.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import type { DerivedPrice } from '../domain/derived-price.entity.js';
import {
  DERIVED_PRICE_REPOSITORY,
  PRICE_CACHE,
  type DerivedPriceRepository,
  type PriceCache,
} from '../domain/price-intelligence.repository.port.js';

export interface ComparePricesQuery {
  productId: string;
  /** Narrows to stores within `radiusKm` of a point, when given. */
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  limit: number;
}

export interface StorePriceView {
  price: DerivedPrice;
  store: StoreLocation;
  distanceKm: number | null;
  isOpenNow: boolean;
}

export interface PriceComparison {
  product: Product;
  prices: StorePriceView[];
  /** True when the answer came from cache, for the response header. */
  cached: boolean;
}

/** Price comparison is read-heavy and changes slowly; a minute is plenty. */
export const COMPARISON_CACHE_TTL_SECONDS = 60;

/** Stores fetched before the radius filter, since the box over-selects. */
const NEARBY_CANDIDATES = 200;

/**
 * "Where can I buy this, and for how much?" — the read behind the price
 * comparison screen.
 *
 * Served from Redis when it can be: the same few popular products are compared
 * constantly. The cache key carries a per-product version that recomputing a
 * price bumps, so a new price shows up immediately rather than after the TTL,
 * and no scan is needed to invalidate.
 */
@Injectable()
export class ComparePricesUseCase {
  constructor(
    @Inject(DERIVED_PRICE_REPOSITORY)
    private readonly derivedPrices: DerivedPriceRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
    @Inject(PRICE_CACHE) private readonly cache: PriceCache,
  ) {}

  async execute(query: ComparePricesQuery): Promise<PriceComparison> {
    const product = await this.products.findById(query.productId);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const cacheKey = await this.cacheKey(query);
    const cached = await this.cache.read<CachedComparison>(cacheKey);

    if (cached) {
      return { product, prices: this.revive(cached), cached: true };
    }

    const prices = await this.buildComparison(query);

    await this.cache.write(
      cacheKey,
      this.toCacheable(prices),
      COMPARISON_CACHE_TTL_SECONDS,
    );

    return { product, prices, cached: false };
  }

  private async buildComparison(
    query: ComparePricesQuery,
  ): Promise<StorePriceView[]> {
    const nearby = this.nearbyStores(query);
    const now = new Date();

    if (nearby) {
      const stores = await nearby;
      const prices = await this.derivedPrices.findForProductAtStores(
        query.productId,
        stores.map((store) => store.id),
      );
      const byId = new Map(stores.map((store) => [store.id, store]));

      return this.assemble(prices, byId, query, now);
    }

    const prices = await this.derivedPrices.findForProduct(query.productId);
    const stores = await this.stores.findManyByIds(
      prices.map((price) => price.storeId),
    );

    return this.assemble(
      prices,
      new Map(stores.map((store) => [store.id, store])),
      query,
      now,
    );
  }

  /** Null when the caller gave no location, meaning "every store". */
  private nearbyStores(
    query: ComparePricesQuery,
  ): Promise<StoreLocation[]> | null {
    if (query.latitude === undefined || query.longitude === undefined) {
      return null;
    }

    return this.stores.findWithinBox(
      boundingBox(
        { latitude: query.latitude, longitude: query.longitude },
        query.radiusKm ?? 5,
      ),
      NEARBY_CANDIDATES,
    );
  }

  private assemble(
    prices: DerivedPrice[],
    stores: Map<string, StoreLocation>,
    query: ComparePricesQuery,
    now: Date,
  ): StorePriceView[] {
    const hasLocation =
      query.latitude !== undefined && query.longitude !== undefined;

    return prices
      .flatMap((price) => {
        const store = stores.get(price.storeId);

        // A price whose store has been deleted or deactivated is not somewhere
        // anyone can shop.
        if (!store || !store.isActive) {
          return [];
        }

        const distanceKm = hasLocation
          ? haversineKm(
              { latitude: query.latitude!, longitude: query.longitude! },
              { latitude: store.latitude, longitude: store.longitude },
            )
          : null;

        if (
          distanceKm !== null &&
          distanceKm > (query.radiusKm ?? 5)
        ) {
          return [];
        }

        return [
          {
            price,
            store,
            distanceKm:
              distanceKm === null ? null : Math.round(distanceKm * 1000) / 1000,
            isOpenNow: isOpenAt(store.openingHours, now),
          },
        ];
      })
      .sort((a, b) => a.price.priceCents - b.price.priceCents)
      .slice(0, query.limit);
  }

  private async cacheKey(query: ComparePricesQuery): Promise<string> {
    const namespace = await this.cache.productNamespace(query.productId);

    // Coordinates are rounded to about a hundred metres, so nearby shoppers
    // share a cache entry instead of each minting their own.
    const location =
      query.latitude === undefined || query.longitude === undefined
        ? 'all'
        : `${query.latitude.toFixed(3)},${query.longitude.toFixed(3)},${query.radiusKm ?? 5}`;

    return `${namespace}:compare:${location}:${query.limit}`;
  }

  private toCacheable(views: StorePriceView[]): CachedComparison {
    return views.map((view) => ({
      ...view,
      price: {
        ...view.price,
        lastObservedAt: view.price.lastObservedAt.toISOString(),
        computedAt: view.price.computedAt.toISOString(),
      },
    }));
  }

  private revive(cached: CachedComparison): StorePriceView[] {
    return cached.map((view) => ({
      ...view,
      price: {
        ...view.price,
        lastObservedAt: new Date(view.price.lastObservedAt),
        computedAt: new Date(view.price.computedAt),
      },
    }));
  }
}

/** JSON keeps no Date, so the cached shape carries ISO strings. */
type CachedComparison = (Omit<StorePriceView, 'price'> & {
  price: Omit<DerivedPrice, 'lastObservedAt' | 'computedAt'> & {
    lastObservedAt: string;
    computedAt: string;
  };
})[];
