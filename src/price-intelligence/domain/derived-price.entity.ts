import type { PriceConfidenceLevel } from './price-confidence.js';

/** The current price of one product at one store. */
export interface DerivedPrice {
  productId: string;
  storeId: string;
  currency: string;
  priceCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  confidence: number;
  confidenceLevel: PriceConfidenceLevel;
  observationCount: number;
  lastObservedAt: Date;
  computedAt: Date;
}

export interface DailyPriceRecord {
  productId: string;
  storeId: string;
  date: Date;
  currency: string;
  weightedAverageCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  observationCount: number;
  confidence: number;
  isAnomalous: boolean;
}
