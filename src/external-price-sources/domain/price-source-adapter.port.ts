/**
 * The contract every supermarket integration implements.
 *
 * This is the whole of what the rest of the system knows about an external
 * source. Authentication, pagination, request shapes, field names and the
 * provider's particular idea of what a price is all stay inside the adapter;
 * pricing never learns how Carrefour differs from Día.
 */

/** A product as the source describes it, already normalized by the adapter. */
export interface ExternalProduct {
  /** The source's own identifier, stable across imports. */
  externalId: string;
  name: string;
  /** Digits only; the matcher validates the checksum before trusting it. */
  barcode?: string;
  brand?: string;
  packageSize?: number;
  /** Free text as the source writes it, e.g. "l", "kg", "un". */
  unit?: string;
  imageUrl?: string;
}

/** A price as the source publishes it. */
export interface ExternalPrice {
  externalProductId: string;
  /** The source's identifier for the branch; mapped to a store by a person. */
  externalStoreId: string;
  priceCents: number;
  currency: string;
  /** When the source says the price was valid; defaults to the import time. */
  observedAt?: Date;
}

export interface AdapterContext {
  sourceSlug: string;
  /** The source's stored, non-secret configuration. */
  config: Record<string, unknown>;
  /** Cancels a fetch that outlives its run. */
  signal?: AbortSignal;
}

export interface PriceSourceAdapter {
  /** Matches `ExternalPriceSource.adapterKey`. */
  readonly key: string;
  fetchProducts(context: AdapterContext): Promise<ExternalProduct[]>;
  fetchPrices(context: AdapterContext): Promise<ExternalPrice[]>;
}

/** Lets a source be run by name without anyone importing adapters directly. */
export interface AdapterRegistry {
  get(key: string): PriceSourceAdapter | null;
  keys(): string[];
}

export const ADAPTER_REGISTRY = Symbol('ADAPTER_REGISTRY');

/** An adapter failure worth showing an operator, as opposed to a bug. */
export class AdapterError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
