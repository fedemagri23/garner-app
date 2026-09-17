import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type ShoppingSessionStartedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
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
}

/**
 * Starts a trip from a list, copying its items so the trip records what was
 * actually planned when the shopper walked in.
 *
 * Starting is idempotent twice over: a retry with the same client id returns
 * that session, and starting a list that already has a trip in progress
 * returns the trip in progress. A shopper tapping "Start" on a flaky
 * connection ends up with one trip, not several.
 */
@Injectable()
export class StartShoppingSessionUseCase {
  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
    private readonly lists: ShoppingListAccess,
    private readonly catalog: CatalogReferences,
    private readonly events: EventBus,
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

    if (command.storeId) {
      await this.catalog.requireStore(command.storeId);
    }

    const { session, created } = await this.sessions.start({
      id: command.id,
      ownerId: actor.id,
      listId: list.id,
      listName: list.name,
      currency: list.currency,
      storeId: command.storeId ?? null,
      items: list.items
        .toSorted((a, b) => a.position - b.position)
        .map((item) => ({
          sourceListItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          expectedUnitPriceCents: item.expectedUnitPriceCents,
          // Shopping a single store means every line is bought there, whatever
          // store each item had been pencilled in for.
          storeId: command.storeId ?? item.selectedStoreId,
          position: item.position,
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
}
