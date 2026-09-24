import { Inject, Injectable, Logger } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type OptimizationCompletedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  DERIVED_PRICE_REPOSITORY,
  type DerivedPriceRepository,
} from '../../price-intelligence/domain/price-intelligence.repository.port.js';
import {
  SHOPPING_LIST_REPOSITORY,
  type ShoppingListRepository,
} from '../../shopping-lists/domain/shopping-list.repository.port.js';
import { boundingBox, haversineKm } from '../../supermarkets/domain/geo.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import type { OptimizationRequest } from '../domain/optimization-request.entity.js';
import {
  OPTIMIZATION_REQUEST_REPOSITORY,
  type OptimizationRequestRepository,
} from '../domain/optimization.repository.port.js';
import { optimize } from '../domain/optimizer.js';
import type { CandidateStore } from '../domain/plan.js';

/** Stores pulled from the box before the radius filter narrows them. */
const STORE_CANDIDATE_LIMIT = 200;

export type RunOptimizationOutcome =
  | { kind: 'completed'; request: OptimizationRequest }
  | { kind: 'already-handled' }
  | { kind: 'failed'; error: string };

/**
 * Computes one optimization, in a worker.
 *
 * Prices come from derived price intelligence, never from raw observations:
 * a recommendation must rest on what a product costs, weighed across
 * contributors, rather than on whatever the last person to report happened to
 * type.
 *
 * Safe to retry: a request is claimed out of PENDING before any work, so a
 * duplicated job finds nothing to do, and a failed attempt releases the
 * request for the next one.
 */
@Injectable()
export class RunOptimizationUseCase {
  private readonly logger = new Logger(RunOptimizationUseCase.name);

  constructor(
    @Inject(OPTIMIZATION_REQUEST_REPOSITORY)
    private readonly requests: OptimizationRequestRepository,
    @Inject(SHOPPING_LIST_REPOSITORY)
    private readonly lists: ShoppingListRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
    @Inject(DERIVED_PRICE_REPOSITORY)
    private readonly prices: DerivedPriceRepository,
    private readonly events: EventBus,
  ) {}

  async execute(requestId: string): Promise<RunOptimizationOutcome> {
    const request = await this.requests.findById(requestId);

    if (!request || request.status !== 'PENDING') {
      return { kind: 'already-handled' };
    }

    if (!(await this.requests.claim(requestId, new Date()))) {
      // Another worker got there first.
      return { kind: 'already-handled' };
    }

    try {
      const completed = await this.compute(request);

      // A request that could not be answered at all — its list is gone — is
      // recorded as failed, and nothing is announced as completed.
      if (completed.status === 'FAILED') {
        return { kind: 'failed', error: completed.error ?? 'Optimization failed' };
      }

      const recommended = completed.result?.[modeKey(request)] ?? null;

      const event: OptimizationCompletedEvent = createDomainEvent(
        DomainEventName.OptimizationCompleted,
        {
          requestId,
          ownerId: request.ownerId,
          listId: request.listId,
          mode: request.settings.mode,
          recommendedTotalCents: recommended?.totalCents ?? null,
          storeCount: recommended?.stores.length ?? null,
        },
      );
      await this.events.publish(event);

      return { kind: 'completed', request: completed };
    } catch (failure) {
      const error = failure instanceof Error ? failure.message : String(failure);
      this.logger.error(`Optimization ${requestId} failed: ${error}`);

      // Released rather than marked failed: the job will retry, and only its
      // last attempt records a failure the shopper can see.
      await this.requests.release(requestId);
      throw failure;
    }
  }

  /** Called by the worker once its retries are spent. */
  async giveUp(requestId: string, error: string): Promise<void> {
    await this.requests.fail(requestId, error);
  }

  private async compute(
    request: OptimizationRequest,
  ): Promise<OptimizationRequest> {
    const list = request.listId
      ? await this.lists.findById(request.listId)
      : null;

    if (!list) {
      return this.requests.fail(
        request.id,
        'The shopping list no longer exists',
      );
    }

    const items = list.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    const stores = await this.candidateStores(request, items.map((item) => item.productId));

    const result = optimize({
      items,
      stores,
      home: {
        latitude: request.settings.latitude,
        longitude: request.settings.longitude,
      },
      constraints: request.settings,
    });

    const recommended = result[modeKey(request)];

    return this.requests.complete(request.id, {
      result,
      recommendedTotalCents: recommended?.totalCents ?? null,
      recommendedStoreCount: recommended?.stores.length ?? null,
    });
  }

  /**
   * The stores within reach, each with what it charges for the list. A store
   * with no price for anything on the list is dropped here rather than
   * multiplying the combinations the optimizer walks.
   */
  private async candidateStores(
    request: OptimizationRequest,
    productIds: string[],
  ): Promise<CandidateStore[]> {
    const home = {
      latitude: request.settings.latitude,
      longitude: request.settings.longitude,
    };

    const nearby = await this.stores.findWithinBox(
      boundingBox(home, request.settings.radiusKm),
      STORE_CANDIDATE_LIMIT,
    );

    const withinRadius = nearby
      .map((store) => ({
        store,
        distanceKm: haversineKm(home, {
          latitude: store.latitude,
          longitude: store.longitude,
        }),
      }))
      .filter((entry) => entry.distanceKm <= request.settings.radiusKm);

    const prices = await this.prices.findForProductsAtStores(
      productIds,
      withinRadius.map((entry) => entry.store.id),
    );

    const pricesByStore = new Map<string, Map<string, number>>();

    for (const price of prices) {
      const forStore = pricesByStore.get(price.storeId) ?? new Map();
      forStore.set(price.productId, price.priceCents);
      pricesByStore.set(price.storeId, forStore);
    }

    return withinRadius.flatMap(({ store, distanceKm }) => {
      const storePrices = pricesByStore.get(store.id);

      if (!storePrices) {
        return [];
      }

      return [
        {
          storeId: store.id,
          supermarketId: store.supermarketId,
          latitude: store.latitude,
          longitude: store.longitude,
          distanceKm,
          prices: storePrices,
        },
      ];
    });
  }
}

/** Which of the three alternatives this request treats as its recommendation. */
function modeKey(
  request: OptimizationRequest,
): 'cheapest' | 'bestBalance' | 'simplest' {
  switch (request.settings.mode) {
    case 'CHEAPEST':
      return 'cheapest';
    case 'SIMPLEST':
      return 'simplest';
    default:
      return 'bestBalance';
  }
}
