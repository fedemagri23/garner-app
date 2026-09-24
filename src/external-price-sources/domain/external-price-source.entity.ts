export const ImportRunStatus = {
  Started: 'STARTED',
  Completed: 'COMPLETED',
  Partial: 'PARTIAL',
  Failed: 'FAILED',
} as const;

export type ImportRunStatus =
  (typeof ImportRunStatus)[keyof typeof ImportRunStatus];

export const ProductMatchMethod = {
  Barcode: 'BARCODE',
  ExternalId: 'EXTERNAL_ID',
  NormalizedIdentity: 'NORMALIZED_IDENTITY',
  Manual: 'MANUAL',
} as const;

export type ProductMatchMethod =
  (typeof ProductMatchMethod)[keyof typeof ProductMatchMethod];

export const ExternalProductLinkStatus = {
  Matched: 'MATCHED',
  Unmatched: 'UNMATCHED',
  Ignored: 'IGNORED',
} as const;

export type ExternalProductLinkStatus =
  (typeof ExternalProductLinkStatus)[keyof typeof ExternalProductLinkStatus];

export interface ExternalPriceSource {
  id: string;
  name: string;
  slug: string;
  supermarketId: string;
  adapterKey: string;
  isEnabled: boolean;
  scheduleHourUtc: number;
  config: Record<string, unknown>;
  lastRunAt: Date | null;
  lastSuccessfulRunAt: Date | null;
  lastStatus: ImportRunStatus | null;
  consecutiveFailures: number;
}

export interface ImportRun {
  id: string;
  sourceId: string;
  runKey: string;
  status: ImportRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  productsSeen: number;
  pricesSeen: number;
  observationsCreated: number;
  matchedProducts: number;
  unmatchedProducts: number;
  skippedPrices: number;
  error: string | null;
}

export interface ExternalProductLink {
  id: string;
  sourceId: string;
  externalProductId: string;
  productId: string | null;
  externalName: string;
  externalBarcode: string | null;
  matchMethod: ProductMatchMethod | null;
  status: ExternalProductLinkStatus;
  lastSeenAt: Date;
}

/**
 * The slot a run belongs to: one import per source per day. Two triggers for
 * the same day — the scheduler and an operator pressing "import now" — resume
 * the same run rather than importing twice.
 */
export function dailyRunKey(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/**
 * Whether a source's daily slot has come round and has not been served.
 * Checked every few minutes rather than fired exactly at the hour, so a
 * deployment or outage over the scheduled minute does not skip a day.
 */
export function isImportDue(
  source: Pick<ExternalPriceSource, 'isEnabled' | 'scheduleHourUtc'>,
  lastRunKey: string | null,
  now: Date,
): boolean {
  if (!source.isEnabled) {
    return false;
  }

  if (now.getUTCHours() < source.scheduleHourUtc) {
    return false;
  }

  return lastRunKey !== dailyRunKey(now);
}
