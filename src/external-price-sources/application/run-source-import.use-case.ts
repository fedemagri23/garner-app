import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type ExternalPriceImportCompletedEvent,
  type ExternalPriceImportStartedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import { IngestPriceObservationService } from '../../pricing/application/ingest-price-observation.service.js';
import { PriceSourceType } from '../../pricing/domain/price-observation.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import {
  dailyRunKey,
  ExternalProductLinkStatus,
  ImportRunStatus,
  type ExternalPriceSource,
  type ImportRun,
} from '../domain/external-price-source.entity.js';
import {
  EXTERNAL_PRICE_SOURCE_REPOSITORY,
  EXTERNAL_PRODUCT_LINK_REPOSITORY,
  EXTERNAL_STORE_LINK_REPOSITORY,
  IMPORT_RUN_REPOSITORY,
  type ExternalPriceSourceRepository,
  type ExternalProductLinkRepository,
  type ExternalStoreLinkRepository,
  type ImportRunRepository,
  type ImportRunTotals,
} from '../domain/external-price-source.repository.port.js';
import {
  ADAPTER_REGISTRY,
  AdapterError,
  type AdapterRegistry,
  type ExternalProduct,
} from '../domain/price-source-adapter.port.js';
import {
  externalBarcode,
  externalMatchKey,
  matchExternalProduct,
} from '../domain/product-matching.js';

export interface ImportOutcome {
  run: ImportRun;
  status: ImportRunStatus;
}

/**
 * Runs one source's daily import end to end:
 *
 *   adapter → normalize → match products → validate → observations
 *
 * External prices are not a separate path. They become EXTERNAL_API
 * observations and go through the same ingestion pipeline as a shopper's
 * report, so the same plausibility checks, the same deviation rules and the
 * same derived-price weighting apply to a supermarket feed.
 *
 * Safe to run twice for the same day: the run is keyed by its slot, and each
 * observation is keyed by run, product and store, so a retry after a crash
 * fills in what is missing and rewrites nothing.
 */
@Injectable()
export class RunSourceImportUseCase {
  private readonly logger = new Logger(RunSourceImportUseCase.name);

  constructor(
    @Inject(EXTERNAL_PRICE_SOURCE_REPOSITORY)
    private readonly sources: ExternalPriceSourceRepository,
    @Inject(IMPORT_RUN_REPOSITORY) private readonly runs: ImportRunRepository,
    @Inject(EXTERNAL_PRODUCT_LINK_REPOSITORY)
    private readonly links: ExternalProductLinkRepository,
    @Inject(EXTERNAL_STORE_LINK_REPOSITORY)
    private readonly storeLinks: ExternalStoreLinkRepository,
    @Inject(ADAPTER_REGISTRY) private readonly adapters: AdapterRegistry,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly ingestion: IngestPriceObservationService,
    private readonly events: EventBus,
  ) {}

  async execute(sourceId: string, runKey?: string): Promise<ImportOutcome> {
    const source = await this.sources.findById(sourceId);

    if (!source) {
      throw new AdapterError(`Unknown price source ${sourceId}`);
    }

    const key = runKey ?? dailyRunKey(new Date());
    const { run, created } = await this.runs.startOrResume(source.id, key);

    if (!created && run.status !== ImportRunStatus.Started) {
      // Today's slot has already been served; a second trigger is a no-op.
      return { run, status: run.status };
    }

    const started: ExternalPriceImportStartedEvent = createDomainEvent(
      DomainEventName.ExternalPriceImportStarted,
      {
        sourceId: source.id,
        sourceSlug: source.slug,
        runId: run.id,
        runKey: key,
      },
    );
    await this.events.publish(started);

    const totals: ImportRunTotals = {
      productsSeen: 0,
      pricesSeen: 0,
      observationsCreated: 0,
      matchedProducts: 0,
      unmatchedProducts: 0,
      skippedPrices: 0,
    };

    let status: ImportRunStatus;
    let error: string | null = null;

    try {
      await this.importFrom(source, key, totals);

      // Everything the source sent was used, or some of it could not be.
      status =
        totals.unmatchedProducts === 0 && totals.skippedPrices === 0
          ? ImportRunStatus.Completed
          : ImportRunStatus.Partial;
    } catch (failure) {
      status = ImportRunStatus.Failed;
      error = failure instanceof Error ? failure.message : String(failure);

      // One supermarket being down, misconfigured or slow must not stop the
      // others: the failure is recorded against this source and the run ends.
      this.logger.error(
        `Import for source ${source.slug} failed: ${error}`,
        failure instanceof Error ? failure.stack : undefined,
      );
    }

    const finished = await this.runs.finish(run.id, { status, totals, error });
    await this.sources.recordRunOutcome(source.id, {
      status,
      finishedAt: finished.finishedAt ?? new Date(),
    });

    const completed: ExternalPriceImportCompletedEvent = createDomainEvent(
      DomainEventName.ExternalPriceImportCompleted,
      {
        sourceId: source.id,
        sourceSlug: source.slug,
        runId: run.id,
        runKey: key,
        status,
        observationsCreated: totals.observationsCreated,
        unmatchedProducts: totals.unmatchedProducts,
        skippedPrices: totals.skippedPrices,
        error,
      },
    );
    await this.events.publish(completed);

    return { run: finished, status };
  }

  private async importFrom(
    source: ExternalPriceSource,
    runKey: string,
    totals: ImportRunTotals,
  ): Promise<void> {
    const adapter = this.adapters.get(source.adapterKey);

    if (!adapter) {
      throw new AdapterError(
        `Source ${source.slug} names unknown adapter "${source.adapterKey}"`,
      );
    }

    const context = { sourceSlug: source.slug, config: source.config };

    const products = await adapter.fetchProducts(context);
    totals.productsSeen = products.length;

    const productIdByExternalId = await this.linkProducts(
      source,
      products,
      totals,
    );

    const prices = await adapter.fetchPrices(context);
    totals.pricesSeen = prices.length;

    const storeIdByExternalId = await this.storeLinks.mapForSource(source.id);

    for (const price of prices) {
      const productId = productIdByExternalId.get(price.externalProductId);
      const storeId = storeIdByExternalId.get(price.externalStoreId);

      // A price we cannot place — an unmatched product, or a branch nobody has
      // mapped to a store — is counted, not guessed at.
      if (!productId || !storeId) {
        totals.skippedPrices += 1;
        continue;
      }

      try {
        await this.ingestion.ingest({
          productId,
          storeId,
          priceCents: price.priceCents,
          currency: price.currency,
          observedAt: price.observedAt ?? new Date(),
          sourceType: PriceSourceType.ExternalApi,
          userId: null,
          // One observation per product, store and run: a retried run rewrites
          // nothing and adds only what the first attempt missed.
          dedupeKey: `external:${source.id}:${runKey}:${price.externalProductId}:${price.externalStoreId}`,
        });

        totals.observationsCreated += 1;
      } catch (failure) {
        // A price the pipeline refuses (implausible, a deleted store) is this
        // row's problem, not the import's.
        if (!(failure instanceof HttpException)) {
          throw failure;
        }

        totals.skippedPrices += 1;
        this.logger.warn(
          `Source ${source.slug} price for ${price.externalProductId} skipped: ${failure.message}`,
        );
      }
    }
  }

  /**
   * Records what the source calls each product and ties it to ours where that
   * can be done confidently. Anything ambiguous is left UNMATCHED for a person
   * — never resolved by creating a second canonical product.
   */
  private async linkProducts(
    source: ExternalPriceSource,
    products: ExternalProduct[],
    totals: ImportRunTotals,
  ): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    const seenAt = new Date();

    const existing = await this.links.findBySource(
      source.id,
      products.map((product) => product.externalId),
    );
    const linkByExternalId = new Map(
      existing.map((link) => [link.externalProductId, link]),
    );

    for (const product of products) {
      const link = linkByExternalId.get(product.externalId);

      // A product a person decided has no counterpart stays that way.
      if (link?.status === ExternalProductLinkStatus.Ignored) {
        continue;
      }

      const barcode = externalBarcode(product);

      const match = matchExternalProduct(product, {
        linkedProductId: link?.productId ?? null,
        byBarcode: barcode ? await this.products.findByBarcode(barcode) : null,
        byNormalizedName: await this.products.findByNormalizedName(
          externalMatchKey(product),
        ),
      });

      await this.links.save({
        sourceId: source.id,
        externalProductId: product.externalId,
        externalName: product.name,
        externalBarcode: barcode,
        productId: match?.productId ?? null,
        matchMethod: match?.method ?? null,
        status: match
          ? ExternalProductLinkStatus.Matched
          : ExternalProductLinkStatus.Unmatched,
        lastSeenAt: seenAt,
      });

      if (match) {
        resolved.set(product.externalId, match.productId);
        totals.matchedProducts += 1;
      } else {
        totals.unmatchedProducts += 1;
      }
    }

    return resolved;
  }
}
