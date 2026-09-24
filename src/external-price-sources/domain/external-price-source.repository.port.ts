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

export interface ImportRunRepository {
  /** Starts the run for this slot, or returns the one already there. */
  startOrResume(
    sourceId: string,
    runKey: string,
  ): Promise<{ run: ImportRun; created: boolean }>;
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
