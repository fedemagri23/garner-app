import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Product } from '../../products/domain/product.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';

/**
 * Resolves the products and stores a list refers to, through the catalog
 * modules' ports. Shopping never reads catalog tables itself.
 */
@Injectable()
export class CatalogReferences {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  /** A product that can go on a list: it exists and has not been retired. */
  async requirePurchasableProduct(productId: string): Promise<Product> {
    const product = await this.products.findById(productId);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new UnprocessableEntityException(
        'This product has been retired from the catalog',
      );
    }

    return product;
  }

  async requireStore(storeId: string): Promise<StoreLocation> {
    const store = await this.stores.findById(storeId);

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  async productsById(ids: string[]): Promise<Map<string, Product>> {
    const products = await this.products.findManyByIds([...new Set(ids)]);
    return new Map(products.map((product) => [product.id, product]));
  }

  async storesById(ids: (string | null)[]): Promise<Map<string, StoreLocation>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    const stores = await this.stores.findManyByIds(unique);
    return new Map(stores.map((store) => [store.id, store]));
  }
}
