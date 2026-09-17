import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type ShoppingListItemAddedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { isValidPriceCents, isValidQuantity } from '../domain/money.js';
import {
  MAX_ITEMS_PER_LIST,
  type ShoppingListItem,
} from '../domain/shopping-list.entity.js';
import {
  SHOPPING_LIST_REPOSITORY,
  type ShoppingListRepository,
} from '../domain/shopping-list.repository.port.js';
import { CatalogReferences } from './catalog-references.js';
import { ShoppingListAccess } from './shopping-list-access.js';

export interface AddListItemCommand {
  id?: string;
  productId: string;
  quantity: number;
  notes?: string;
  expectedUnitPriceCents?: number;
  selectedStoreId?: string;
}

export interface UpdateListItemCommand {
  quantity?: number;
  notes?: string | null;
  expectedUnitPriceCents?: number | null;
  selectedStoreId?: string | null;
}

/** Everything done to the items of a list. */
@Injectable()
export class ManageListItemsUseCase {
  constructor(
    @Inject(SHOPPING_LIST_REPOSITORY)
    private readonly lists: ShoppingListRepository,
    private readonly access: ShoppingListAccess,
    private readonly catalog: CatalogReferences,
    private readonly events: EventBus,
  ) {}

  async add(
    actor: AuthenticatedUser,
    listId: string,
    command: AddListItemCommand,
  ): Promise<ShoppingListItem> {
    const list = await this.access.loadOwned(listId, actor);

    // A replay of an add that already landed returns the item before any
    // other check — the list may have filled up since the first attempt.
    if (command.id) {
      const existing = list.items.find((item) => item.id === command.id);
      if (existing) {
        return existing;
      }
    }

    if (list.items.length >= MAX_ITEMS_PER_LIST) {
      throw new UnprocessableEntityException(
        `A list can hold at most ${MAX_ITEMS_PER_LIST} items`,
      );
    }

    this.assertQuantity(command.quantity);
    this.assertPrice(command.expectedUnitPriceCents);

    await this.catalog.requirePurchasableProduct(command.productId);
    if (command.selectedStoreId) {
      await this.catalog.requireStore(command.selectedStoreId);
    }

    const { item, created } = await this.lists.addItem(listId, {
      id: command.id,
      productId: command.productId,
      quantity: command.quantity,
      notes: command.notes?.trim() || null,
      expectedUnitPriceCents: command.expectedUnitPriceCents ?? null,
      selectedStoreId: command.selectedStoreId ?? null,
    });

    // The id was taken by an item somewhere else — not a replay of this add.
    if (item.listId !== listId) {
      throw new ConflictException('This id is already in use');
    }

    if (created) {
      const event: ShoppingListItemAddedEvent = createDomainEvent(
        DomainEventName.ShoppingListItemAdded,
        {
          listId,
          itemId: item.id,
          ownerId: list.ownerId,
          productId: item.productId,
        },
      );
      await this.events.publish(event);
    }

    return item;
  }

  /** Values are absolute, not deltas, so sending the same update twice is harmless. */
  async update(
    actor: AuthenticatedUser,
    listId: string,
    itemId: string,
    command: UpdateListItemCommand,
  ): Promise<ShoppingListItem> {
    const list = await this.access.loadOwned(listId, actor);
    this.access.loadItem(list, itemId);

    if (command.quantity !== undefined) {
      this.assertQuantity(command.quantity);
    }
    this.assertPrice(command.expectedUnitPriceCents);

    if (command.selectedStoreId) {
      await this.catalog.requireStore(command.selectedStoreId);
    }

    return this.lists.updateItem(itemId, {
      quantity: command.quantity,
      notes:
        command.notes === undefined ? undefined : command.notes?.trim() || null,
      expectedUnitPriceCents: command.expectedUnitPriceCents,
      selectedStoreId: command.selectedStoreId,
    });
  }

  /** Removing an item that is already gone succeeds, so a retried DELETE does too. */
  async remove(
    actor: AuthenticatedUser,
    listId: string,
    itemId: string,
  ): Promise<void> {
    const list = await this.access.loadOwned(listId, actor);

    if (!list.items.some((item) => item.id === itemId)) {
      return;
    }

    await this.lists.removeItem(itemId);
  }

  /**
   * Sets the manual order. The request must name every item exactly once: a
   * partial order would leave the unnamed items with no defined place.
   */
  async reorder(
    actor: AuthenticatedUser,
    listId: string,
    orderedItemIds: string[],
  ): Promise<void> {
    const list = await this.access.loadOwned(listId, actor);

    const current = new Set(list.items.map((item) => item.id));
    const requested = new Set(orderedItemIds);

    const isPermutation =
      requested.size === orderedItemIds.length &&
      requested.size === current.size &&
      orderedItemIds.every((id) => current.has(id));

    if (!isPermutation) {
      throw new BadRequestException(
        'itemIds must list every item of the shopping list exactly once',
      );
    }

    await this.lists.reorderItems(listId, orderedItemIds);
  }

  private assertQuantity(quantity: number): void {
    if (!isValidQuantity(quantity)) {
      throw new BadRequestException(
        'quantity must be positive, at most 9999, with up to three decimals',
      );
    }
  }

  private assertPrice(cents: number | null | undefined): void {
    if (cents !== null && cents !== undefined && !isValidPriceCents(cents)) {
      throw new BadRequestException(
        'expectedUnitPriceCents must be a whole, non-negative number of cents',
      );
    }
  }
}
