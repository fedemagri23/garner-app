/**
 * Daily aggregates and what can be read from a run of them.
 */

export interface DailyPricePoint {
  date: Date;
  weightedAverageCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  observationCount: number;
  confidence: number;
  isAnomalous: boolean;
}

/** The ranges the product offers. */
export const HistoryRange = {
  Days30: '30d',
  Days90: '90d',
  Months6: '6m',
  Year1: '1y',
} as const;

export type HistoryRange = (typeof HistoryRange)[keyof typeof HistoryRange];

export const HISTORY_RANGE_DAYS: Record<HistoryRange, number> = {
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '1y': 365,
};

/** The UTC day an observation belongs to. */
export function utcDay(moment: Date): Date {
  return new Date(
    Date.UTC(
      moment.getUTCFullYear(),
      moment.getUTCMonth(),
      moment.getUTCDate(),
    ),
  );
}

/**
 * A day's average moving this far from the day before is treated as an
 * anomaly: a real price change of 50% overnight is rare enough to be worth
 * looking at, and a data problem that size is worth catching.
 */
export const ANOMALY_RATIO = 1.5;

export function isAbruptChange(
  previousCents: number | null,
  currentCents: number,
): boolean {
  if (previousCents === null || previousCents <= 0 || currentCents <= 0) {
    return false;
  }

  const ratio = Math.max(
    currentCents / previousCents,
    previousCents / currentCents,
  );

  return ratio >= ANOMALY_RATIO;
}

/**
 * Collapses several stores' rows for the same day into one point, for a
 * product-wide history. Each store's day counts in proportion to how many
 * observations stand behind it, so a store with one report does not weigh as
 * much as one with twenty.
 */
export function mergeByDate(points: DailyPricePoint[]): DailyPricePoint[] {
  const byDay = new Map<number, DailyPricePoint[]>();

  for (const point of points) {
    const key = point.date.getTime();
    byDay.set(key, [...(byDay.get(key) ?? []), point]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, dayPoints]) => {
      const totalObservations = dayPoints.reduce(
        (sum, point) => sum + point.observationCount,
        0,
      );

      const weighted = dayPoints.reduce(
        (sum, point) =>
          sum +
          point.weightedAverageCents *
            (totalObservations > 0
              ? point.observationCount / totalObservations
              : 1 / dayPoints.length),
        0,
      );

      return {
        date: new Date(time),
        weightedAverageCents: Math.round(weighted),
        minPriceCents: Math.min(...dayPoints.map((point) => point.minPriceCents)),
        maxPriceCents: Math.max(...dayPoints.map((point) => point.maxPriceCents)),
        observationCount: totalObservations,
        confidence:
          dayPoints.reduce((sum, point) => sum + point.confidence, 0) /
          dayPoints.length,
        // One anomalous store taints the day for the product as a whole: the
        // summary should not lean on a day something odd happened in.
        isAnomalous: dayPoints.some((point) => point.isAnomalous),
      };
    });
}

export interface PriceTrend {
  /** Unweighted mean of the daily averages in the range. */
  averageCents: number;
  lowestCents: number;
  highestCents: number;
  /** Percent change from the first day in the range to the last, one decimal. */
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
}

/** Below this, a change is noise rather than a trend worth naming. */
export const STABLE_BAND_PERCENT = 1;

/**
 * Summarizes a run of daily points, as the history view shows it: what a
 * product usually costs, the best it has been, and which way it is going.
 *
 * Anomalous days are left out of the summary — they are exactly the days whose
 * numbers should not become "the average" — but remain in the series the
 * client draws, so a spike stays visible.
 */
export function summarizeTrend(points: DailyPricePoint[]): PriceTrend | null {
  const usable = points.filter((point) => !point.isAnomalous);

  if (usable.length === 0) {
    return null;
  }

  const ordered = [...usable].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const averages = ordered.map((point) => point.weightedAverageCents);
  const first = averages[0];
  const last = averages[averages.length - 1];

  const changePercent =
    first > 0 ? Number((((last - first) / first) * 100).toFixed(1)) : 0;

  return {
    averageCents: Math.round(
      averages.reduce((sum, value) => sum + value, 0) / averages.length,
    ),
    lowestCents: Math.min(...ordered.map((point) => point.minPriceCents)),
    highestCents: Math.max(...ordered.map((point) => point.maxPriceCents)),
    changePercent,
    direction:
      Math.abs(changePercent) < STABLE_BAND_PERCENT
        ? 'stable'
        : changePercent > 0
          ? 'up'
          : 'down',
  };
}
