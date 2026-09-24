import type { OptimizationConstraints } from './constraints.js';
import { optimize, type OptimizationInput } from './optimizer.js';
import type { CandidateStore } from './plan.js';

/**
 * Fixtures are deliberately flat and readable: a recommendation people will
 * act on has to be explainable, and a test that needs a spreadsheet to follow
 * is not explaining anything.
 */
const home = { latitude: -34.6037, longitude: -58.3816 };

/** About 1.1 km per 0.01 degree of latitude here. */
const storeAt = (
  storeId: string,
  supermarketId: string,
  kmAway: number,
  prices: Record<string, number>,
): CandidateStore => ({
  storeId,
  supermarketId,
  latitude: home.latitude - kmAway / 111.32,
  longitude: home.longitude,
  distanceKm: kmAway,
  prices: new Map(Object.entries(prices)),
});

const constraints = (
  overrides: Partial<OptimizationConstraints> = {},
): OptimizationConstraints => ({
  maxStores: 3,
  maxAdditionalDistanceKm: 20,
  maxAdditionalMinutes: 120,
  minSavingsCentsPerExtraStore: 0,
  excludedSupermarketIds: [],
  ...overrides,
});

const items = [
  { productId: 'milk', quantity: 1 },
  { productId: 'bread', quantity: 2 },
];

const run = (overrides: Partial<OptimizationInput> = {}) =>
  optimize({
    items,
    home,
    stores: [],
    constraints: constraints(),
    ...overrides,
  });

describe('optimize', () => {
  const cheapMilk = storeAt('cheap-milk', 'chain-a', 1, { milk: 100, bread: 300 });
  const cheapBread = storeAt('cheap-bread', 'chain-b', 1.2, { milk: 200, bread: 100 });
  const middling = storeAt('middling', 'chain-c', 0.5, { milk: 130, bread: 130 });

  it('has nothing to recommend without stores', () => {
    expect(run()).toMatchObject({
      cheapest: null,
      bestBalance: null,
      simplest: null,
      unavailableProductIds: ['milk', 'bread'],
    });
  });

  it('sends each product to the cheapest store of the combination', () => {
    const result = run({ stores: [cheapMilk, cheapBread] });

    // Milk at 100 plus two bread at 100.
    expect(result.cheapest).toMatchObject({ totalCents: 300, missingProductIds: [] });

    const assignments = result.cheapest!.stores.flatMap((store) =>
      store.assignments.map((assignment) => [store.storeId, assignment.productId]),
    );
    expect(assignments).toEqual(
      expect.arrayContaining([
        ['cheap-milk', 'milk'],
        ['cheap-bread', 'bread'],
      ]),
    );
  });

  it('quotes savings and extra travel against shopping at one store', () => {
    const result = run({ stores: [cheapMilk, cheapBread, middling] });

    // One store would be the middling one: 130 + 260 = 390.
    expect(result.simplest).toMatchObject({ totalCents: 390, savingsCents: 0 });
    expect(result.cheapest!.savingsCents).toBe(90);
    expect(result.cheapest!.additionalDistanceKm).toBeGreaterThan(0);
  });

  it('prefers one store when splitting saves little', () => {
    const result = run({
      stores: [
        storeAt('one-stop', 'chain-a', 0.5, { milk: 130, bread: 130 }),
        storeAt('barely-cheaper', 'chain-b', 6, { milk: 125, bread: 129 }),
      ],
    });

    expect(result.bestBalance!.stores).toHaveLength(1);
    expect(result.bestBalance!.stores[0].storeId).toBe('one-stop');
  });

  it('counts quantity, not just unit price', () => {
    const result = run({
      items: [{ productId: 'bread', quantity: 10 }],
      stores: [
        storeAt('a', 'chain-a', 1, { bread: 100 }),
        storeAt('b', 'chain-b', 1, { bread: 90 }),
      ],
    });

    expect(result.cheapest!.totalCents).toBe(900);
  });

  it('reports products no store sells, and still plans the rest', () => {
    const result = run({
      items: [...items, { productId: 'caviar', quantity: 1 }],
      stores: [cheapMilk, cheapBread],
    });

    expect(result.unavailableProductIds).toEqual(['caviar']);
    expect(result.cheapest!.missingProductIds).toEqual(['caviar']);
    expect(result.cheapest!.coveredItemCount).toBe(2);
  });

  it('never prefers a cheaper plan that buys less of the list', () => {
    const result = run({
      stores: [
        storeAt('complete', 'chain-a', 1, { milk: 500, bread: 500 }),
        storeAt('milk-only', 'chain-b', 1, { milk: 10 }),
      ],
      constraints: constraints({ maxStores: 1 }),
    });

    // Milk alone would cost 10; buying the whole list costs 1500.
    expect(result.cheapest!.coveredItemCount).toBe(2);
    expect(result.cheapest!.totalCents).toBe(1500);
  });

  it('drops a store the assignment never uses', () => {
    const result = run({
      stores: [
        storeAt('good', 'chain-a', 1, { milk: 100, bread: 100 }),
        storeAt('dearer', 'chain-b', 1, { milk: 900, bread: 900 }),
      ],
    });

    expect(result.cheapest!.stores).toHaveLength(1);
    expect(result.cheapest!.travel.storeOrder).toEqual(['good']);
  });

  describe('constraints', () => {
    it('never recommends more stores than allowed', () => {
      const result = run({
        items: [
          { productId: 'milk', quantity: 1 },
          { productId: 'bread', quantity: 1 },
          { productId: 'eggs', quantity: 1 },
        ],
        stores: [
          storeAt('a', 'chain-a', 1, { milk: 10, bread: 900, eggs: 900 }),
          storeAt('b', 'chain-b', 1, { milk: 900, bread: 10, eggs: 900 }),
          storeAt('c', 'chain-c', 1, { milk: 900, bread: 900, eggs: 10 }),
        ],
        constraints: constraints({ maxStores: 2 }),
      });

      expect(result.cheapest!.stores.length).toBeLessThanOrEqual(2);
    });

    it('shows the cheaper plan it refused, and why', () => {
      const result = run({
        items: [
          { productId: 'milk', quantity: 1 },
          { productId: 'bread', quantity: 1 },
          { productId: 'eggs', quantity: 1 },
        ],
        stores: [
          storeAt('a', 'chain-a', 1, { milk: 10, bread: 900, eggs: 900 }),
          storeAt('b', 'chain-b', 1, { milk: 900, bread: 10, eggs: 900 }),
          storeAt('c', 'chain-c', 1, { milk: 900, bread: 900, eggs: 10 }),
        ],
        constraints: constraints({ maxStores: 2 }),
      });

      const rejected = result.rejectedCheaperAlternatives[0];
      expect(rejected.plan.totalCents).toBeLessThan(result.cheapest!.totalCents);
      expect(rejected.violations).toContain('TOO_MANY_STORES');
    });

    it('will not send a shopper further than they agreed to go', () => {
      const result = run({
        stores: [
          storeAt('near', 'chain-a', 0.5, { milk: 200, bread: 200 }),
          storeAt('distant', 'chain-b', 30, { milk: 10, bread: 10 }),
        ],
        constraints: constraints({ maxAdditionalDistanceKm: 2 }),
      });

      expect(result.cheapest!.stores.map((store) => store.storeId)).toEqual(['near']);
      expect(result.rejectedCheaperAlternatives[0].violations).toContain('TOO_FAR');
    });

    it('will not add a stop that does not save enough to be worth it', () => {
      const result = run({
        // Splitting saves 10 cents: real, but not worth a second shop.
        stores: [
          storeAt('one-stop', 'chain-a', 0.5, { milk: 130, bread: 130 }),
          storeAt('cheaper-milk', 'chain-b', 0.6, { milk: 120, bread: 135 }),
        ],
        constraints: constraints({ minSavingsCentsPerExtraStore: 500 }),
      });

      expect(result.cheapest!.stores).toHaveLength(1);
      expect(
        result.rejectedCheaperAlternatives.some((rejected) =>
          rejected.violations.includes('EXTRA_STORE_NOT_WORTH_IT'),
        ),
      ).toBe(true);
    });

    it('keeps an excluded chain out of every recommendation', () => {
      const result = run({
        stores: [cheapMilk, cheapBread, middling],
        constraints: constraints({ excludedSupermarketIds: ['chain-a'] }),
      });

      const chains = [
        result.cheapest,
        result.bestBalance,
        result.simplest,
      ].flatMap((plan) => plan!.stores.map((store) => store.supermarketId));

      expect(chains).not.toContain('chain-a');
      // And it is not offered as a tempting alternative either.
      expect(
        result.rejectedCheaperAlternatives.flatMap((rejected) =>
          rejected.plan.stores.map((store) => store.supermarketId),
        ),
      ).not.toContain('chain-a');
    });
  });

  describe('the three alternatives', () => {
    const spread = [
      storeAt('everything', 'chain-a', 0.5, { milk: 200, bread: 200 }),
      storeAt('cheap-far-milk', 'chain-b', 8, { milk: 100 }),
      storeAt('cheap-far-bread', 'chain-c', 9, { bread: 100 }),
    ];

    it('cheapest goes for the lowest bill', () => {
      const result = run({ stores: spread });

      expect(result.cheapest!.totalCents).toBe(300);
      expect(result.cheapest!.stores).toHaveLength(2);
    });

    it('simplest goes for one store', () => {
      const result = run({ stores: spread });

      expect(result.simplest!.stores).toHaveLength(1);
      expect(result.simplest!.stores[0].storeId).toBe('everything');
    });

    it('best balance sits between them', () => {
      const result = run({ stores: spread });

      expect(result.bestBalance!.totalCents).toBeGreaterThanOrEqual(
        result.cheapest!.totalCents,
      );
      expect(result.bestBalance!.totalCents).toBeLessThanOrEqual(
        result.simplest!.totalCents,
      );
    });
  });

  it('is deterministic: the same inputs give the same plans', () => {
    const stores = [cheapMilk, cheapBread, middling];

    expect(JSON.stringify(run({ stores }))).toBe(
      JSON.stringify(run({ stores: [...stores].reverse() })),
    );
  });

  it('stays bounded when many stores are nearby', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      storeAt(`store-${index}`, `chain-${index}`, index * 0.1, {
        milk: 100 + index,
        bread: 200 - index,
      }),
    );

    const result = run({ stores: many, constraints: constraints({ maxStores: 3 }) });

    expect(result.consideredStoreCount).toBeLessThanOrEqual(12);
    // Singles, pairs, triples, and quadruples one past the limit.
    expect(result.consideredCombinationCount).toBeLessThanOrEqual(1_000);
    expect(result.cheapest).not.toBeNull();
  });
});
