import { Inject, Injectable } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type DerivedPriceUpdatedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  PRICE_OBSERVATION_REPOSITORY,
  type PriceObservationRepository,
} from '../../pricing/domain/price-observation.repository.port.js';
import type { DerivedPrice } from '../domain/derived-price.entity.js';
import {
  confidenceLevel,
  confidenceScore,
} from '../domain/price-confidence.js';
import { selectUsableObservations } from '../domain/observation-selection.js';
import { weightedPrice } from '../domain/price-weighting.js';
import {
  DERIVED_PRICE_REPOSITORY,
  PRICE_CACHE,
  type DerivedPriceRepository,
  type PriceCache,
} from '../domain/price-intelligence.repository.port.js';

/** How far back observations count toward the current price. */
export const RECOMPUTE_WINDOW_DAYS = 30;

/** Bounds the work one recompute does, even for a heavily reported product. */
const MAX_OBSERVATIONS = 200;

export type RecomputeOutcome =
  | { kind: 'updated'; price: DerivedPrice }
  | { kind: 'removed' };

/**
 * Derives the current price of one product at one store from the observations
 * still in the window.
 *
 * A current price is never overwritten by the newest report: it is recomputed
 * from everything recent, weighted by source and age, with quarantined
 * observations left out. Recomputing is idempotent — same inputs, same row —
 * so retried jobs and overlapping triggers are harmless.
 */
@Injectable()
export class RecomputeDerivedPriceUseCase {
  constructor(
    @Inject(PRICE_OBSERVATION_REPOSITORY)
    private readonly observations: PriceObservationRepository,
    @Inject(DERIVED_PRICE_REPOSITORY)
    private readonly derivedPrices: DerivedPriceRepository,
    @Inject(PRICE_CACHE) private readonly cache: PriceCache,
    private readonly events: EventBus,
  ) {}

  async execute(
    productId: string,
    storeId: string,
    now: Date = new Date(),
  ): Promise<RecomputeOutcome> {
    const from = new Date(
      now.getTime() - RECOMPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const observations = await this.observations.findInWindow({
      productId,
      storeId,
      from,
      // Slightly ahead of now, so an observation carrying a device clock a few
      // minutes fast still counts.
      to: new Date(now.getTime() + 60 * 60 * 1000),
      limit: MAX_OBSERVATIONS,
    });

    const { usable } = selectUsableObservations(observations);
    const computed = weightedPrice(usable, now);
    const existing = await this.derivedPrices.find(productId, storeId);

    // Everything that shaped this price has aged out or been quarantined;
    // showing the old number would be claiming knowledge we no longer have.
    if (!computed) {
      if (existing) {
        await this.derivedPrices.remove(productId, storeId);
        await this.cache.invalidateProduct(productId);
      }

      return { kind: 'removed' };
    }

    const score = confidenceScore(computed, now);

    const price: DerivedPrice = {
      productId,
      storeId,
      // Observations of one product at one store share a currency in practice;
      // the newest usable one decides if they ever disagree.
      currency: usable[0].currency,
      priceCents: computed.priceCents,
      minPriceCents: computed.minPriceCents,
      maxPriceCents: computed.maxPriceCents,
      confidence: score,
      confidenceLevel: confidenceLevel(score, computed.lastObservedAt, now),
      observationCount: computed.observationCount,
      lastObservedAt: computed.lastObservedAt,
      computedAt: now,
    };

    await this.derivedPrices.upsert(price);
    await this.cache.invalidateProduct(productId);

    if (!existing || existing.priceCents !== price.priceCents) {
      const event: DerivedPriceUpdatedEvent = createDomainEvent(
        DomainEventName.DerivedPriceUpdated,
        {
          productId,
          storeId,
          currency: price.currency,
          priceCents: price.priceCents,
          previousPriceCents: existing?.priceCents ?? null,
          confidenceLevel: price.confidenceLevel,
        },
      );
      await this.events.publish(event);
    }

    return { kind: 'updated', price };
  }
}
