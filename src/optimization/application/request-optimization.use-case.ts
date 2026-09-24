import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type OptimizationRequestedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { ShoppingListAccess } from '../../shopping-lists/application/shopping-list-access.js';
import {
  fingerprintOf,
  isReusable,
  type OptimizationRequest,
  type OptimizationSettings,
} from '../domain/optimization-request.entity.js';
import {
  OPTIMIZATION_JOBS,
  OPTIMIZATION_REQUEST_REPOSITORY,
  type OptimizationJobs,
  type OptimizationRequestRepository,
} from '../domain/optimization.repository.port.js';
import { MAX_STORES_HARD_LIMIT } from '../domain/optimizer.js';
import { OptimizationPreferencesUseCase } from './optimization-preferences.use-case.js';

export interface RequestOptimizationCommand {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  maxStores?: number;
  maxAdditionalDistanceKm?: number;
  maxAdditionalMinutes?: number;
  minSavingsCentsPerExtraStore?: number;
  mode?: OptimizationSettings['mode'];
  preferredSupermarketIds?: string[];
  excludedSupermarketIds?: string[];
}

export interface RequestOptimizationResult {
  request: OptimizationRequest;
  /** True when a recent answer to the same question was returned as-is. */
  reused: boolean;
}

/**
 * Asks "where should I buy this list?".
 *
 * The answer is computed in the background: the API accepts the question and
 * returns immediately, because the shopper should not wait on a combinatorial
 * search — and because the same question asked twice should not be computed
 * twice.
 */
@Injectable()
export class RequestOptimizationUseCase {
  constructor(
    @Inject(OPTIMIZATION_REQUEST_REPOSITORY)
    private readonly requests: OptimizationRequestRepository,
    @Inject(OPTIMIZATION_JOBS) private readonly jobs: OptimizationJobs,
    private readonly lists: ShoppingListAccess,
    private readonly preferences: OptimizationPreferencesUseCase,
    private readonly events: EventBus,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    listId: string,
    command: RequestOptimizationCommand,
  ): Promise<RequestOptimizationResult> {
    const list = await this.lists.loadOwned(listId, actor);

    if (list.items.length === 0) {
      throw new ConflictException('There is nothing on this list to optimize');
    }

    const settings = await this.resolveSettings(actor, command);

    const fingerprint = fingerprintOf({
      listId,
      items: list.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      settings,
    });

    const existing = await this.requests.findReusable(listId, fingerprint);

    if (existing && isReusable(existing, new Date())) {
      return { request: existing, reused: true };
    }

    const request = await this.requests.create({
      ownerId: actor.id,
      listId,
      settings,
      fingerprint,
    });

    const event: OptimizationRequestedEvent = createDomainEvent(
      DomainEventName.OptimizationRequested,
      {
        requestId: request.id,
        ownerId: actor.id,
        listId,
        mode: settings.mode,
      },
    );
    await this.events.publish(event);

    await this.jobs.enqueue(request.id);

    return { request, reused: false };
  }

  /** The shopper's standing preferences, with this request's overrides on top. */
  private async resolveSettings(
    actor: AuthenticatedUser,
    command: RequestOptimizationCommand,
  ): Promise<OptimizationSettings> {
    const preferences = await this.preferences.get(actor);

    return {
      latitude: command.latitude,
      longitude: command.longitude,
      radiusKm: command.radiusKm ?? 10,
      maxStores: Math.min(
        command.maxStores ?? preferences.maxStores,
        MAX_STORES_HARD_LIMIT,
      ),
      maxAdditionalDistanceKm:
        command.maxAdditionalDistanceKm ?? preferences.maxAdditionalDistanceKm,
      maxAdditionalMinutes:
        command.maxAdditionalMinutes ?? preferences.maxAdditionalMinutes,
      minSavingsCentsPerExtraStore:
        command.minSavingsCentsPerExtraStore ??
        preferences.minSavingsCentsPerExtraStore,
      mode: command.mode ?? preferences.mode,
      preferredSupermarketIds:
        command.preferredSupermarketIds ?? preferences.preferredSupermarketIds,
      excludedSupermarketIds:
        command.excludedSupermarketIds ?? preferences.excludedSupermarketIds,
    };
  }
}
