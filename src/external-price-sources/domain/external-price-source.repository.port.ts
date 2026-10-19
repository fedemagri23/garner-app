import type {
  ExternalPriceSource,
  ExternalProductLink,
  ExternalProductLinkStatus,
  ImportRun,
  ImportRunStatus,
  ProductMatchMethod,
} from './external-price-source.entity.js';

export interface CreateSourceInput {
  name: string;
  slug: string;
  supermarketId: string;
  adapterKey: string;
  scheduleHourUtc: number;
  config: Record<string, unknown>;
}

export interface UpdateSourceInput {
  name?: string;
  isEnabled?: boolean;
  scheduleHourUtc?: number;
  config?: Record<string, unknown>;
}

export interface ImportRunTotals {
  productsSeen: number;
  pricesSeen: number;
  observationsCreated: number;
  /** Unchanged prices recorded as a confirmation of the previous observation. */
  observationsConfirmed: number;
  matchedProducts: number;
  unmatchedProducts: number;
  skippedPrices: number;
}

export interface ExternalPriceSourceRepository {
  findAll(): Promise<ExternalPriceSource[]>;
  findById(id: string): Promise<ExternalPriceSource | null>;
  findBySlug(slug: string): Promise<ExternalPriceSource | null>;
  findEnabled(): Promise<ExternalPriceSource[]>;
  create(input: CreateSourceInput): Promise<ExternalPriceSource>;
  update(id: string, input: UpdateSourceInput): Promise<ExternalPriceSource>;
  recordRunOutcome(
    sourceId: string,
    outcome: { status: ImportRunStatus; finishedAt: Date },
  ): Promise<void>;
}

export const EXTERNAL_PRICE_SOURCE_REPOSITORY = Symbol(
  'EXTERNAL_PRICE_SOURCE_REPOSITORY',
);

/**
 * What a trigger got when it asked for a slot's run:
 * - `created` — nobody had started it; this trigger runs it.
 * - `resumed` — it was left STARTED by a crash (no recent heartbeat); this
 *   trigger takes it over.
 * - `running` — someone else is running it right now; leave it alone.
 * - `finished` — it already ended; nothing to do.
 */
export type ImportRunClaim = 'created' | 'resumed' | 'running' | 'finished';

export interface ImportRunRepository {
  /**
   * Claims the run for this slot. A STARTED run is taken over only when its
   * heartbeat is older than `staleBefore`, and only by one claimant.
   */
  startOrResume(
    sourceId: string,
    runKey: string,
    staleBefore: Date,
  ): Promise<{ run: ImportRun; claim: ImportRunClaim }>;
  /** Proves the run is still alive, so nobody takes it over. */
  heartbeat(runId: string): Promise<void>;
  finish(
    runId: string,
    outcome: {
      status: ImportRunStatus;
      totals: ImportRunTotals;
      error: string | null;
    },
  ): Promise<ImportRun>;
  findRecent(sourceId: string, limit: number): Promise<ImportRun[]>;
  /** The most recent run key, to tell whether today's slot has been served. */
  findLastRunKey(sourceId: string): Promise<string | null>;
}

export const IMPORT_RUN_REPOSITORY = Symbol('IMPORT_RUN_REPOSITORY');

export interface ExternalProductLinkRepository {
  findBySource(
    sourceId: string,
    externalProductIds: string[],
  ): Promise<ExternalProductLink[]>;
  findOne(
    sourceId: string,
    externalProductId: string,
  ): Promise<ExternalProductLink | null>;
  listByStatus(
    sourceId: string,
    status: ExternalProductLinkStatus,
    page: { skip: number; take: number },
  ): Promise<{ links: ExternalProductLink[]; totalItems: number }>;
  /** Records what the source called a product and what it was matched to. */
  save(link: {
    sourceId: string;
    externalProductId: string;
    externalName: string;
    externalBarcode: string | null;
    productId: string | null;
    matchMethod: ProductMatchMethod | null;
    status: ExternalProductLinkStatus;
    lastSeenAt: Date;
  }): Promise<ExternalProductLink>;
}

export const EXTERNAL_PRODUCT_LINK_REPOSITORY = Symbol(
  'EXTERNAL_PRODUCT_LINK_REPOSITORY',
);

export interface ExternalStoreLinkRepository {
  /** External store id to core store id, for every store the source knows. */
  mapForSource(sourceId: string): Promise<Map<string, string>>;
  link(sourceId: string, externalStoreId: string, storeId: string): Promise<void>;
  unlink(sourceId: string, externalStoreId: string): Promise<void>;
}

export const EXTERNAL_STORE_LINK_REPOSITORY = Symbol(
  'EXTERNAL_STORE_LINK_REPOSITORY',
);
