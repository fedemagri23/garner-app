import type { OpeningInterval } from './opening-hours.js';

/** A chain or merchant — the brand a shopper recognizes. */
export interface Supermarket {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A physical branch: the place a price is actually paid, and the unit
 * optimization routes a shopper between. Prices attach to a store, never to
 * the chain, because two branches of one chain can and do differ.
 */
export interface StoreLocation {
  id: string;
  supermarketId: string;
  supermarket: Pick<Supermarket, 'id' | 'name' | 'slug' | 'logoUrl'>;
  name: string;
  addressLine: string;
  city: string;
  province: string | null;
  postalCode: string | null;
  country: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  isActive: boolean;
  openingHours: OpeningInterval[];
  createdAt: Date;
  updatedAt: Date;
}

/** A store paired with how far it is from the point that was searched. */
export interface NearbyStore {
  store: StoreLocation;
  distanceKm: number;
  isOpenNow: boolean;
}

export interface CreateSupermarketInput {
  name: string;
  slug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
}

export interface CreateStoreLocationInput {
  supermarketId: string;
  name: string;
  addressLine: string;
  city: string;
  province: string | null;
  postalCode: string | null;
  country: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  openingHours: OpeningInterval[];
}
