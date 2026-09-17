import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type ShoppingListCreatedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  calculateListTotals,
  duplicateListName,
  ShoppingListSortMode,
  type ShoppingList,
  type ShoppingListTotals,
} from '../domain/shopping-list.entity.js';
import {
  SHOPPING_LIST_REPOSITORY,
  type ShoppingListRepository,
} from '../domain/shopping-list.repository.port.js';
import { ShoppingListAccess } from './shopping-list-access.js';

export interface CreateShoppingListCommand {
  id?: string;
  name: string;
  notes?: string;
  currency: string;
  sortMode?: ShoppingListSortMode;
}

export interface UpdateShoppingListCommand {
  name?: string;
  notes?: string | null;
  sortMode?: ShoppingListSortMode;
}

export interface ShoppingListSummary {
  list: ShoppingList;
  totals: ShoppingListTotals;
}

/** Lifecycle of the list itself: create, rename, re-sort, duplicate, delete. */
@Injectable()
export class ManageShoppingListsUseCase {
  constructor(
    @Inject(SHOPPING_LIST_REPOSITORY)
    private readonly lists: ShoppingListRepository,
    private readonly access: ShoppingListAccess,
    private readonly events: EventBus,
  ) {}

  /**
   * A client that loses signal after sending "create" retries with the same
   * id, and gets the list it already made rather than a second copy.
   */
  async create(
    actor: AuthenticatedUser,
    command: CreateShoppingListCommand,
  ): Promise<ShoppingList> {
    const { list, created } = await this.lists.create({
      id: command.id,
      ownerId: actor.id,
      name: command.name.trim(),
      notes: command.notes?.trim() || null,
      currency: command.currency,
      sortMode: command.sortMode ?? ShoppingListSortMode.Manual,
    });

    this.assertReplayIsOwn(list, actor);

    if (created) {
      await this.publishCreated(list, null);
    }

    return list;
  }

  async listMine(
    actor: AuthenticatedUser,
    page: { skip: number; take: number },
  ): Promise<{ summaries: ShoppingListSummary[]; totalItems: number }> {
    const { lists, totalItems } = await this.lists.findByOwner(actor.id, page);

    return {
      summaries: lists.map((list) => ({
        list,
        totals: calculateListTotals(list.items),
      })),
      totalItems,
    };
  }

  async update(
    actor: AuthenticatedUser,
    listId: string,
    command: UpdateShoppingListCommand,
  ): Promise<ShoppingList> {
    await this.access.loadOwned(listId, actor);

    return this.lists.update(listId, {
      name: command.name?.trim(),
      notes:
        command.notes === undefined ? undefined : command.notes?.trim() || null,
      sortMode: command.sortMode,
    });
  }

  /**
   * Deleting a list that is already gone succeeds: a retried DELETE must not
   * turn into an error. A trip started from the list survives it, because the
   * session holds its own copy of the items.
   */
  async delete(actor: AuthenticatedUser, listId: string): Promise<void> {
    const list = await this.lists.findById(listId);

    if (!list) {
      return;
    }

    await this.access.loadOwned(listId, actor);
    await this.lists.delete(listId);
  }

  async duplicate(
    actor: AuthenticatedUser,
    sourceListId: string,
    command: { id?: string; name?: string },
  ): Promise<ShoppingList> {
    const source = await this.access.loadOwned(sourceListId, actor);

    const { list, created } = await this.lists.create(
      {
        id: command.id,
        ownerId: actor.id,
        name: command.name?.trim() || duplicateListName(source.name),
        notes: source.notes,
        currency: source.currency,
        sortMode: source.sortMode,
      },
      source.items
        .toSorted((a, b) => a.position - b.position)
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          expectedUnitPriceCents: item.expectedUnitPriceCents,
          selectedStoreId: item.selectedStoreId,
        })),
    );

    this.assertReplayIsOwn(list, actor);

    if (created) {
      await this.publishCreated(list, source.id);
    }

    return list;
  }

  /**
   * A client-supplied id that already names someone else's list is not a
   * replay. Refused without saying whose it is.
   */
  private assertReplayIsOwn(list: ShoppingList, actor: AuthenticatedUser): void {
    if (list.ownerId !== actor.id) {
      throw new ConflictException('This id is already in use');
    }
  }

  private async publishCreated(
    list: ShoppingList,
    duplicatedFromListId: string | null,
  ): Promise<void> {
    const event: ShoppingListCreatedEvent = createDomainEvent(
      DomainEventName.ShoppingListCreated,
      { listId: list.id, ownerId: list.ownerId, duplicatedFromListId },
    );
    await this.events.publish(event);
  }
}
