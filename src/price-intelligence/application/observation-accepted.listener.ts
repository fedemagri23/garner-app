import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  DomainEventName,
  type PriceObservationAcceptedEvent,
  type PriceObservationCreatedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import { PriceIntelligenceJobs } from '../infrastructure/price-intelligence.queue.js';

/**
 * Keeps derived prices current as observations arrive.
 *
 * Both accepted and flagged observations trigger a recompute: a flagged one
 * may be released by corroboration, and the recompute is what notices. The
 * listener only enqueues, so a slow recalculation never delays the contributor
 * who submitted the price.
 */
@Injectable()
export class ObservationAcceptedListener implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly jobs: PriceIntelligenceJobs,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<PriceObservationAcceptedEvent>(
      DomainEventName.PriceObservationAccepted,
      async (event) => {
        await this.jobs.enqueueRecompute(
          event.payload.productId,
          event.payload.storeId,
        );
      },
    );

    this.events.subscribe<PriceObservationCreatedEvent>(
      DomainEventName.PriceObservationCreated,
      async (event) => {
        if (event.payload.status !== 'FLAGGED') {
          return;
        }

        await this.jobs.enqueueRecompute(
          event.payload.productId,
          event.payload.storeId,
        );
      },
    );
  }
}
