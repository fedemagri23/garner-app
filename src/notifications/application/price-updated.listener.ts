import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  DomainEventName,
  type DerivedPriceUpdatedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  NOTIFICATION_JOBS,
  type NotificationJobs,
} from '../domain/notification.repository.port.js';

/**
 * Turns a price change into queued alert work.
 *
 * Only enqueues: whoever caused the price to change — a shopper finishing a
 * trip, a supermarket import — must not wait while other people's alerts are
 * evaluated.
 */
@Injectable()
export class PriceUpdatedListener implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    @Inject(NOTIFICATION_JOBS) private readonly jobs: NotificationJobs,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<DerivedPriceUpdatedEvent>(
      DomainEventName.DerivedPriceUpdated,
      async (event) => {
        await this.jobs.enqueueEvaluation({
          productId: event.payload.productId,
          storeId: event.payload.storeId,
          priceCents: event.payload.priceCents,
          previousPriceCents: event.payload.previousPriceCents,
        });
      },
    );
  }
}
