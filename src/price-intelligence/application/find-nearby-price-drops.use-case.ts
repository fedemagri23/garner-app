import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import type { Product } from '../../products/domain/product.entity.js';
import { boundingBox, haversineKm } from '../../supermarkets/domain/geo.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import {
  dropPercent,
  MIN_DROP_PERCENT,
  PRICE_DROP_WINDOW_DAYS,
  type PriceDrop,
} from '../domain/price-drop.js';
import {
  PRICE_DROP_REPOSITORY,
  type PriceDropRepository,
} from '../domain/price-intelligence.repository.port.js';

export interface NearbyPriceDropsQuery {
  latitude: number;
  longitude: number;
  radiusKm: number;
  limit: number;
}

export interface NearbyPriceDrop {
  drop: PriceDrop;
  dropPercent: number;
  product: Product;
  store: StoreLocation;
  distanceKm: number;
}

/** Stores fetched before the radius filter, since the box over-selects. */
const NEARBY_CANDIDATES = 200;

/** Bounds the drops read per request, however busy the neighbourhood. */
const DROP_CANDIDATES = 500;

const DAY = 24 * 60 * 60 * 1000;

/**
 * "Bajaron cerca tuyo": products whose price fell this week at stores around
 * a point, the biggest falls first.
 *
 * One entry per product — the store where it fell most — so a product cut
 * across a whole chain shows once instead of filling the list.
 */
@Injectable()
export class FindNearbyPriceDropsUseCase {
  constructor(
    @Inject(PRICE_DROP_REPOSITORY)
    private readonly priceDrops: PriceDropRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  async execute(
    query: NearbyPriceDropsQuery,
    now: Date = new Date(),
  ): Promise<NearbyPriceDrop[]> {
    const point = { latitude: query.latitude, longitude: query.longitude };
    const candidates = await this.stores.findWithinBox(
      boundingBox(point, query.radiusKm),
      NEARBY_CANDIDATES,
    );

    const nearby = new Map<string, { store: StoreLocation; distanceKm: number }>();
    for (const store of candidates) {
      const distanceKm = haversineKm(point, store);
      if (store.isActive && distanceKm <= query.radiusKm) {
        nearby.set(store.id, { store, distanceKm });
      }
    }

    const drops = await this.priceDrops.findRecentAtStores({
      storeIds: [...nearby.keys()],
      since: new Date(now.getTime() - PRICE_DROP_WINDOW_DAYS * DAY),
      limit: DROP_CANDIDATES,
    });

    // The biggest fall per product.
    const best = new Map<string, { drop: PriceDrop; percent: number }>();
    for (const drop of drops) {
      const percent = dropPercent(drop);
      const current = best.get(drop.productId);

      if (percent >= MIN_DROP_PERCENT && (!current || percent > current.percent)) {
        best.set(drop.productId, { drop, percent });
      }
    }

    const products = new Map(
      (await this.products.findManyByIds([...best.keys()])).map((product) => [
        product.id,
        product,
      ]),
    );

    return [...best.values()]
      .flatMap(({ drop, percent }) => {
        const product = products.get(drop.productId);
        const { store, distanceKm } = nearby.get(drop.storeId)!;

        // A retired product is not something to go and buy.
        if (!product || !product.isActive) {
          return [];
        }

        return [
          {
            drop,
            dropPercent: percent,
            product,
            store,
            distanceKm: Math.round(distanceKm * 1000) / 1000,
          },
        ];
      })
      .sort(
        (a, b) =>
          b.dropPercent - a.dropPercent ||
          b.drop.droppedAt.getTime() - a.drop.droppedAt.getTime(),
      )
      .slice(0, query.limit);
  }
}
