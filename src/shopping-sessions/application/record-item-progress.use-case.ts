import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  isValidPriceCents,
  isValidQuantity,
} from '../../shopping-lists/domain/money.js';
import {
  isOpen,
  resolvePurchasedAt,
  type ShoppingSession,
  type ShoppingSessionItem,
} from '../domain/shopping-session.entity.js';
import {
  SHOPPING_SESSION_REPOSITORY,
  type ShoppingSessionRepository,
  type UpdateSessionItemInput,
} from '../domain/shopping-session.repository.port.js';
import { ShoppingSessionAccess } from './shopping-session-access.js';

export interface RecordItemProgressCommand {
  quantity?: number;
  actualUnitPriceCents?: number | null;
  isPurchased?: boolean;
  /** When the shopper marked it, from the client's clock. */
  purchasedAt?: Date;
}

/**
 * Shopping Mode's write path: tick an item, record what it actually cost,
 * adjust how many went in the trolley.
 *
 * Every field is an absolute value, so a request the client resends after a
 * dropped connection lands the same state again. A paused trip still accepts
 * changes — prices typed before pausing may only reach the server afterwards.
 * A finished trip accepts a replay of what it already holds and refuses
 * anything that would rewrite it.
 */
@Injectable()
export class RecordItemProgressUseCase {
  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
    private readonly access: ShoppingSessionAccess,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    sessionId: string,
    itemId: string,
    command: RecordItemProgressCommand,
  ): Promise<void> {
    const session = await this.access.loadOwned(sessionId, actor);
    const item = this.access.loadItem(session, itemId);

    if (command.quantity !== undefined && !isValidQuantity(command.quantity)) {
      throw new BadRequestException(
        'quantity must be positive, at most 9999, with up to three decimals',
      );
    }

    if (
      command.actualUnitPriceCents !== undefined &&
      command.actualUnitPriceCents !== null &&
      !isValidPriceCents(command.actualUnitPriceCents)
    ) {
      throw new BadRequestException(
        'actualUnitPriceCents must be a whole, non-negative number of cents',
      );
    }

    if (isOpen(session.status)) {
      const written = await this.sessions.updateItemWhileOpen(
        session.id,
        itemId,
        this.toUpdate(session, item, command),
      );

      if (written) {
        return;
      }
    }

    // Closed — either already, or by a completion that won the lock between
    // our read and our write. Re-read so the replay check sees final state.
    const closed = await this.access.loadOwned(sessionId, actor);

    if (this.changesNothing(this.access.loadItem(closed, itemId), command)) {
      return;
    }

    throw new ConflictException(
      `This shopping session is ${closed.status.toLowerCase()} and can no longer change`,
    );
  }

  private toUpdate(
    session: ShoppingSession,
    item: ShoppingSessionItem,
    command: RecordItemProgressCommand,
  ): UpdateSessionItemInput {
    const update: UpdateSessionItemInput = {
      quantity: command.quantity,
      actualUnitPriceCents: command.actualUnitPriceCents,
    };

    if (command.isPurchased === true) {
      update.isPurchased = true;
      // A replayed "purchased" without a timestamp keeps the original moment
      // instead of sliding it forward to whenever the retry arrived.
      update.purchasedAt =
        item.isPurchased && item.purchasedAt && !command.purchasedAt
          ? item.purchasedAt
          : resolvePurchasedAt(command.purchasedAt, session.startedAt, new Date());
    } else if (command.isPurchased === false) {
      update.isPurchased = false;
      update.purchasedAt = null;
    }

    return update;
  }

  private changesNothing(
    item: ShoppingSessionItem,
    command: RecordItemProgressCommand,
  ): boolean {
    return (
      (command.quantity === undefined || command.quantity === item.quantity) &&
      (command.actualUnitPriceCents === undefined ||
        command.actualUnitPriceCents === item.actualUnitPriceCents) &&
      (command.isPurchased === undefined ||
        command.isPurchased === item.isPurchased)
    );
  }
}
