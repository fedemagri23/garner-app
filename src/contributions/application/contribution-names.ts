import { Inject, Injectable } from '@nestjs/common';
import type { PriceObservation } from '../../pricing/domain/price-observation.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';

/** What a contribution is about, by name. */
export interface ContributionNames {
  productName: string;
  storeName: string;
  supermarketName: string;
}

/**
 * Looks up the names a contributions list shows, in two queries however many
 * rows there are. Names are read when listed, like a plan's: a renamed store
 * reads correctly, and the price stays exactly as it was reported.
 */
@Injectable()
export class ContributionNamesLoader {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  async forObservations(
    observations: PriceObservation[],
  ): Promise<(observation: PriceObservation) => ContributionNames> {
    const [products, stores] = await Promise.all([
      this.products.findManyByIds([
        ...new Set(observations.map((row) => row.productId)),
      ]),
      this.stores.findManyByIds([
        ...new Set(observations.map((row) => row.storeId)),
      ]),
    ]);

    const productById = new Map(products.map((row) => [row.id, row]));
    const storeById = new Map(stores.map((row) => [row.id, row]));

    return (observation) => {
      const store = storeById.get(observation.storeId);

      return {
        productName: productById.get(observation.productId)?.name ?? 'Unknown product',
        storeName: store?.name ?? 'Unknown store',
        supermarketName: store?.supermarket.name ?? 'Unknown supermarket',
      };
    };
  }
}
