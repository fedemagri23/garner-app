import type { Plan } from './plan.js';

/** What the shopper is willing to do, in their own terms. */
export interface OptimizationConstraints {
  maxStores: number;
  maxAdditionalDistanceKm: number;
  maxAdditionalMinutes: number;
  /** What each extra stop must save to be worth making. */
  minSavingsCentsPerExtraStore: number;
  excludedSupermarketIds: string[];
}

export const ConstraintViolation = {
  TooManyStores: 'TOO_MANY_STORES',
  TooFar: 'TOO_FAR',
  TooLong: 'TOO_LONG',
  ExtraStoreNotWorthIt: 'EXTRA_STORE_NOT_WORTH_IT',
  ExcludedSupermarket: 'EXCLUDED_SUPERMARKET',
} as const;

export type ConstraintViolation =
  (typeof ConstraintViolation)[keyof typeof ConstraintViolation];

/**
 * Checks a plan against the shopper's limits.
 *
 * A plan that breaks one is never recommended, however cheap it is: the
 * limits are the shopper's decision, and quietly overriding them to save money
 * is exactly what the product must not do. Cheaper broken plans are kept
 * separately, so they can be shown as "you could save more if you went
 * further" without being presented as the answer.
 */
export function violationsOf(
  plan: Plan,
  constraints: OptimizationConstraints,
  baseline: Plan | null,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (plan.stores.length > constraints.maxStores) {
    violations.push(ConstraintViolation.TooManyStores);
  }

  if (plan.additionalDistanceKm > constraints.maxAdditionalDistanceKm) {
    violations.push(ConstraintViolation.TooFar);
  }

  if (plan.additionalMinutes > constraints.maxAdditionalMinutes) {
    violations.push(ConstraintViolation.TooLong);
  }

  if (
    plan.stores.some((store) =>
      constraints.excludedSupermarketIds.includes(store.supermarketId),
    )
  ) {
    violations.push(ConstraintViolation.ExcludedSupermarket);
  }

  // Every stop past the first has to earn its place. Measured against the
  // single-store baseline and shared across the extra stops, so a second shop
  // that saves a little and a third that saves nothing both fail.
  if (baseline && plan.stores.length > 1) {
    const extraStores = plan.stores.length - 1;
    const requiredSavings =
      extraStores * constraints.minSavingsCentsPerExtraStore;

    if (plan.savingsCents < requiredSavings) {
      violations.push(ConstraintViolation.ExtraStoreNotWorthIt);
    }
  }

  return violations;
}

export function satisfies(
  plan: Plan,
  constraints: OptimizationConstraints,
  baseline: Plan | null,
): boolean {
  return violationsOf(plan, constraints, baseline).length === 0;
}
