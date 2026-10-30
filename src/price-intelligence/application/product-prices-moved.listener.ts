import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventName, type ProductPricesMovedEvent } from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import { MERGED_PRODUCT_CLEANUP, type MergedProductCleanup } from '../domain/merged-product-cleanup.port.js';
import { PriceIntelligenceJobs } from '../infrastructure/price-intelligence.queue.js';

/**
 * After a merge moved a duplicate's prices: what was derived for the
 * duplicate goes, and the kept product is recomputed at every store the
 * duplicate had prices at.
 */
@Injectable()
export class ProductPricesMovedListener implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    @Inject(MERGED_PRODUCT_CLEANUP) private readonly cleanup: MergedProductCleanup,
    private readonly jobs: PriceIntelligenceJobs,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<ProductPricesMovedEvent>(DomainEventName.ProductPricesMoved, async (event) => {
      const { fromProductId, intoProductId, storeIds } = event.payload;
      await this.cleanup.forget(fromProductId);
      for (const storeId of storeIds) {
        await this.jobs.enqueueRecompute(intoProductId, storeId);
      }
    });
  }
}
