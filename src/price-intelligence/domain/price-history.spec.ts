import {
  isAbruptChange,
  mergeByDate,
  summarizeTrend,
  utcDay,
  type DailyPricePoint,
} from './price-history.js';

const point = (
  date: string,
  weightedAverageCents: number,
  overrides: Partial<DailyPricePoint> = {},
): DailyPricePoint => ({
  date: new Date(date),
  weightedAverageCents,
  minPriceCents: weightedAverageCents - 5,
  maxPriceCents: weightedAverageCents + 5,
  observationCount: 3,
  confidence: 0.8,
  isAnomalous: false,
  ...overrides,
});

describe('utcDay', () => {
  it('truncates to the UTC calendar day', () => {
    expect(utcDay(new Date('2026-09-22T23:45:00Z')).toISOString()).toBe(
      '2026-09-22T00:00:00.000Z',
    );
  });
});

describe('isAbruptChange', () => {
  it('ignores an ordinary move', () => {
    expect(isAbruptChange(125, 130)).toBe(false);
  });

  it('catches a sharp move in either direction', () => {
    expect(isAbruptChange(125, 200)).toBe(true);
    expect(isAbruptChange(200, 125)).toBe(true);
  });

  it('has nothing to compare on the first day', () => {
    expect(isAbruptChange(null, 125)).toBe(false);
  });
});

describe('summarizeTrend', () => {
  it('reports average, lowest, highest and the change across the range', () => {
    expect(
      summarizeTrend([
        point('2026-09-01', 100),
        point('2026-09-10', 110),
        point('2026-09-20', 90),
      ]),
    ).toEqual({
      averageCents: 100,
      lowestCents: 85,
      highestCents: 115,
      changePercent: -10,
      direction: 'down',
    });
  });

  it('orders by date rather than trusting the input order', () => {
    const shuffled = summarizeTrend([
      point('2026-09-20', 90),
      point('2026-09-01', 100),
    ]);

    expect(shuffled!.changePercent).toBe(-10);
  });

  it('calls a small move stable rather than a trend', () => {
    expect(summarizeTrend([point('2026-09-01', 100), point('2026-09-20', 100.5)])!.direction)
      .toBe('stable');
  });

  it('keeps an anomalous day out of the summary', () => {
    const withSpike = summarizeTrend([
      point('2026-09-01', 100),
      point('2026-09-10', 900, { isAnomalous: true }),
      point('2026-09-20', 104),
    ]);

    expect(withSpike).toMatchObject({ averageCents: 102, direction: 'up' });
    expect(withSpike!.highestCents).toBeLessThan(900);
  });

  it('has nothing to summarize without usable days', () => {
    expect(summarizeTrend([])).toBeNull();
    expect(summarizeTrend([point('2026-09-01', 100, { isAnomalous: true })])).toBeNull();
  });
});

describe('mergeByDate', () => {
  it('collapses one day across stores, weighting by observation count', () => {
    const merged = mergeByDate([
      point('2026-09-01', 100, { observationCount: 1, minPriceCents: 100, maxPriceCents: 100 }),
      point('2026-09-01', 200, { observationCount: 3, minPriceCents: 190, maxPriceCents: 210 }),
    ]);

    expect(merged).toHaveLength(1);
    // The store with three observations pulls the day toward 200.
    expect(merged[0]).toMatchObject({
      weightedAverageCents: 175,
      minPriceCents: 100,
      maxPriceCents: 210,
      observationCount: 4,
    });
  });

  it('orders days oldest first', () => {
    const merged = mergeByDate([point('2026-09-20', 120), point('2026-09-01', 100)]);

    expect(merged.map((day) => day.date.toISOString().slice(0, 10))).toEqual([
      '2026-09-01',
      '2026-09-20',
    ]);
  });

  it('marks the day anomalous if any store’s day was', () => {
    const merged = mergeByDate([
      point('2026-09-01', 100),
      point('2026-09-01', 900, { isAnomalous: true }),
    ]);

    expect(merged[0].isAnomalous).toBe(true);
  });
});
