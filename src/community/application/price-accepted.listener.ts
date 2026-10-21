import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../common/events/event-bus.js';
import {
  DomainEventName,
  type PriceObservationAcceptedEvent,
} from '../../common/events/event-catalog.js';
import { COMMUNITY_REPOSITORY, type CommunityRepository } from '../domain/community.port.js';
import { publicationProgress } from '../domain/store-publication.js';
import { ProductStanding } from './product-standing.js';

/**
 * Turns accepted prices into community standing: each one counts toward the
 * product's rank, and toward publishing the shop it was seen at. A shop a
 * shopper added goes public the moment its tenth product is priced.
 *
 * Imports and anonymous sources have no person behind them and count for
 * neither.
 */
@Injectable()
export class PriceAcceptedListener implements OnModuleInit {
  private readonly logger = new Logger(PriceAcceptedListener.name);

  constructor(
    private readonly events: EventBus,
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
    private readonly standing: ProductStanding,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<PriceObservationAcceptedEvent>(
      DomainEventName.PriceObservationAccepted,
      (event) => this.handle(event.payload),
    );
  }

  async handle(
    payload: { productId: string; storeId: string; userId: string | null },
    now: Date = new Date(),
  ): Promise<void> {
    if (!payload.userId) return;

    const counted = await this.community.recordContribution(payload.storeId, payload.productId, payload.userId);
    if (!counted) return; // The same person's price for the same thing here, again.

    await this.standing.refresh(payload.productId, now, true);

    const store = await this.community.storeStanding(payload.storeId);
    if (!store) return;

    const counts = await this.community.storeCounts(payload.storeId);
    const goesPublic =
      store.publishedAt === null &&
      store.moderationStatus === 'ACTIVE' &&
      publicationProgress(counts.pricedProducts).published;

    await this.community.saveStoreProgress(payload.storeId, {
      pricedProductCount: counts.pricedProducts,
      contributorCount: counts.contributors,
      ...(goesPublic ? { publishedAt: now } : {}),
    });

    if (goesPublic) {
      this.logger.log(JSON.stringify({ event: 'store.published', storeId: payload.storeId }));
      await this.community.audit({
        actorId: null,
        action: 'published',
        targetType: 'STORE',
        targetId: payload.storeId,
        note: `${counts.pricedProducts} products priced`,
      });
    }
  }
}
