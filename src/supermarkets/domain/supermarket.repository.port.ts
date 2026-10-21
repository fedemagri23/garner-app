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
  /**
   * Shops in the box that everyone can see, plus — when a viewer is given —
   * that viewer's own not-yet-public ones. Everything that lists shops near a
   * place goes through here, so a private shop never shows to anyone else.
   */
  findWithinBox(box: BoundingBox, limit: number, options?: { viewerId?: string }): Promise<StoreLocation[]>;
  create(input: CreateStoreLocationInput): Promise<StoreLocation>;
}

export const STORE_LOCATION_REPOSITORY = Symbol('STORE_LOCATION_REPOSITORY');
