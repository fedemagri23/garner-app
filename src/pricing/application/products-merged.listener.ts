import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type ProductPricesMovedEvent,
  type ProductsMergedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import { PRODUCT_PRICE_MOVER, type ProductPriceMover } from '../domain/product-price-mover.port.js';

/**
 * When the team folds a duplicate into another product, its prices follow:
 * every observation and import link moves over, and price intelligence is
 * told which stores to recompute.
 */
@Injectable()
export class ProductsMergedListener implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    @Inject(PRODUCT_PRICE_MOVER) private readonly mover: ProductPriceMover,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<ProductsMergedEvent>(DomainEventName.ProductsMerged, async (event) => {
      const { fromProductId, intoProductId } = event.payload;
      const storeIds = await this.mover.move(fromProductId, intoProductId);
      const moved: ProductPricesMovedEvent = createDomainEvent(DomainEventName.ProductPricesMoved, {
        fromProductId,
        intoProductId,
        storeIds,
      });
      await this.events.publish(moved);
    });
  }
}
