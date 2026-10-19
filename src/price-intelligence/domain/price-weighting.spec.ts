import {
  lastSeenAt,
  MIN_RECENCY_WEIGHT,
  RECENCY_HALF_LIFE_DAYS,
  recencyWeight,
  SOURCE_WEIGHT,
  weightedPrice,
  weightOf,
  type WeightedObservation,
} from './price-weighting.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-22T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const observation = (
  overrides: Partial<WeightedObservation> = {},
): WeightedObservation => ({
  priceCents: 125,
  observedAt: now,
  sourceType: 'USER_REPORTED',
  status: 'ACCEPTED',
  userId: 'user-1',
  ...overrides,
});

describe('recencyWeight', () => {
  it('is full weight for a price seen just now', () => {
    expect(recencyWeight(now, now)).toBe(1);
  });

  it('halves over the half-life', () => {
    expect(recencyWeight(ago(RECENCY_HALF_LIFE_DAYS), now)).toBeCloseTo(0.5, 6);
    expect(recencyWeight(ago(2 * RECENCY_HALF_LIFE_DAYS), now)).toBeCloseTo(0.25, 6);
  });

  it('never falls to nothing, since some price beats no price', () => {
    expect(recencyWeight(ago(365), now)).toBe(MIN_RECENCY_WEIGHT);
  });
});

describe('weightOf', () => {
  it('trusts a paid price more than a typed one', () => {
    expect(weightOf(observation({ sourceType: 'PURCHASE_CONFIRMED' }), now)).toBeGreaterThan(
      weightOf(observation({ sourceType: 'USER_REPORTED' }), now),
    );
    expect(weightOf(observation({ sourceType: 'USER_WITH_EVIDENCE' }), now)).toBeGreaterThan(
      weightOf(observation({ sourceType: 'USER_REPORTED' }), now),
    );
  });

  it('discounts a flagged observation that survived corroboration', () => {
    const flagged = weightOf(observation({ status: 'FLAGGED' }), now);
    const clean = weightOf(observation(), now);

    expect(flagged).toBeLessThan(clean);
    expect(flagged).toBeCloseTo(clean * 0.3, 6);
  });

  it('combines source and recency', () => {
    expect(weightOf(observation({ sourceType: 'EXTERNAL_API', observedAt: ago(7) }), now))
      .toBeCloseTo(SOURCE_WEIGHT.EXTERNAL_API * 0.5, 6);
  });
});

describe('weightedPrice', () => {
  it('has no price without observations', () => {
    expect(weightedPrice([], now)).toBeNull();
  });

  it('leans toward the better-sourced observation', () => {
    const price = weightedPrice(
      [
        observation({ priceCents: 100, sourceType: 'PURCHASE_CONFIRMED' }),
        observation({ priceCents: 200, sourceType: 'USER_REPORTED' }),
      ],
      now,
    );

    // A plain average would say 150.
    expect(price!.priceCents).toBe(133);
  });

  it('leans toward the more recent observation', () => {
    const price = weightedPrice(
      [
        observation({ priceCents: 100, observedAt: now }),
        observation({ priceCents: 200, observedAt: ago(14) }),
      ],
      now,
    );

    expect(price!.priceCents).toBeLessThan(150);
  });

  it('is not moved far by one outlier among agreeing observations', () => {
    const agreeing = [120, 125, 130, 122, 128].map((priceCents) =>
      observation({ priceCents }),
    );
    const withOutlier = weightedPrice(
      [...agreeing, observation({ priceCents: 1000 })],
      now,
    );

    // An overwrite would make this 1000; a mean of six would be about 270.
    expect(withOutlier!.priceCents).toBeLessThan(280);
    expect(withOutlier!.maxPriceCents).toBe(1000);
  });

  it('reports the spread and the newest contributing observation', () => {
    const price = weightedPrice(
      [
        observation({ priceCents: 100, observedAt: ago(3) }),
        observation({ priceCents: 180, observedAt: ago(1) }),
      ],
      now,
    );

    expect(price).toMatchObject({
      minPriceCents: 100,
      maxPriceCents: 180,
      observationCount: 2,
      lastObservedAt: ago(1),
    });
  });
});

describe('lastSeenAt', () => {
  it('is when the price was observed, for an observation never confirmed', () => {
    expect(lastSeenAt(observation({ observedAt: ago(5) }), now)).toEqual(ago(5));
  });

  it('is the last confirmation, for a price a source kept seeing', () => {
    expect(
      lastSeenAt(observation({ observedAt: ago(20), lastConfirmedAt: ago(1) }), now),
    ).toEqual(ago(1));
  });

  it('ignores confirmations after the moment being judged', () => {
    // A day aggregated in hindsight must not borrow later confirmations.
    const asOf = ago(10);

    expect(
      lastSeenAt(observation({ observedAt: ago(20), lastConfirmedAt: ago(1) }), asOf),
    ).toEqual(asOf);
  });

  it('never reports a moment before the observation itself', () => {
    expect(
      lastSeenAt(observation({ observedAt: ago(3), lastConfirmedAt: ago(5) }), now),
    ).toEqual(ago(3));
  });
});

describe('a confirmed observation', () => {
  it('weighs as much as one made at its last confirmation', () => {
    const confirmed = observation({ observedAt: ago(25), lastConfirmedAt: ago(1) });
    const fresh = observation({ observedAt: ago(1) });

    expect(weightOf(confirmed, now)).toBeCloseTo(weightOf(fresh, now), 10);
  });

  it('makes the price as recent as the confirmation', () => {
    const price = weightedPrice(
      [observation({ observedAt: ago(25), lastConfirmedAt: ago(1) })],
      now,
    );

    expect(price!.lastObservedAt).toEqual(ago(1));
  });
});
