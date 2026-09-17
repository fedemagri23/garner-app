import {
  assessAgainstHistory,
  assessDeviation,
  median,
  SAME_STORE_THRESHOLDS,
} from './price-deviation.js';

describe('median', () => {
  it('handles odd and even sample counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('has no median without samples', () => {
    expect(median([])).toBeNull();
  });

  it('is not dragged by one bad value the way a mean is', () => {
    expect(median([100, 102, 98, 10_000])).toBe(101);
  });
});

describe('assessDeviation', () => {
  const recent = [120, 125, 130];

  it('cannot judge without enough history', () => {
    expect(assessDeviation(999, [125, 125], SAME_STORE_THRESHOLDS)).toBe('unknown');
  });

  it('accepts a price near the recent median', () => {
    expect(assessDeviation(135, recent, SAME_STORE_THRESHOLDS)).toBe('consistent');
  });

  it('marks a moderately unusual price', () => {
    expect(assessDeviation(200, recent, SAME_STORE_THRESHOLDS)).toBe('moderate');
  });

  it('marks an extreme price, in either direction', () => {
    expect(assessDeviation(1250, recent, SAME_STORE_THRESHOLDS)).toBe('extreme');
    expect(assessDeviation(12, recent, SAME_STORE_THRESHOLDS)).toBe('extreme');
  });
});

describe('assessAgainstHistory', () => {
  it('prefers the same store when it has enough history', () => {
    // 200 is moderate against this store, but consistent across stores.
    expect(
      assessAgainstHistory(200, [125, 125, 125], [190, 200, 210, 195, 205]),
    ).toBe('moderate');
  });

  it('falls back to all stores, with looser thresholds', () => {
    // 1.8x the cross-store median: moderate for one store, fine across stores.
    expect(assessAgainstHistory(225, [], [125, 125, 125, 125, 125])).toBe(
      'consistent',
    );
    expect(assessAgainstHistory(600, [], [125, 125, 125, 125, 125])).toBe(
      'extreme',
    );
  });

  it('is unknown for a product nobody has priced yet', () => {
    expect(assessAgainstHistory(125, [], [])).toBe('unknown');
  });
});
