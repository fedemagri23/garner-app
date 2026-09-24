import { createHash } from 'node:crypto';
import type { OptimizationConstraints } from './constraints.js';
import type { OptimizationMode } from './scoring.js';
import type { OptimizationItem } from './plan.js';
import type { OptimizationResult } from './optimizer.js';

export const OptimizationStatus = {
  Pending: 'PENDING',
  Running: 'RUNNING',
  Completed: 'COMPLETED',
  Failed: 'FAILED',
} as const;

export type OptimizationStatus =
  (typeof OptimizationStatus)[keyof typeof OptimizationStatus];

/** Everything an optimization was asked to respect. */
export interface OptimizationSettings extends OptimizationConstraints {
  mode: OptimizationMode;
  preferredSupermarketIds: string[];
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface OptimizationRequest {
  id: string;
  ownerId: string;
  listId: string | null;
  settings: OptimizationSettings;
  status: OptimizationStatus;
  fingerprint: string;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  result: OptimizationResult | null;
}

export interface OptimizationPreferences extends OptimizationConstraints {
  userId: string;
  mode: OptimizationMode;
  preferredSupermarketIds: string[];
}

/** What a shopper gets before they have expressed any preference. */
export const DEFAULT_PREFERENCES: Omit<OptimizationPreferences, 'userId'> = {
  maxStores: 2,
  maxAdditionalDistanceKm: 5,
  maxAdditionalMinutes: 20,
  minSavingsCentsPerExtraStore: 400,
  mode: 'BEST_BALANCE',
  preferredSupermarketIds: [],
  excludedSupermarketIds: [],
};

/**
 * How long a completed answer may be reused for the same question.
 *
 * The list and the constraints are in the fingerprint, so those changing
 * produces a different question. Prices are not: they change continuously and
 * hashing them would defeat the cache entirely, so freshness is bounded by
 * time instead.
 */
export const REUSABLE_FOR_MS = 15 * 60 * 1000;

/**
 * Identifies the question being asked: this list, at these quantities, under
 * these limits, from about here. Asking it again reuses the answer; changing
 * any part of it asks something new.
 */
export function fingerprintOf(input: {
  listId: string;
  items: OptimizationItem[];
  settings: OptimizationSettings;
}): string {
  const items = [...input.items]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((item) => `${item.productId}:${item.quantity}`)
    .join(',');

  const { settings } = input;

  const parts = [
    input.listId,
    items,
    settings.mode,
    settings.maxStores,
    settings.maxAdditionalDistanceKm,
    settings.maxAdditionalMinutes,
    settings.minSavingsCentsPerExtraStore,
    settings.radiusKm,
    // About a hundred metres: moving across the room is the same question.
    settings.latitude.toFixed(3),
    settings.longitude.toFixed(3),
    [...settings.preferredSupermarketIds].sort().join('|'),
    [...settings.excludedSupermarketIds].sort().join('|'),
  ];

  return createHash('sha256').update(parts.join('§')).digest('hex');
}

export function isReusable(
  request: Pick<OptimizationRequest, 'status' | 'completedAt'>,
  now: Date,
): boolean {
  return (
    request.status === OptimizationStatus.Completed &&
    request.completedAt !== null &&
    now.getTime() - request.completedAt.getTime() < REUSABLE_FOR_MS
  );
}
