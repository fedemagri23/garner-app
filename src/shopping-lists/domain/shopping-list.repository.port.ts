import type {
  ShoppingList,
  ShoppingListItem,
  ShoppingListSortMode,
} from './shopping-list.entity.js';

export interface CreateShoppingListInput {
  /** Client-generated id, so a retried create cannot make a second list. */
  id?: string;
  ownerId: string;
  name: string;
  notes: string | null;
  currency: string;
  sortMode: ShoppingListSortMode;
}

export interface UpdateShoppingListInput {
  name?: string;
  notes?: string | null;
  sortMode?: ShoppingListSortMode;
}

export interface AddShoppingListItemInput {
  id?: string;
  productId: string;
  quantity: number;
  notes: string | null;
  expectedUnitPriceCents: number | null;
  selectedStoreId: string | null;
}

export interface UpdateShoppingListItemInput {
  quantity?: number;
  notes?: string | null;
  expectedUnitPriceCents?: number | null;
  selectedStoreId?: string | null;
}

export interface CopiedItemInput {
  productId: string;
  quantity: number;
  notes: string | null;
  expectedUnitPriceCents: number | null;
  selectedStoreId: string | null;
}

/**
 * The shopping-lists module's data contract. Shopping sessions read a list
 * through this port when a trip starts; nothing outside
 * `shopping-lists/infrastructure` touches the list tables.
 */
export interface ShoppingListRepository {
  findById(id: string): Promise<ShoppingList | null>;
  findByOwner(
    ownerId: string,
    page: { skip: number; take: number },
  ): Promise<{ lists: ShoppingList[]; totalItems: number }>;
  /**
   * Creates the list, or returns the existing one when `input.id` is already
   * taken — the caller checks the owner, since a replay must be the caller's.
   */
  create(
    input: CreateShoppingListInput,
    items?: CopiedItemInput[],
  ): Promise<{ list: ShoppingList; created: boolean }>;
  update(id: string, input: UpdateShoppingListInput): Promise<ShoppingList>;
  delete(id: string): Promise<void>;
  /** Appends at the end of the manual order. Replays by id like `create`. */
  addItem(
    listId: string,
    input: AddShoppingListItemInput,
  ): Promise<{ item: ShoppingListItem; created: boolean }>;
  findItemById(itemId: string): Promise<ShoppingListItem | null>;
  updateItem(
    itemId: string,
    input: UpdateShoppingListItemInput,
  ): Promise<ShoppingListItem>;
  removeItem(itemId: string): Promise<void>;
  /** Rewrites positions to follow `orderedItemIds` exactly. */
  reorderItems(listId: string, orderedItemIds: string[]): Promise<void>;
}

export const SHOPPING_LIST_REPOSITORY = Symbol('SHOPPING_LIST_REPOSITORY');
