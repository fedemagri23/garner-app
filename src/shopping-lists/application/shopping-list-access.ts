import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertOwnership,
  type AuthenticatedUser,
} from '../../security/domain/authenticated-user.js';
import type {
  ShoppingList,
  ShoppingListItem,
} from '../domain/shopping-list.entity.js';
import {
  SHOPPING_LIST_REPOSITORY,
  type ShoppingListRepository,
} from '../domain/shopping-list.repository.port.js';

/**
 * The one way use cases load a list: it must exist, and the caller must own it.
 * Centralized so no single endpoint can forget the ownership half.
 */
@Injectable()
export class ShoppingListAccess {
  constructor(
    @Inject(SHOPPING_LIST_REPOSITORY)
    private readonly lists: ShoppingListRepository,
  ) {}

  async loadOwned(
    listId: string,
    actor: AuthenticatedUser,
  ): Promise<ShoppingList> {
    const list = await this.lists.findById(listId);

    if (!list) {
      throw new NotFoundException('Shopping list not found');
    }

    assertOwnership(list.ownerId, actor);
    return list;
  }

  /** An item is reached through its list, so owning the list is what grants access. */
  loadItem(list: ShoppingList, itemId: string): ShoppingListItem {
    const item = list.items.find((candidate) => candidate.id === itemId);

    if (!item) {
      throw new NotFoundException('Shopping list item not found');
    }

    return item;
  }
}
