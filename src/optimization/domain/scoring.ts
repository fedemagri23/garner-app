import type { Plan } from './plan.js';

/**
 * How plans are ranked.
 *
 * Isolated on purpose: which trade-off counts as "best balance" is a product
 * judgement that will be tuned, and the API should not have to change when it
 * is. Everything here is a pure comparison over already-built plans.
 */

/** What a shopper implicitly pays to drive a kilometre, in minor units. */
export const COST_PER_KM_CENTS = 150;

/** And to spend a minute on the trip. */
export const COST_PER_MINUTE_CENTS = 20;

/** The nuisance of one more shop, beyond its distance and time. */
export const COST_PER_EXTRA_STORE_CENTS = 300;

export const OptimizationMode = {
  Cheapest: 'CHEAPEST',
  BestBalance: 'BEST_BALANCE',
  Simplest: 'SIMPLEST',
} as const;

export type OptimizationMode =
  (typeof OptimizationMode)[keyof typeof OptimizationMode];

/**
 * What a plan really costs: the shopping, plus the travel it asks for
 * expressed in the same units, so the two can be weighed against each other.
 */
export function effectiveCostCents(plan: Plan): number {
  const extraStores = Math.max(0, plan.stores.length - 1);

  return Math.round(
    plan.totalCents +
      plan.additionalDistanceKm * COST_PER_KM_CENTS +
      plan.additionalMinutes * COST_PER_MINUTE_CENTS +
      extraStores * COST_PER_EXTRA_STORE_CENTS,
  );
}

/**
 * Orders plans for a mode. Coverage comes first in every mode: a plan that
 * leaves products unbought is not a cheaper way to do the shop, it is a
 * different, smaller shop.
 *
 * Every comparison ends in a total order, so equally good plans always come
 * back in the same sequence.
 */
export function comparePlans(mode: OptimizationMode) {
  return (a: Plan, b: Plan): number =>
    b.coveredItemCount - a.coveredItemCount ||
    modeComparison(mode, a, b) ||
    a.stores.length - b.stores.length ||
    a.totalCents - b.totalCents ||
    a.travel.distanceKm - b.travel.distanceKm ||
    routeKey(a).localeCompare(routeKey(b));
}

function modeComparison(mode: OptimizationMode, a: Plan, b: Plan): number {
  switch (mode) {
    case OptimizationMode.Cheapest:
      return a.totalCents - b.totalCents;

    case OptimizationMode.Simplest:
      // Fewest shops, then least detour; price only breaks ties.
      return (
        a.stores.length - b.stores.length ||
        a.additionalDistanceKm - b.additionalDistanceKm
      );

    case OptimizationMode.BestBalance:
      return effectiveCostCents(a) - effectiveCostCents(b);
  }
}

/** Stable identity of a plan's route, for deterministic tie-breaking. */
function routeKey(plan: Plan): string {
  return plan.travel.storeOrder.join(',');
}

export function bestPlan(plans: Plan[], mode: OptimizationMode): Plan | null {
  return plans.length === 0
    ? null
    : [...plans].sort(comparePlans(mode))[0];
}
