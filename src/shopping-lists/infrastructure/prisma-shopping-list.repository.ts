import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import { isUniqueViolation } from '../../common/database/prisma-errors.js';
import type {
  ShoppingList,
  ShoppingListItem,
  ShoppingListSortMode,
} from '../domain/shopping-list.entity.js';
import type {
  AddShoppingListItemInput,
  CopiedItemInput,
  CreateShoppingListInput,
  ShoppingListRepository,
  UpdateShoppingListInput,
  UpdateShoppingListItemInput,
} from '../domain/shopping-list.repository.port.js';

const LIST_INCLUDE = {
  items: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ShoppingListInclude;

type ListRow = Prisma.ShoppingListGetPayload<{ include: typeof LIST_INCLUDE }>;
type ItemRow = ListRow['items'][number];

/** Gap between positions, so a future insert-between needs no renumbering. */
const POSITION_STEP = 1000;

@Injectable()
export class PrismaShoppingListRepository implements ShoppingListRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findById(id: string): Promise<ShoppingList | null> {
    const row = await this.prisma.shoppingList.findUnique({
      where: { id },
      include: LIST_INCLUDE,
    });

    return row ? this.toDomain(row) : null;
  }

  async findByOwner(
    ownerId: string,
    page: { skip: number; take: number },
  ): Promise<{ lists: ShoppingList[]; totalItems: number }> {
    const where = { ownerId };

    const [rows, totalItems] = await Promise.all([
      this.prisma.shoppingList.findMany({
        where,
        include: LIST_INCLUDE,
        // Most recently touched first: the list being worked on is at the top.
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.shoppingList.count({ where }),
    ]);

    return { lists: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async create(
    input: CreateShoppingListInput,
    items: CopiedItemInput[] = [],
  ): Promise<{ list: ShoppingList; created: boolean }> {
    if (input.id) {
      const existing = await this.findById(input.id);
      if (existing) {
        return { list: existing, created: false };
      }
    }

    try {
      const row = await this.prisma.shoppingList.create({
        data: {
          id: input.id,
          ownerId: input.ownerId,
          name: input.name,
          notes: input.notes,
          currency: input.currency,
          sortMode: input.sortMode,
          items: {
            create: items.map((item, index) => ({
              productId: item.productId,
              quantity: item.quantity,
              notes: item.notes,
              expectedUnitPriceCents: item.expectedUnitPriceCents,
              selectedStoreId: item.selectedStoreId,
              position: (index + 1) * POSITION_STEP,
            })),
          },
        },
        include: LIST_INCLUDE,
      });

      return { list: this.toDomain(row), created: true };
    } catch (error) {
      // Two retries of the same create racing each other: the loser reads
      // what the winner wrote.
      if (input.id && isUniqueViolation(error)) {
        const existing = await this.findById(input.id);
        if (existing) {
          return { list: existing, created: false };
        }
      }

      throw error;
    }
  }

  async update(id: string, input: UpdateShoppingListInput): Promise<ShoppingList> {
    const row = await this.prisma.shoppingList.update({
      where: { id },
      data: { name: input.name, notes: input.notes, sortMode: input.sortMode },
      include: LIST_INCLUDE,
    });

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // deleteMany rather than delete: a concurrent delete that got there first
    // is not an error.
    await this.prisma.shoppingList.deleteMany({ where: { id } });
  }

  async addItem(
    listId: string,
    input: AddShoppingListItemInput,
  ): Promise<{ item: ShoppingListItem; created: boolean }> {
    if (input.id) {
      const existing = await this.findItemById(input.id);
      if (existing) {
        return { item: existing, created: false };
      }
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const last = await tx.shoppingListItem.aggregate({
          where: { listId },
          _max: { position: true },
        });

        const item = await tx.shoppingListItem.create({
          data: {
            id: input.id,
            listId,
            productId: input.productId,
            quantity: input.quantity,
            notes: input.notes,
            expectedUnitPriceCents: input.expectedUnitPriceCents,
            selectedStoreId: input.selectedStoreId,
            position: (last._max.position ?? 0) + POSITION_STEP,
          },
        });

        // Adding an item is a change to the list, and lists sort by recency.
        await tx.shoppingList.update({
          where: { id: listId },
          data: { updatedAt: new Date() },
        });

        return item;
      });

      return { item: this.itemToDomain(row), created: true };
    } catch (error) {
      if (input.id && isUniqueViolation(error)) {
        const existing = await this.findItemById(input.id);
        if (existing) {
          return { item: existing, created: false };
        }
      }

      throw error;
    }
  }

  async findItemById(itemId: string): Promise<ShoppingListItem | null> {
    const row = await this.prisma.shoppingListItem.findUnique({
      where: { id: itemId },
    });

    return row ? this.itemToDomain(row) : null;
  }

  async updateItem(
    itemId: string,
    input: UpdateShoppingListItemInput,
  ): Promise<ShoppingListItem> {
    const row = await this.prisma.shoppingListItem.update({
      where: { id: itemId },
      data: {
        quantity: input.quantity,
        notes: input.notes,
        expectedUnitPriceCents: input.expectedUnitPriceCents,
        selectedStoreId: input.selectedStoreId,
      },
    });

    return this.itemToDomain(row);
  }

  async removeItem(itemId: string): Promise<void> {
    await this.prisma.shoppingListItem.deleteMany({ where: { id: itemId } });
  }

  async reorderItems(listId: string, orderedItemIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedItemIds.map((id, index) =>
        this.prisma.shoppingListItem.updateMany({
          where: { id, listId },
          data: { position: (index + 1) * POSITION_STEP },
        }),
      ),
    );
  }

  private toDomain(row: ListRow): ShoppingList {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      notes: row.notes,
      currency: row.currency,
      sortMode: row.sortMode as ShoppingListSortMode,
      items: row.items.map((item) => this.itemToDomain(item)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private itemToDomain(row: ItemRow): ShoppingListItem {
    return {
      id: row.id,
      listId: row.listId,
      productId: row.productId,
      quantity: Number(row.quantity),
      notes: row.notes,
      expectedUnitPriceCents: row.expectedUnitPriceCents,
      selectedStoreId: row.selectedStoreId,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
