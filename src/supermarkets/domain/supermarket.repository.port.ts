import type { BoundingBox } from './geo.js';
import type {
  CreateStoreLocationInput,
  CreateSupermarketInput,
  StoreLocation,
  Supermarket,
} from './supermarket.entity.js';

/**
 * The supermarkets module's public data contract. Pricing records observations
 * against a store id, and optimization routes between stores, both through
 * this port rather than the tables behind it.
 */
export interface SupermarketRepository {
  findAll(includeInactive: boolean): Promise<Supermarket[]>;
  findById(id: string): Promise<Supermarket | null>;
  findBySlug(slug: string): Promise<Supermarket | null>;
  create(input: CreateSupermarketInput): Promise<Supermarket>;
}

export const SUPERMARKET_REPOSITORY = Symbol('SUPERMARKET_REPOSITORY');

export interface StoreSearchCriteria {
  supermarketId?: string;
  city?: string;
  includeInactive?: boolean;
  skip: number;
  take: number;
}

export interface StoreSearchResult {
  stores: StoreLocation[];
  totalItems: number;
}

export interface StoreLocationRepository {
  search(criteria: StoreSearchCriteria): Promise<StoreSearchResult>;
  findById(id: string): Promise<StoreLocation | null>;
  findManyByIds(ids: string[]): Promise<StoreLocation[]>;
  /**
   * Every active store inside the box. The caller narrows the result to a true
   * radius; the box exists so the query can use the coordinate index instead
   * of scanning the table.
   */
  findWithinBox(box: BoundingBox, limit: number): Promise<StoreLocation[]>;
  create(input: CreateStoreLocationInput): Promise<StoreLocation>;
}

export const STORE_LOCATION_REPOSITORY = Symbol('STORE_LOCATION_REPOSITORY');
