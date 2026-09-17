import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import { isUniqueViolation } from '../../common/database/prisma-errors.js';
import type {
  ShoppingSession,
  ShoppingSessionStatus,
} from '../domain/shopping-session.entity.js';
import type {
  ShoppingSessionRepository,
  StartSessionInput,
  StatusChange,
  UpdateSessionItemInput,
} from '../domain/shopping-session.repository.port.js';

const SESSION_INCLUDE = {
  items: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ShoppingSessionInclude;

type SessionRow = Prisma.ShoppingSessionGetPayload<{
  include: typeof SESSION_INCLUDE;
}>;

type Tx = Prisma.TransactionClient;

const OPEN_STATUSES: ShoppingSessionStatus[] = ['ACTIVE', 'PAUSED'];

@Injectable()
export class PrismaShoppingSessionRepository implements ShoppingSessionRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findById(id: string): Promise<ShoppingSession | null> {
    const row = await this.prisma.shoppingSession.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });

    return row ? this.toDomain(row) : null;
  }

  async findByOwner(
    ownerId: string,
    filter: { status?: ShoppingSessionStatus; skip: number; take: number },
  ): Promise<{ sessions: ShoppingSession[]; totalItems: number }> {
    const where: Prisma.ShoppingSessionWhereInput = {
      ownerId,
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [rows, totalItems] = await Promise.all([
      this.prisma.shoppingSession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.shoppingSession.count({ where }),
    ]);

    return { sessions: rows.map((row) => this.toDomain(row)), totalItems };
  }

  /**
   * Locks the list row first, so two concurrent starts for one list serialize:
   * the second finds the trip the first created and returns it.
   */
  async start(
    input: StartSessionInput,
  ): Promise<{ session: ShoppingSession; created: boolean }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM shopping_lists WHERE id = ${input.listId}::uuid FOR UPDATE`;

        const open = await tx.shoppingSession.findFirst({
          where: { listId: input.listId, status: { in: OPEN_STATUSES } },
          include: SESSION_INCLUDE,
        });

        if (open) {
          return { session: this.toDomain(open), created: false };
        }

        const row = await tx.shoppingSession.create({
          data: {
            id: input.id,
            ownerId: input.ownerId,
            listId: input.listId,
            listName: input.listName,
            currency: input.currency,
            storeId: input.storeId,
            items: { create: input.items },
          },
          include: SESSION_INCLUDE,
        });

        return { session: this.toDomain(row), created: true };
      });
    } catch (error) {
      if (input.id && isUniqueViolation(error)) {
        const existing = await this.findById(input.id);
        if (existing) {
          return { session: existing, created: false };
        }
      }

      throw error;
    }
  }

  async updateItemWhileOpen(
    sessionId: string,
    itemId: string,
    input: UpdateSessionItemInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockOpen(tx, sessionId))) {
        return false;
      }

      await tx.shoppingSessionItem.update({
        where: { id: itemId, sessionId },
        data: {
          quantity: input.quantity,
          actualUnitPriceCents: input.actualUnitPriceCents,
          isPurchased: input.isPurchased,
          purchasedAt: input.purchasedAt,
        },
      });

      return true;
    });
  }

  async changeStatus(
    id: string,
    expected: ShoppingSessionStatus,
    change: StatusChange,
  ): Promise<ShoppingSession | null> {
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM shopping_sessions WHERE id = ${id}::uuid FOR UPDATE`;

      if (!locked || locked.status !== expected) {
        return null;
      }

      const row = await tx.shoppingSession.update({
        where: { id },
        data: {
          status: change.status,
          pausedAt: change.pausedAt,
          completedAt: change.completedAt,
          abandonedAt: change.abandonedAt,
        },
        include: SESSION_INCLUDE,
      });

      return this.toDomain(row);
    });
  }

  /** Takes the session's row lock and reports whether the trip is still open. */
  private async lockOpen(tx: Tx, sessionId: string): Promise<boolean> {
    const [locked] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM shopping_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;

    return (
      locked !== undefined &&
      OPEN_STATUSES.includes(locked.status as ShoppingSessionStatus)
    );
  }

  private toDomain(row: SessionRow): ShoppingSession {
    return {
      id: row.id,
      ownerId: row.ownerId,
      listId: row.listId,
      listName: row.listName,
      currency: row.currency,
      storeId: row.storeId,
      status: row.status as ShoppingSessionStatus,
      startedAt: row.startedAt,
      pausedAt: row.pausedAt,
      completedAt: row.completedAt,
      abandonedAt: row.abandonedAt,
      items: row.items.map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        sourceListItemId: item.sourceListItemId,
        productId: item.productId,
        quantity: Number(item.quantity),
        notes: item.notes,
        expectedUnitPriceCents: item.expectedUnitPriceCents,
        actualUnitPriceCents: item.actualUnitPriceCents,
        storeId: item.storeId,
        isPurchased: item.isPurchased,
        purchasedAt: item.purchasedAt,
        position: item.position,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
