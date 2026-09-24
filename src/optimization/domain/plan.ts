import type { Coordinates } from '../../supermarkets/domain/geo.js';
import { lineTotalCents } from '../../shopping-lists/domain/money.js';
import { estimateTravel, type TravelEstimate } from './travel.js';

/** One line of the list being priced. */
export interface OptimizationItem {
  productId: string;
  quantity: number;
}

/** A store that could be part of a plan, with what it charges. */
export interface CandidateStore {
  storeId: string;
  supermarketId: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  /** Price per unit, by product. A product absent here is not sold there. */
  prices: Map<string, number>;
}

export interface PlanAssignment {
  storeId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface StorePlan {
  storeId: string;
  supermarketId: string;
  /** Position in the route, from 1. */
  order: number;
  assignments: PlanAssignment[];
  subtotalCents: number;
}

export interface Plan {
  stores: StorePlan[];
  totalCents: number;
  /** Products no store in this plan sells. */
  missingProductIds: string[];
  coveredItemCount: number;
  travel: TravelEstimate;
  /** Travel beyond the single-store baseline, which is what a shopper feels. */
  additionalDistanceKm: number;
  additionalMinutes: number;
  /** Against the best single-store plan. Negative would mean it costs more. */
  savingsCents: number;
}

/**
 * Prices a list against one combination of stores.
 *
 * Each product goes to the cheapest store in the combination that sells it —
 * the shopper is visiting all of them anyway, so there is no reason to pay
 * more at one than another. A store the assignment never uses is dropped from
 * the plan rather than sending someone to a shop for nothing.
 */
export function buildPlan(
  items: OptimizationItem[],
  combination: CandidateStore[],
  home: Coordinates,
): Plan {
  const assignmentsByStore = new Map<string, PlanAssignment[]>();
  const missingProductIds: string[] = [];
  let totalCents = 0;

  for (const item of items) {
    let bestStore: CandidateStore | null = null;
    let bestUnitPrice = Number.POSITIVE_INFINITY;

    for (const store of combination) {
      const unitPrice = store.prices.get(item.productId);

      if (unitPrice === undefined) {
        continue;
      }

      // Ties go to the nearer store, then to the lower id, so the same inputs
      // always produce the same plan.
      const isBetter =
        unitPrice < bestUnitPrice ||
        (unitPrice === bestUnitPrice &&
          bestStore !== null &&
          (store.distanceKm < bestStore.distanceKm ||
            (store.distanceKm === bestStore.distanceKm &&
              store.storeId < bestStore.storeId)));

      if (isBetter) {
        bestStore = store;
        bestUnitPrice = unitPrice;
      }
    }

    if (!bestStore) {
      missingProductIds.push(item.productId);
      continue;
    }

    const lineTotal = lineTotalCents(item.quantity, bestUnitPrice);
    totalCents += lineTotal;

    assignmentsByStore.set(bestStore.storeId, [
      ...(assignmentsByStore.get(bestStore.storeId) ?? []),
      {
        storeId: bestStore.storeId,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: bestUnitPrice,
        lineTotalCents: lineTotal,
      },
    ]);
  }

  const usedStores = combination.filter((store) =>
    assignmentsByStore.has(store.storeId),
  );

  const travel = estimateTravel(
    home,
    usedStores.map((store) => ({
      storeId: store.storeId,
      latitude: store.latitude,
      longitude: store.longitude,
    })),
  );

  const stores: StorePlan[] = travel.storeOrder.map((storeId, index) => {
    const store = usedStores.find(
      (candidate) => candidate.storeId === storeId,
    ) as CandidateStore;
    const assignments = assignmentsByStore.get(storeId) ?? [];

    return {
      storeId,
      supermarketId: store.supermarketId,
      order: index + 1,
      assignments,
      subtotalCents: assignments.reduce(
        (sum, assignment) => sum + assignment.lineTotalCents,
        0,
      ),
    };
  });

  return {
    stores,
    totalCents,
    missingProductIds,
    coveredItemCount: items.length - missingProductIds.length,
    travel,
    // Filled in against the baseline once every plan has been built.
    additionalDistanceKm: 0,
    additionalMinutes: 0,
    savingsCents: 0,
  };
}

/**
 * Restates a plan relative to the simplest way to do the shop — one store.
 * "€6.60 cheaper for 1.8 km more" is the comparison a shopper actually makes.
 */
export function relativeTo(plan: Plan, baseline: Plan | null): Plan {
  if (!baseline) {
    return plan;
  }

  return {
    ...plan,
    additionalDistanceKm: round(
      Math.max(0, plan.travel.distanceKm - baseline.travel.distanceKm),
    ),
    additionalMinutes: Math.max(0, plan.travel.minutes - baseline.travel.minutes),
    savingsCents: baseline.totalCents - plan.totalCents,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
