import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type ShoppingSessionStartedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  OPTIMIZATION_REQUEST_REPOSITORY,
  type OptimizationRequestRepository,
} from '../../optimization/domain/optimization.repository.port.js';
import type { Plan } from '../../optimization/domain/plan.js';
import type { OptimizationMode } from '../../optimization/domain/scoring.js';
import {
  DERIVED_PRICE_REPOSITORY,
  type DerivedPriceRepository,
} from '../../price-intelligence/domain/price-intelligence.repository.port.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CatalogReferences } from '../../shopping-lists/application/catalog-references.js';
import { ShoppingListAccess } from '../../shopping-lists/application/shopping-list-access.js';
import type { ShoppingSession } from '../domain/shopping-session.entity.js';
import {
  SHOPPING_SESSION_REPOSITORY,
  type ShoppingSessionRepository,
} from '../domain/shopping-session.repository.port.js';

export interface StartShoppingSessionCommand {
  id?: string;
  listId: string;
  storeId?: string;
  /** A finished plan for this list: each line goes to the store it chose. */
  optimizationId?: string;
  /** Which of the plan's alternatives; its recommendation when omitted. */
  mode?: OptimizationMode;
}

/** Where a planned product is bought, and for how much. */
interface PlannedLine {
  storeId: string;
  unitPriceCents: number;
  stopOrder: number;
}

/**
 * Starts a trip from a list, copying its items so the trip records what was
 * actually planned when the shopper walked in.
 *
 * Starting is idempotent twice over: a retry with the same client id returns
 * that session, and starting a list that already has a trip in progress
 * returns the trip in progress. A shopper tapping "Start" on a flaky
 * connection ends up with one trip, not several.
 *
 * Started from a plan, each line takes the plan's store and unit price, and
 * the lines follow the route: everything for the first stop, then the next.
 */
@Injectable()
export class StartShoppingSessionUseCase {
  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
    private readonly lists: ShoppingListAccess,
    private readonly catalog: CatalogReferences,
    @Inject(OPTIMIZATION_REQUEST_REPOSITORY)
    private readonly optimizations: OptimizationRequestRepository,
    private readonly events: EventBus,
    @Inject(DERIVED_PRICE_REPOSITORY)
    private readonly prices: DerivedPriceRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    command: StartShoppingSessionCommand,
  ): Promise<ShoppingSession> {
    if (command.id) {
      const replay = await this.sessions.findById(command.id);

      if (replay) {
        // The list may have been deleted since the first attempt, leaving the
        // session's listId null; that is still a replay of the same start.
        const sameList =
          replay.listId === null || replay.listId === command.listId;

        if (replay.ownerId !== actor.id || !sameList) {
          throw new ConflictException('This id is already in use');
        }
        return replay;
      }
    }

    const list = await this.lists.loadOwned(command.listId, actor);

    if (list.items.length === 0) {
      throw new ConflictException(
        'Cannot start a shopping session from an empty list',
      );
    }

    if (command.storeId && command.optimizationId) {
      throw new BadRequestException(
        'Shop one store or follow a plan, not both',
      );
    }

    if (command.storeId) {
      await this.catalog.requireStore(command.storeId);
    }

    const planned = command.optimizationId
      ? await this.plannedLines(actor, list.id, command.optimizationId, command.mode)
      : new Map<string, PlannedLine>();
    const atStore = command.storeId
      ? await this.pricesAt(command.storeId, list.currency, list.items.map((item) => item.productId))
      : new Map<string, number>();

    const { session, created } = await this.sessions.start({
      id: command.id,
      ownerId: actor.id,
      listId: list.id,
      listName: list.name,
      currency: list.currency,
      storeId: command.storeId ?? null,
      items: list.items
        .map((item) => ({ item, plan: planned.get(item.productId) }))
        // Route order first (what the plan could not place goes last), then
        // the list's own order.
        .toSorted(
          (a, b) =>
            (a.plan?.stopOrder ?? Infinity) - (b.plan?.stopOrder ?? Infinity) ||
            a.item.position - b.item.position,
        )
        .map(({ item, plan }, index) => ({
          sourceListItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          // At one store, what that store charges; the list's estimate where it has no price.
          expectedUnitPriceCents:
            plan?.unitPriceCents ?? atStore.get(item.productId) ?? item.expectedUnitPriceCents,
          // Shopping a single store means every line is bought there, whatever
          // store each item had been pencilled in for.
          storeId: command.storeId ?? plan?.storeId ?? item.selectedStoreId,
          position: planned.size > 0 ? (index + 1) * 1000 : item.position,
        })),
    });

    if (created) {
      const event: ShoppingSessionStartedEvent = createDomainEvent(
        DomainEventName.ShoppingSessionStarted,
        {
          sessionId: session.id,
          ownerId: session.ownerId,
          listId: list.id,
          storeId: session.storeId,
        },
      );
      await this.events.publish(event);
    }

    return session;
  }

  /** What the store currently charges for each product, in the list's currency. */
  private async pricesAt(storeId: string, currency: string, productIds: string[]): Promise<Map<string, number>> {
    const prices = await this.prices.findForProductsAtStores([...new Set(productIds)], [storeId]);
    return new Map(
      prices.filter((price) => price.currency === currency).map((price) => [price.productId, price.priceCents]),
    );
  }

  /** The chosen plan's store and price for each product it places. */
  private async plannedLines(
    actor: AuthenticatedUser,
    listId: string,
    optimizationId: string,
    mode: OptimizationMode | undefined,
  ): Promise<Map<string, PlannedLine>> {
    const optimization = await this.optimizations.findById(optimizationId);

    if (!optimization || optimization.ownerId !== actor.id) {
      throw new NotFoundException('Optimization not found');
    }
    if (optimization.listId !== listId) {
      throw new ConflictException('That plan is for another list');
    }
    if (optimization.status !== 'COMPLETED' || !optimization.result) {
      throw new ConflictException('That plan is not ready yet');
    }

    const chosen = mode ?? optimization.settings.mode;
    const plan: Plan | null =
      chosen === 'CHEAPEST'
        ? optimization.result.cheapest
        : chosen === 'SIMPLEST'
          ? optimization.result.simplest
          : optimization.result.bestBalance;

    if (!plan) {
      throw new ConflictException('That plan has nothing to buy');
    }

    const lines = new Map<string, PlannedLine>();
    for (const stop of plan.stores) {
      for (const assignment of stop.assignments) {
        lines.set(assignment.productId, {
          storeId: stop.storeId,
          unitPriceCents: assignment.unitPriceCents,
          stopOrder: stop.order,
        });
      }
    }
    return lines;
  }
}
