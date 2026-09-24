import type { Coordinates } from '../../supermarkets/domain/geo.js';
import {
  satisfies,
  violationsOf,
  type ConstraintViolation,
  type OptimizationConstraints,
} from './constraints.js';
import {
  buildPlan,
  relativeTo,
  type CandidateStore,
  type OptimizationItem,
  type Plan,
} from './plan.js';
import { bestPlan, comparePlans, OptimizationMode } from './scoring.js';

/**
 * How many stores are considered at all. Combinations grow quickly, so the
 * field is trimmed to the most promising stores first — beyond a dozen, the
 * extra candidates are further away and rarely change the answer.
 */
export const MAX_CANDIDATE_STORES = 12;

/** No shopper accepts more stops than this, whatever they configure. */
export const MAX_STORES_HARD_LIMIT = 4;

export interface OptimizationInput {
  items: OptimizationItem[];
  stores: CandidateStore[];
  home: Coordinates;
  constraints: OptimizationConstraints;
}

export interface RejectedPlan {
  plan: Plan;
  violations: ConstraintViolation[];
}

export interface OptimizationResult {
  /** The three alternatives the product presents. Null when nothing is buyable. */
  cheapest: Plan | null;
  bestBalance: Plan | null;
  simplest: Plan | null;
  /**
   * Plans that would have cost less but break a stated limit. Shown as
   * "you could save more if…", never as the recommendation.
   */
  rejectedCheaperAlternatives: RejectedPlan[];
  /** Products no candidate store sells at all. */
  unavailableProductIds: string[];
  consideredStoreCount: number;
  consideredCombinationCount: number;
}

/**
 * Turns a shopping list into a small number of understandable ways to buy it.
 *
 * Pure and deterministic: the same list, stores and prices always produce the
 * same plans, which is what makes the recommendation testable and what lets a
 * result be cached and explained after the fact.
 */
export function optimize(input: OptimizationInput): OptimizationResult {
  const stores = selectCandidates(input);
  const maxStores = Math.min(
    Math.max(1, input.constraints.maxStores),
    MAX_STORES_HARD_LIMIT,
  );

  const plans: Plan[] = [];
  let consideredCombinationCount = 0;

  // One past the shopper's limit, so a plan just beyond it can be shown as a
  // cheaper alternative they chose not to allow — without ever being
  // recommended.
  const largestCombination = Math.min(
    maxStores + 1,
    MAX_STORES_HARD_LIMIT,
    stores.length,
  );

  for (let size = 1; size <= largestCombination; size++) {
    for (const combination of combinationsOf(stores, size)) {
      consideredCombinationCount += 1;
      plans.push(buildPlan(input.items, combination, input.home));
    }
  }

  const baseline = chooseBaseline(plans);

  const relative = plans.map((plan) => relativeTo(plan, baseline));

  const valid = relative.filter((plan) =>
    satisfies(plan, input.constraints, baseline),
  );

  const cheapest = bestPlan(valid, OptimizationMode.Cheapest);

  return {
    cheapest,
    bestBalance: bestPlan(valid, OptimizationMode.BestBalance),
    simplest: bestPlan(valid, OptimizationMode.Simplest),
    rejectedCheaperAlternatives: collectRejected(
      relative,
      input.constraints,
      baseline,
      cheapest,
    ),
    unavailableProductIds: input.items
      .map((item) => item.productId)
      .filter((productId) =>
        stores.every((store) => !store.prices.has(productId)),
      ),
    consideredStoreCount: stores.length,
    consideredCombinationCount,
  };
}

/**
 * The trip a shopper would make without any of this: one store, as much of the
 * list as it carries, as close to home as possible.
 *
 * Savings and extra travel are quoted against it, so it has to be the
 * *convenient* single store rather than the cheapest one. Measuring against
 * the cheapest would make a bargain shop an hour away look like no detour at
 * all, and every distance limit would stop meaning anything.
 */
function chooseBaseline(plans: Plan[]): Plan | null {
  const singles = plans.filter((plan) => plan.stores.length === 1);

  if (singles.length === 0) {
    return null;
  }

  return [...singles].sort(
    (a, b) =>
      b.coveredItemCount - a.coveredItemCount ||
      a.travel.distanceKm - b.travel.distanceKm ||
      a.totalCents - b.totalCents ||
      a.stores[0].storeId.localeCompare(b.stores[0].storeId),
  )[0];
}

/**
 * Trims the field before combining. Excluded chains go first — they may not
 * appear in any plan — then stores are ranked by how much of the list they
 * cover and how cheaply, since those are the ones worth combining.
 */
function selectCandidates(input: OptimizationInput): CandidateStore[] {
  const productIds = input.items.map((item) => item.productId);

  return input.stores
    .filter(
      (store) =>
        !input.constraints.excludedSupermarketIds.includes(store.supermarketId),
    )
    .map((store) => ({
      store,
      coverage: productIds.filter((productId) => store.prices.has(productId))
        .length,
      basketCents: input.items.reduce(
        (sum, item) =>
          sum + (store.prices.get(item.productId) ?? 0) * item.quantity,
        0,
      ),
    }))
    .filter((entry) => entry.coverage > 0)
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        a.basketCents - b.basketCents ||
        a.store.distanceKm - b.store.distanceKm ||
        a.store.storeId.localeCompare(b.store.storeId),
    )
    .slice(0, MAX_CANDIDATE_STORES)
    .map((entry) => entry.store);
}

/** The cheaper-but-rejected plans, most tempting first. */
function collectRejected(
  plans: Plan[],
  constraints: OptimizationConstraints,
  baseline: Plan | null,
  recommended: Plan | null,
): RejectedPlan[] {
  if (!recommended) {
    return [];
  }

  return plans
    .filter(
      (plan) =>
        plan.totalCents < recommended.totalCents &&
        plan.coveredItemCount >= recommended.coveredItemCount &&
        !satisfies(plan, constraints, baseline),
    )
    .sort(comparePlans(OptimizationMode.Cheapest))
    .slice(0, 3)
    .map((plan) => ({
      plan,
      violations: violationsOf(plan, constraints, baseline),
    }));
}

/** Every combination of `size` stores, in a stable order. */
function* combinationsOf(
  stores: CandidateStore[],
  size: number,
): Generator<CandidateStore[]> {
  const indices = Array.from({ length: size }, (_, index) => index);

  if (size > stores.length) {
    return;
  }

  while (true) {
    yield indices.map((index) => stores[index]);

    let cursor = size - 1;
    while (cursor >= 0 && indices[cursor] === stores.length - size + cursor) {
      cursor -= 1;
    }

    if (cursor < 0) {
      return;
    }

    indices[cursor] += 1;
    for (let next = cursor + 1; next < size; next++) {
      indices[next] = indices[next - 1] + 1;
    }
  }
}
